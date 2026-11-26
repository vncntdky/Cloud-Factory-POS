// Batches to pick from when a stock change is recorded: every restock, count and loss belongs to one.
import type { ServerSupabase } from "@/lib/auth";
import { formatManilaDate } from "@/lib/time";

export type BatchOption = { id: string; label: string };

/**
 * Every batch that has arrived, newest first, labelled "Batch 3 · Supplier · 9 Nov". An order still on the way
 * can't take stock until it arrives. Owners and managers.
 */
export async function loadBatchOptions(supabase: ServerSupabase): Promise<BatchOption[]> {
  const { data } = await supabase
    .from("stock_batches")
    .select("id, batch_no, supplier, received_on")
    .not("received_on", "is", null)
    .order("received_on", { ascending: false })
    .order("batch_no", { ascending: false });
  return ((data ?? []) as { id: string; batch_no: number; supplier: string | null; received_on: string }[]).map((b) => ({
    id: b.id,
    label: [`Batch ${b.batch_no}`, b.supplier, formatManilaDate(b.received_on)].filter(Boolean).join(" · "),
  }));
}

/** The batch a product last came in with (opening stock or a restock), if any. */
export async function lastBatchOf(supabase: ServerSupabase, productId: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_movements")
    .select("batch_id")
    .eq("product_id", productId)
    .in("kind", ["opening", "restock"])
    .not("batch_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { batch_id: string } | null)?.batch_id ?? null;
}
