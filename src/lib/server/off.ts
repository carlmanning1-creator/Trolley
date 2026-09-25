import "server-only";
import https from "node:https";
import { aisleForOffCategories } from "@/lib/offCategories";
import { nameFit } from "@/lib/offMatch";
import { serverEnv } from "@/lib/server/env";

// Open Food Facts client. Every call sends our User-Agent, answers are cached in memory,
// and we stay under OFF's limits (about 100 product lookups and 10 searches a minute).

export type OffProduct = {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  aisle: string | null;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  if (hit) cache.delete(key);
  return undefined;
}
function remember(key: string, value: unknown) {
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
}

// Simple per-minute budgets, kept below OFF's published limits.
const budgets = { product: { limit: 90, used: [] as number[] }, search: { limit: 8, used: [] as number[] } };
export class RateLimited extends Error {}
function spend(kind: keyof typeof budgets) {
  const b = budgets[kind];
  const now = Date.now();
  b.used = b.used.filter((t) => now - t < 60_000);
  if (b.used.length >= b.limit) throw new RateLimited(`Too many ${kind} lookups right now`);
  b.used.push(now);
}

async function offFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": serverEnv.offUserAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

type RawProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string | string[];
  quantity?: string;
  categories_tags?: string[];
  image_front_url?: string;
  image_front_small_url?: string;
  image_url?: string;
};

function tidy(raw: RawProduct): OffProduct | null {
  const name = (raw.product_name_en || raw.product_name || "").trim();
  if (!raw.code || !name) return null;
  const brand = Array.isArray(raw.brands) ? raw.brands[0] : raw.brands?.split(",")[0];
  return {
    code: raw.code,
    name,
    brand: brand?.trim() || null,
    quantity: raw.quantity?.trim() || null,
    imageUrl: raw.image_front_url || raw.image_url || raw.image_front_small_url || null,
    aisle: aisleForOffCategories(raw.categories_tags),
  };
}

const FIELDS = "code,product_name,product_name_en,brands,quantity,categories_tags,image_front_url,image_front_small_url,image_url";

export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const key = `p:${barcode}`;
  const hit = cached<OffProduct | null>(key);
  if (hit !== undefined) return hit;
  spend("product");
  const res = await offFetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=${FIELDS}`,
  );
  if (res.status === 404) {
    remember(key, null);
    return null;
  }
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: RawProduct };
  const product = body.status === 1 && body.product ? tidy({ code: barcode, ...body.product }) : null;
  remember(key, product);
  return product;
}

// Name search, only returning products that have a picture.
// strict (used for automatic pictures) keeps only good fits, best first; otherwise
// Australian products first, for people choosing a picture themselves.
export async function searchByName(
  query: string,
  limit = 6,
  strict = false,
  expectedAisle: string | null = null,
): Promise<OffProduct[]> {
  const q = query.trim().toLowerCase();
  const key = `s:${q}`;
  let all = cached<{ product: OffProduct; au: boolean }[]>(key);
  if (!all) {
    spend("search");
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=40&fields=${FIELDS},countries_tags`;
    const res = await offFetch(url);
    if (!res.ok) throw new Error(`Open Food Facts search answered ${res.status}`);
    const body = (await res.json()) as { hits?: (RawProduct & { countries_tags?: string[] })[] };
    all = (body.hits ?? [])
      .map((h) => ({ product: tidy(h), au: h.countries_tags?.includes("en:australia") ?? false }))
      .filter((r): r is { product: OffProduct; au: boolean } => Boolean(r.product?.imageUrl));
    remember(key, all);
  }
  if (strict) {
    return all
      .map((r) => ({ r, fit: nameFit(q, r.product.name, r.product.brand, r.au) }))
      .filter((x): x is { r: { product: OffProduct; au: boolean }; fit: number } => x.fit !== null)
      // If we know which aisle the item is in, the picture's product must belong there too
      // (so "Milk" can't pick Cadbury Dairy Milk, and "Butter" can't pick peanut butter).
      .filter((x) => !expectedAisle || !x.r.product.aisle || x.r.product.aisle === expectedAisle)
      .filter((x) => !expectedAisle || x.r.product.aisle !== null || x.fit >= 45)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, limit)
      .map((x) => x.r.product);
  }
  return [...all].sort((a, b) => Number(b.au) - Number(a.au)).slice(0, limit).map((r) => r.product);
}

// Only ever download pictures from OFF's own image host.
export function isOffImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "images.openfoodfacts.org" || u.hostname === "static.openfoodfacts.org");
  } catch {
    return false;
  }
}

// Downloads with Node's own HTTPS client: it tries IPv4 and IPv6 side by side (so one slow
// route can't stall the connection) and only follows redirects that stay on OFF's hosts.
function httpsGetImage(url: string, timeoutMs: number, redirectsLeft = 2): Promise<{ bytes: Buffer; type: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      // autoSelectFamily is passed through to the socket (Node's "happy eyeballs"); older
      // type definitions don't list it on request options.
      {
        headers: { "User-Agent": serverEnv.offUserAgent(), Accept: "image/*" },
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 300,
        timeout: timeoutMs,
      } as https.RequestOptions,
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          if (redirectsLeft <= 0 || !isOffImageUrl(next)) {
            reject(new Error("Image was redirected away from Open Food Facts"));
            return;
          }
          httpsGetImage(next, timeoutMs, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Image download failed (${status})`));
          return;
        }
        const type = (res.headers["content-type"] ?? "image/jpeg").split(";")[0];
        if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
          res.resume();
          reject(new Error("Unexpected image type"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > 5 * 1024 * 1024) {
            req.destroy(new Error("Image too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ bytes: Buffer.concat(chunks), type }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Image download timed out")));
    req.on("error", reject);
  });
}

// timeBudgetMs caps the whole download, retry included, so a caller with its own deadline
// (a server function that is stopped at 60 seconds) is never left waiting past it.
export async function downloadOffImage(
  url: string,
  timeBudgetMs = 35_000,
): Promise<{ bytes: ArrayBuffer; type: string }> {
  if (!isOffImageUrl(url)) throw new Error("Not an Open Food Facts image");
  // Machines that reach the internet through an HTTP proxy (like our build and test containers)
  // need fetch, which honours the proxy; everywhere else (Vercel) use the dual-stack client.
  const viaProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
  const attempt = async (timeoutMs: number) => {
    if (!viaProxy) return httpsGetImage(url, timeoutMs);
    const res = await offFetch(url, timeoutMs);
    if (!isOffImageUrl(res.url)) throw new Error("Image was redirected away from Open Food Facts");
    if (!res.ok) throw new Error(`Image download failed (${res.status})`);
    const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("Unexpected image type");
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Image too large");
    return { bytes, type };
  };
  const deadline = Date.now() + timeBudgetMs;
  let got: { bytes: Buffer; type: string };
  try {
    got = await attempt(Math.min(15_000, timeBudgetMs));
  } catch (err) {
    // OFF's image server is sometimes slow; one retry if there's time for a real attempt.
    const left = deadline - Date.now();
    if (left < 5_000) throw err;
    got = await attempt(Math.min(20_000, left));
  }
  const bytes = got.bytes.buffer.slice(got.bytes.byteOffset, got.bytes.byteOffset + got.bytes.byteLength) as ArrayBuffer;
  return { bytes, type: got.type };
}
