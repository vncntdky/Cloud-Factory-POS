"use client";

// A product's photo with Upload / Replace / Remove. Any active staff member. The browser shrinks
// the picture (max 800 px, JPEG), uploads it straight to Storage, then setProductPhoto attaches it
// and deletes the previous file. PhotoPicker is the Add product version: the product doesn't
// exist yet, so the shrunk photo goes with the form and saveProduct uploads it.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setProductPhoto } from "@/app/(staff)/inventory/actions";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET, photoUrl } from "@/lib/photos";

const MAX_SIDE = 800;

/** Resize to at most MAX_SIDE px on the long side and re-encode as JPEG (phone photos are 3–10 MB). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff"; // transparent PNGs get a white background, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProductPhoto({ id, path, label }: { id: string; path: string | null; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = photoUrl(path);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick a photo (JPEG, PNG or WebP).");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      let blob: Blob;
      try {
        blob = await shrinkPhoto(file);
      } catch {
        setError("Couldn't read that picture. Try a JPEG or PNG.");
        return;
      }
      const supabase = createClient();
      const newPath = `${id}/${Date.now()}.jpg`;
      const up = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(newPath, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (up.error) {
        setError("Couldn't upload the photo. Check your connection and try again.");
        return;
      }
      const res = await setProductPhoto(id, newPath).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
      if (!res.ok) {
        await supabase.storage.from(PHOTO_BUCKET).remove([newPath]);
        setError(res.error);
        return;
      }
      toast(path ? "Photo replaced." : "Photo added.");
      router.refresh();
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    const res = await setProductPhoto(id, null).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Photo removed.");
    router.refresh();
  }

  return (
    <section className="card photo-card" aria-labelledby="photo-t">
      <span className="thumb thumb--lg">
        {src ? <img src={src} alt={label} decoding="async" /> : <Icon name="image" />}
      </span>
      <div className="stack stack-3 grow">
        <h2 className="card__title" id="photo-t">
          Photo
        </h2>
        <p className="t-sm muted">{src ? "Shows on the register and in Inventory." : "Add one so it's easy to spot on the register."}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busy !== null}
            aria-busy={busy === "upload" || undefined}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" />
            {busy === "upload" ? "Uploading…" : src ? "Replace" : "Upload photo"}
          </button>
          {src && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy !== null}
              aria-busy={busy === "remove" || undefined}
              onClick={remove}
            >
              <Icon name="trash" />
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          aria-label={`Photo of ${label}`}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {error && (
          <p className="field__error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** Optional photo on Add product: shrunk here, sent with the form, uploaded once the product is added. */
export function PhotoPicker({ onChange }: { onChange: (photo: Blob | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free the previous preview when it's replaced, and the last one when the form goes away.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick a photo (JPEG, PNG or WebP).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      setPreview(URL.createObjectURL(blob));
      onChange(blob);
    } catch {
      setError("Couldn't read that picture. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function remove() {
    setPreview(null);
    setError(null);
    onChange(null);
  }

  return (
    <div className="field span-all">
      <span className="field__label" id="p-photo-l">
        Photo <span className="optional">(optional)</span>
      </span>
      <div className="photo-pick">
        <span className="thumb thumb--lg">
          {preview ? <img src={preview} alt="Photo for this product" /> : <Icon name="image" />}
        </span>
        <div className="stack stack-2 grow">
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busy}
              aria-busy={busy || undefined}
              aria-describedby="p-photo-h"
              onClick={() => input.current?.click()}
            >
              <Icon name="upload" />
              {preview ? "Change photo" : "Upload photo"}
            </button>
            {preview && (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={remove}>
                <Icon name="trash" />
                Remove
              </button>
            )}
          </div>
          <p className="field__hint" id="p-photo-h">
            Take one with the camera or pick one from your photos. It uploads when you add the product.
          </p>
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden aria-labelledby="p-photo-l" onChange={(e) => onFile(e.target.files?.[0])} />
      {error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}
    </div>
  );
}
