"use client";

import { useRef, useState } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { applyOffPicture, findPicture, offSearch, setProductPhoto, type OffProduct } from "@/lib/images";
import type { AisleRow, ProductRow } from "@/lib/types";

// Replace a product's picture: take a photo, upload one, or pick one from Open Food Facts.
export function PictureEditor({ product, aisle }: { product: ProductRow; aisle: AisleRow | undefined }) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [choices, setChoices] = useState<OffProduct[] | null>(null);

  async function onFile(file: File | undefined, source: "photo" | "upload") {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      await setProductPhoto(product, file, source);
      setMessage(navigator.onLine ? "Picture saved." : "Picture saved. It will upload when there's signal.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't use that picture.");
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (upload.current) upload.current.value = "";
    }
  }

  async function findOnline() {
    setBusy(true);
    setMessage(null);
    try {
      const results = await offSearch(product.name);
      setChoices(results);
      if (results.length === 0) setMessage("No pictures found online for that name.");
    } catch {
      setMessage("Couldn't search right now. Check your signal.");
    } finally {
      setBusy(false);
    }
  }

  async function searchWeb() {
    setBusy(true);
    setMessage(null);
    setChoices(null);
    try {
      const found = await findPicture(product, true);
      setMessage(found ? "Picture saved." : "No picture found on the web for that name. A photo works best.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't search right now.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(off: OffProduct) {
    setBusy(true);
    try {
      await applyOffPicture({ ...product, image_path: null }, off);
      setChoices(null);
      setMessage("Picture saved.");
    } catch {
      setMessage("Couldn't save that picture. Try another.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "min-h-11 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-50";
  return (
    <fieldset className="flex flex-col gap-3" disabled={busy}>
      <legend className="mb-1 font-medium">Picture</legend>
      <div className="flex items-center gap-3">
        <ProductThumb product={product} aisle={aisle} size={64} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => camera.current?.click()}>
            Take photo
          </button>
          <button type="button" className={btn} onClick={() => upload.current?.click()}>
            Upload
          </button>
          <button type="button" className={btn} onClick={() => void findOnline()}>
            Food database
          </button>
          <button type="button" className={btn} onClick={() => void searchWeb()}>
            Search the web
          </button>
        </div>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take a photo"
        onChange={(e) => void onFile(e.target.files?.[0], "photo")}
      />
      <input
        ref={upload}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload a picture"
        onChange={(e) => void onFile(e.target.files?.[0], "upload")}
      />
      {choices && choices.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Pictures found online">
          {choices.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => void pick(c)}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-border p-1.5 text-xs"
                aria-label={`Use picture of ${c.name}${c.brand ? ` by ${c.brand}` : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.imageUrl!} alt="" className="h-20 w-full rounded-lg bg-white object-contain" loading="lazy" />
                <span className="line-clamp-2 text-center">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="text-sm text-muted">
          {busy ? "Working…" : message}
        </p>
      )}
    </fieldset>
  );
}
