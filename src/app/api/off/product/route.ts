import { getCaller, unauthorised } from "@/lib/server/auth";
import { lookupBarcode, RateLimited } from "@/lib/server/off";

export async function GET(req: Request) {
  if (!(await getCaller(req))) return unauthorised();
  const barcode = new URL(req.url).searchParams.get("barcode")?.trim() ?? "";
  if (!/^\d{6,14}$/.test(barcode)) return Response.json({ error: "That doesn't look like a barcode." }, { status: 400 });
  try {
    return Response.json({ product: await lookupBarcode(barcode) });
  } catch (err) {
    if (err instanceof RateLimited) return Response.json({ error: "Busy, try again in a minute." }, { status: 429 });
    console.error("OFF product lookup failed", err);
    return Response.json({ error: "Couldn't reach Open Food Facts." }, { status: 502 });
  }
}
