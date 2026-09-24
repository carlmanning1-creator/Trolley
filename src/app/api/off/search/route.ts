import { getCaller, unauthorised } from "@/lib/server/auth";
import { RateLimited, searchByName } from "@/lib/server/off";

export async function GET(req: Request) {
  if (!(await getCaller(req))) return unauthorised();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 80) return Response.json({ results: [] });
  try {
    return Response.json({ results: await searchByName(q) });
  } catch (err) {
    if (err instanceof RateLimited) return Response.json({ results: [], busy: true }, { status: 429 });
    console.error("OFF search failed", err);
    return Response.json({ results: [] }, { status: 502 });
  }
}
