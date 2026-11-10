// Product photos: the public product-photos bucket in Supabase Storage, one object per photo at
// <product id>/<file name>. Public so the register's tiles load from the browser cache; uploading
// and removing are staff-only (storage policies in supabase/migrations/).

export const PHOTO_BUCKET = "product-photos";

/** Public URL of a stored photo, or null when the product has none. */
export function photoUrl(path: string | null | undefined) {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${encoded}`;
}

/**
 * A small copy of a stored photo, resized by Vercel's image service and cached near the shop.
 * A thumbnail is a few KB instead of the 100–300 KB original from Supabase (US East).
 * Widths must be one of Next's image sizes: 128 for list thumbnails, 384 for register tiles.
 */
export function photoThumb(path: string | null | undefined, width: 128 | 384) {
  const src = photoUrl(path);
  return src && `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}
