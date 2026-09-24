import { z } from "zod";
import { asCaller, getCaller, unauthorised } from "@/lib/server/auth";
import { downloadOffImage } from "@/lib/server/off";

// Copies an Open Food Facts picture into our own storage, so it keeps working offline
// and if OFF ever moves it. Returns the storage path to put on the product.
export const maxDuration = 60;

const Body = z.object({ productId: z.string().uuid(), url: z.string().url() });

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { productId, url } = parsed.data;

  try {
    const { bytes, type } = await downloadOffImage(url);
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `${caller.householdId}/${productId}-off.${ext}`;
    // Upload as the caller, so storage rules confirm the folder is their household's.
    const { error } = await asCaller(caller)
      .storage.from("product-images")
      .upload(path, bytes, { contentType: type, upsert: true });
    if (error) {
      console.error("OFF image upload failed", error);
      return Response.json({ error: "Couldn't save the picture." }, { status: 500 });
    }
    return Response.json({ path });
  } catch (err) {
    console.error("OFF image copy failed", err);
    return Response.json({ error: "Couldn't fetch that picture." }, { status: 502 });
  }
}
