import sharp from "sharp";
import { z } from "zod";
import { asCaller, getCaller, unauthorised } from "@/lib/server/auth";
import { searchCommons } from "@/lib/server/commons";
import { downloadOffImage, lookupBarcode, searchByName } from "@/lib/server/off";
import { safeFetch } from "@/lib/server/safeFetch";
import { serverEnv } from "@/lib/server/env";
import { underMonthlyCap, webPictureCandidates } from "@/lib/server/webPicture";

export const maxDuration = 60;

// Finds a picture for a product, trying free sources before the paid one:
//   1. Open Food Facts by barcode   2. Open Food Facts by name (strict)
//   3. Wikimedia Commons            4. Claude web search (capped monthly)
// The chosen picture is resized to 800px and stored in our own bucket.
const Body = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).nullable().optional(),
  barcode: z.string().regex(/^\d{6,14}$/).nullable().optional(),
  aisle: z.string().max(60).nullable().optional(),
  listName: z.string().max(60).nullable().optional(),
  allowWeb: z.boolean().optional(),
});

type Found = { bytes: Buffer; source: "off" | "commons" | "web"; offCode?: string };

async function toWebp(bytes: Buffer | ArrayBuffer): Promise<Buffer> {
  return sharp(Buffer.from(bytes as ArrayBuffer), { failOn: "error" })
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 80 })
    .toBuffer();
}

async function fromUrl(url: string, timeoutMs: number): Promise<Buffer | null> {
  // Site logos and placeholder art are often what a page offers for sharing.
  if (/logo|placeholder|default[-_]?image|favicon|sprite/i.test(new URL(url).pathname)) return null;
  try {
    const got = await safeFetch(url, {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs,
      accept: "image/*",
      userAgent: serverEnv.offUserAgent(),
    });
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(got.type)) return null;
    const meta = await sharp(got.body).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 120 || h < 120) return null; // icons and spacers
    if (w / h > 2 || h / w > 2.5) return null; // banners and logos, not product shots
    return got.body;
  } catch {
    return null;
  }
}

// Filler that doesn't help a picture search ("get the big one please").
const FILLER = new Set(["the", "a", "an", "one", "ones", "please", "pls", "get", "for", "if", "any", "some", "or", "and", "of", "not", "no", "big", "small", "cheap", "cheapest", "on", "special", "sale", "brand", "whatever"]);

// Search phrases to try, most specific first: the name with the useful words from the note,
// then the name alone.
function queries(name: string, note: string | null | undefined): string[] {
  const extra = (note ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w) && !name.toLowerCase().includes(w))
    .slice(0, 5)
    .join(" ");
  return extra ? [`${name} ${extra}`, name] : [name];
}

// The whole search has to finish inside the function's 60 seconds, with time left to convert
// and store the picture. Each step only starts if it has a real chance of finishing.
const SEARCH_BUDGET_MS = 48_000;
const WEB_STEP_MIN_MS = 25_000; // a paid web search is only worth starting with this much left

async function find(input: z.infer<typeof Body>, householdId: string): Promise<Found | null> {
  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const left = () => deadline - Date.now();
  const phrases = queries(input.name, input.note);
  // The barcode's picture and the best name match are often the same file; don't wait on a
  // slow download twice.
  const failedOff = new Set<string>();

  const offPicture = async (off: { code: string; imageUrl: string | null } | null | undefined): Promise<Found | null> => {
    if (!off?.imageUrl || failedOff.has(off.imageUrl) || left() < 5_000) return null;
    try {
      const { bytes } = await downloadOffImage(off.imageUrl, left() - 2_000);
      return { bytes: Buffer.from(bytes), source: "off", offCode: off.code };
    } catch {
      failedOff.add(off.imageUrl);
      return null;
    }
  };

  if (input.barcode) {
    const hit = await offPicture(await lookupBarcode(input.barcode).catch(() => null));
    if (hit) return hit;
  }
  for (const phrase of phrases) {
    if (left() < 10_000) break;
    const [off] = await searchByName(phrase, 3, true, input.aisle ?? null).catch(() => []);
    const hit = await offPicture(off);
    if (hit) return hit;
  }
  for (const phrase of phrases) {
    if (left() < 8_000) break;
    for (const url of await searchCommons(phrase).catch(() => [])) {
      if (left() < 5_000) break;
      const bytes = await fromUrl(url, Math.min(12_000, left() - 2_000));
      if (bytes) return { bytes, source: "commons" };
    }
  }
  if (input.allowWeb !== false && left() >= WEB_STEP_MIN_MS && (await underMonthlyCap(householdId))) {
    try {
      const context = [
        input.note && `the family's note: "${input.note}"`,
        input.listName && `on the ${input.listName} list`,
        input.aisle && `aisle: ${input.aisle}`,
      ]
        .filter(Boolean)
        .join(", ");
      for (const url of await webPictureCandidates(input.name, context || null, left() - 8_000)) {
        if (left() < 4_000) break;
        const bytes = await fromUrl(url, Math.min(12_000, left() - 2_000));
        if (bytes) return { bytes, source: "web" };
      }
    } catch (err) {
      console.error("web picture search failed", err);
    }
  }
  return null;
}

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const found = await find(parsed.data, caller.householdId);
  if (!found) return Response.json({ found: false });

  let image: Buffer;
  try {
    image = await toWebp(found.bytes);
  } catch {
    return Response.json({ found: false });
  }
  const path = `${caller.householdId}/${parsed.data.productId}-${found.source}-${Date.now()}.webp`;
  const { error } = await asCaller(caller)
    .storage.from("product-images")
    .upload(path, image, { contentType: "image/webp", upsert: true });
  if (error) {
    console.error("picture upload failed", error);
    return Response.json({ error: "Couldn't save the picture." }, { status: 500 });
  }
  return Response.json({ found: true, path, source: found.source, offCode: found.offCode ?? null });
}
