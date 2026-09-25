import "server-only";
import { commonsFit } from "@/lib/offMatch";
import { serverEnv } from "@/lib/server/env";

// Wikimedia Commons: free, openly licensed photos. Good for everyday unbranded things
// (fruit, tools, garden gear) that Open Food Facts doesn't cover.

export type CommonsImage = { thumb: string; page: string };

const cache = new Map<string, { at: number; images: CommonsImage[] }>();

export async function searchCommons(query: string): Promise<CommonsImage[]> {
  const key = query.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.images;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${key} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "600",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": serverEnv.offUserAgent() },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);
  const body = (await res.json()) as {
    query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: { thumburl?: string; descriptionurl?: string; mime?: string }[] }> };
  };
  const images = Object.values(body.query?.pages ?? {})
    .map((p) => ({ p, fit: commonsFit(key, p.title) }))
    .filter((x) => x.fit !== null && x.p.imageinfo?.[0]?.thumburl && /^image\/(jpeg|png|webp)$/.test(x.p.imageinfo[0].mime ?? ""))
    .sort((a, b) => b.fit! - a.fit! || (a.p.index ?? 99) - (b.p.index ?? 99))
    .slice(0, 3)
    .map((x) => ({
      thumb: x.p.imageinfo![0].thumburl!,
      page: x.p.imageinfo![0].descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(x.p.title)}`,
    }));
  cache.set(key, { at: Date.now(), images });
  return images;
}
