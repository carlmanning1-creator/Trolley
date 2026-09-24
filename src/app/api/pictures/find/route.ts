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

async function fromUrl(url: string): Promise<Buffer | null> {
  // Site logos and placeholder art are often what a page offers for sharing.
  if (/logo|placeholder|default[-_]?image|favicon|sprite/i.test(new URL(url).pathname)) return null;
  try {
    const got = await safeFetch(url, {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 12_000,
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

async function find(input: z.infer<typeof Body>, householdId: string): Promise<Found | null> {
  if (input.barcode) {
    try {
      const off = await lookupBarcode(input.barcode);
      if (off?.imageUrl) return { bytes: Buffer.from((await downloadOffImage(off.imageUrl)).bytes), source: "off", offCode: off.code };
    } catch {
      // carry on to the next source
    }
  }
  try {
    const [off] = await searchByName(input.name, 3, true, input.aisle ?? null);
    if (off?.imageUrl) return { bytes: Buffer.from((await downloadOffImage(off.imageUrl)).bytes), source: "off", offCode: off.code };
  } catch {
    // carry on
  }
  try {
    for (const url of await searchCommons(input.name)) {
      const bytes = await fromUrl(url);
      if (bytes) return { bytes, source: "commons" };
    }
  } catch {
    // carry on
  }
  if (input.allowWeb !== false && (await underMonthlyCap(householdId))) {
    try {
      const context = [input.listName && `on the ${input.listName} list`, input.aisle && `aisle: ${input.aisle}`]
        .filter(Boolean)
        .join(", ");
      for (const url of await webPictureCandidates(input.name, context || null)) {
        const bytes = await fromUrl(url);
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
