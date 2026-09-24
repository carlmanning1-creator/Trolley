import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic } from "@/lib/server/anthropic";
import { admin, getCaller, unauthorised } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

// Step 4 of aisle auto-sort: asks Claude which of the household's aisles an item belongs in.
// Only the item name is sent. The app caches the answer on the product, so each name is asked once.

const Body = z.object({ name: z.string().trim().min(1).max(120) });

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send an item name." }, { status: 400 });

  const { data: aisles } = await admin()
    .from("aisles")
    .select("name")
    .eq("household_id", caller.householdId)
    .is("deleted_at", null)
    .order("sort_order");
  const names = (aisles ?? []).map((a) => a.name as string);
  if (names.length === 0) return Response.json({ aisle: null });

  const Answer = z.object({ aisle: z.enum(names as [string, ...string[]]) });

  try {
    const response = await anthropic().messages.parse({
      model: serverEnv.categoryModel(),
      max_tokens: 256,
      system:
        "You sort grocery and household shopping items into supermarket aisles for an Australian family. " +
        "Pick the single aisle where the item is most likely found in a Woolworths or Coles. " +
        "Batteries, light globes, candles, kitchen wraps and party supplies belong with cleaning and household goods. " +
        "If it isn't something a supermarket sells, pick Other.",
      messages: [
        {
          role: "user",
          content: `Aisles: ${names.join(" | ")}\nItem: ${parsed.data.name}`,
        },
      ],
      output_config: { format: zodOutputFormat(Answer) },
    });
    const aisle = response.parsed_output?.aisle ?? null;
    return Response.json({ aisle: aisle && names.includes(aisle) ? aisle : null });
  } catch (err) {
    console.error("classify failed", err);
    return Response.json({ error: "Couldn't sort that item right now." }, { status: 502 });
  }
}
