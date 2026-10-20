// Postgres / PostgREST errors → plain words for staff. The database raises friendly messages
// itself (22023, 42501 from our functions), so those pass through.

export type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function text(e: DbError) {
  return `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
}

/** Name of the constraint/index mentioned in the error, if any. */
export function constraintName(e: DbError | null | undefined): string | null {
  if (!e) return null;
  const m = text(e).match(/constraint "([^"]+)"/) ?? text(e).match(/index "([^"]+)"/);
  if (m) return m[1];
  const known = ["products_barcode_key", "products_barcode_check", "categories_name_key"];
  return known.find((k) => text(e).includes(k)) ?? null;
}

export function friendlyError(e: DbError | null | undefined): string {
  if (!e) return "Something went wrong. Please try again.";
  const c = constraintName(e);
  const msg = (e.message ?? "").trim();

  switch (e.code) {
    case "23505":
      if (c === "products_barcode_key") return "Another product already has that barcode.";
      if (c === "categories_name_key") return "That category already exists.";
      return "That's already saved.";
    case "23514":
      if (c === "products_barcode_check") return "Barcodes use letters, numbers, . - and _ only.";
      return "Some details aren't valid. Check the form and try again.";
    case "22023":
      return msg || "Some details aren't valid.";
    case "23502":
      return "A required field is missing.";
    case "23503":
      return "That record is linked to something that no longer exists.";
    case "42501":
      // Our own functions raise plain-English reasons; Postgres' own wording starts "permission denied".
      if (msg && !/^permission denied|row-level security/i.test(msg)) return msg;
      return "You don't have permission to do that. Ask the owner to check your account.";
    case "P0002":
      return msg || "Not found.";
    case "PGRST202": // function not found
    case "42883":
    case "PGRST205": // table or view not found
    case "42P01":
      return "The database is missing an update. Apply the migrations in supabase/migrations (see the README).";
    case "PGRST116":
      return "Not found. It may have been deleted.";
    case "22P02":
      return "That value isn't in the right format.";
    case "57014":
      return "That took too long. Please try again.";
  }
  if (/fetch|network|Failed to fetch|ECONN|ETIMEDOUT/i.test(msg)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (/JWT|not authenticated|Auth session missing/i.test(msg)) {
    return "Your session expired. Sign in again.";
  }
  return "Something went wrong. Please try again.";
}
