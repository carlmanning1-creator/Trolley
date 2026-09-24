"use client";

import { useEffect, useState } from "react";
import { callApi } from "@/lib/api";
import { db } from "@/lib/db";
import { resizeImage } from "@/lib/imageResize";
import { nowIso, updateProduct } from "@/lib/mutations";
import { patchLocal } from "@/lib/sync";
import { supabase } from "@/lib/supabase";
import type { ProductRow } from "@/lib/types";

export const PRODUCT_BUCKET = "product-images";

// Object URLs for pictures already loaded this session.
const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

// Stores a picture on the device straight away (for example right after taking a photo),
// so it shows instantly and offline, before or without the upload finishing.
export async function putLocalImage(path: string, blob: Blob): Promise<void> {
  await db().images.put({ path, blob, saved_at: new Date().toISOString() });
  const old = urls.get(path);
  if (old) URL.revokeObjectURL(old);
  urls.set(path, URL.createObjectURL(blob));
}

async function load(path: string): Promise<string | null> {
  const cached = urls.get(path);
  if (cached) return cached;
  const local = await db().images.get(path);
  if (local) {
    const url = URL.createObjectURL(local.blob);
    urls.set(path, url);
    return url;
  }
  if (!navigator.onLine) return null;
  const { data, error } = await supabase().storage.from(PRODUCT_BUCKET).download(path);
  if (error || !data) return null;
  await putLocalImage(path, data);
  return urls.get(path) ?? null;
}

export function getImageUrl(path: string): Promise<string | null> {
  let p = inflight.get(path);
  if (!p) {
    p = load(path).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

export function useProductImageUrl(path: string | null): string | null {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const retry = () => {
      void getImageUrl(path).then((url) => {
        if (!cancelled) setLoaded({ path, url });
      });
    };
    retry();
    // A picture that couldn't load yet (no signal, or someone's photo still uploading from
    // their phone) gets another try when signal returns or the app comes back into view.
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [path]);
  if (!path) return null;
  return loaded?.path === path ? loaded.url : (urls.get(path) ?? null);
}

// ---------------------------------------------------------------------------
// Photos people take or upload
// ---------------------------------------------------------------------------

// Resizes, shows it straight away, and queues the upload (which waits for signal if needed).
export async function setProductPhoto(
  product: ProductRow,
  file: Blob,
  source: "photo" | "upload",
): Promise<void> {
  const blob = await resizeImage(file, 800);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${product.household_id}/${product.id}-${Date.now()}.${ext}`;
  await putLocalImage(path, blob);
  await db().uploads.put({ path, bucket: PRODUCT_BUCKET, content_type: blob.type, queued_at: nowIso() });
  await updateProduct(product, { image_path: path, image_source: source });
  void flushUploads();
}

let uploading = false;

// Sends queued photos. Called on start, when signal returns, and after each new photo.
export async function flushUploads(): Promise<void> {
  if (uploading || !navigator.onLine) return;
  uploading = true;
  try {
    for (const up of await db().uploads.toArray()) {
      const local = await db().images.get(up.path);
      if (!local) {
        await db().uploads.delete(up.path);
        continue;
      }
      const { error } = await supabase()
        .storage.from(up.bucket)
        .upload(up.path, local.blob, { contentType: up.content_type, upsert: true });
      if (error) {
        console.warn("Picture upload will retry", error);
        break;
      }
      await db().uploads.delete(up.path);
    }
  } finally {
    uploading = false;
  }
}

// ---------------------------------------------------------------------------
// Pictures from Open Food Facts
// ---------------------------------------------------------------------------

export type OffProduct = {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  aisle: string | null;
};

export async function offLookupBarcode(barcode: string): Promise<OffProduct | null> {
  const { product } = await callApi<{ product: OffProduct | null }>(
    `/api/off/product?barcode=${encodeURIComponent(barcode)}`,
  );
  return product;
}

export async function offSearch(q: string, strict = false, aisle: string | null = null): Promise<OffProduct[]> {
  const params = new URLSearchParams({ q });
  if (strict) params.set("strict", "1");
  if (aisle) params.set("aisle", aisle);
  const { results } = await callApi<{ results: OffProduct[] }>(`/api/off/search?${params}`);
  return results;
}

// Copies an OFF picture into our storage and puts it on the product.
export async function applyOffPicture(product: ProductRow, off: OffProduct): Promise<void> {
  if (!off.imageUrl) return;
  const { path } = await callApi<{ path: string }>("/api/off/image", {
    method: "POST",
    json: { productId: product.id, url: off.imageUrl },
  });
  // Someone may have taken their own photo in the meantime; theirs wins.
  await patchLocal<ProductRow>("products", product.id, (cur) =>
    cur.image_path && cur.image_source !== "off"
      ? null
      : { image_path: path, image_source: "off", off_code: off.code, updated_at: nowIso() },
  );
}

const lookedUp = new Set<string>();

// The product's aisle name, from the newest copy (auto-sort may have just set it).
async function aisleName(product: ProductRow): Promise<string | undefined> {
  const fresh = (await db().products.get(product.id)) ?? product;
  return fresh.aisle_id ? (await db().aisles.get(fresh.aisle_id))?.name : undefined;
}

// Step after adding: find a picture for a product that has none.
// Barcode lookup when we have a barcode, otherwise a name search limited to results with pictures.
export async function findPicture(product: ProductRow): Promise<void> {
  if (product.image_path || !navigator.onLine || lookedUp.has(product.id)) return;
  lookedUp.add(product.id);
  try {
    const code = product.barcode ?? product.off_code;
    const off = code
      ? await offLookupBarcode(code)
      : (await offSearch(product.name, true, (await aisleName(product)) ?? null))[0] ?? null;
    if (off?.imageUrl) await applyOffPicture(product, off);
  } catch {
    // No picture this time; the placeholder stays and someone can add a photo.
    lookedUp.delete(product.id);
  }
}

// Retries pictures for anything on a list that still has none (a lookup that failed on bad
// signal, or a scan whose picture download timed out). Each product is tried once per sweep.
let sweeping = false;
export async function sweepPictures(): Promise<void> {
  if (sweeping || !navigator.onLine) return;
  sweeping = true;
  try {
    const open = await db().list_items.filter((i) => !i.deleted_at && !i.checked && !!i.product_id).toArray();
    const ids = [...new Set(open.map((i) => i.product_id!))].slice(0, 20);
    for (const id of ids) {
      const product = await db().products.get(id);
      if (!product || product.deleted_at || product.image_path) continue;
      await findPicture(product);
    }
  } finally {
    sweeping = false;
  }
}
