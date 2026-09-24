"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";

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
    // A picture that couldn't load offline gets another try when signal returns.
    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
    };
  }, [path]);
  if (!path) return null;
  return loaded?.path === path ? loaded.url : (urls.get(path) ?? null);
}
