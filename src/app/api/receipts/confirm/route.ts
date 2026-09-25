import { z } from "zod";
import { admin, getCaller, unauthorised } from "@/lib/server/auth";

// Confirming a reviewed receipt: tick the matched list items, keep every line with its price
// (for spend tracking later), count each product as bought, and mark the receipt confirmed.
const Line = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  line_total: z.number().nullable(),
  list_item_id: z.string().uuid().nullable(),
  product_id: z.string().uuid().nullable(),
});
const Body = z.object({ receiptId: z.string().uuid(), lines: z.array(Line).max(300) });

const money = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { receiptId, lines } = parsed.data;
  const db = admin();
  const hh = caller.householdId;

  const { data: receipt } = await db
    .from("receipts")
    .select("id, household_id, status, purchased_at")
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt || receipt.household_id !== hh) return Response.json({ error: "Receipt not found." }, { status: 404 });
  if (receipt.status === "confirmed") return Response.json({ error: "Already confirmed." }, { status: 409 });

  // Everything referenced must belong to this household.
  const itemIds = [...new Set(lines.map((l) => l.list_item_id).filter((x): x is string => Boolean(x)))];
  const productIds = [...new Set(lines.map((l) => l.product_id).filter((x): x is string => Boolean(x)))];
  const [{ data: items }, { data: products }] = await Promise.all([
    itemIds.length
      ? db.from("list_items").select("id, product_id").eq("household_id", hh).in("id", itemIds)
      : Promise.resolve({ data: [] as { id: string; product_id: string | null }[] }),
    productIds.length
      ? db.from("products").select("id, times_bought").eq("household_id", hh).in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; times_bought: number }[] }),
  ]);
  if ((items ?? []).length !== itemIds.length || (products ?? []).length !== productIds.length) {
    return Response.json({ error: "Some items no longer exist. Refresh and try again." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const boughtAt = receipt.purchased_at ?? now;

  // Claim the receipt before changing anything, so a double tap or a retry can't count the
  // same shop twice. If a later step fails, it goes back to review for another try.
  const { data: claimed } = await db
    .from("receipts")
    .update({ status: "confirmed", updated_at: now })
    .eq("id", receiptId)
    .eq("status", receipt.status)
    .select("id");
  if (!claimed?.length) return Response.json({ error: "Already confirmed." }, { status: 409 });
  const giveBack = async (message: string) => {
    await db.from("receipts").update({ status: receipt.status, updated_at: new Date().toISOString() }).eq("id", receiptId);
    return Response.json({ error: message }, { status: 500 });
  };

  if (itemIds.length) {
    const { data: ticked, error } = await db
      .from("list_items")
      .update({ checked: true, checked_by: caller.userId, checked_at: now, check_changed_at: now })
      .eq("household_id", hh)
      .in("id", itemIds)
      .eq("checked", false)
      .select("id, product_id, list_id");
    if (error) return giveBack("Couldn't tick the items.");
    // Same purchase history a tick on the phone leaves, so Running low learns from receipts too.
    const purchases = (ticked ?? [])
      .filter((i) => i.product_id)
      .map((i) => ({
        household_id: hh,
        product_id: i.product_id,
        list_item_id: i.id,
        list_id: i.list_id,
        bought_by: caller.userId,
        bought_at: boughtAt,
      }));
    if (purchases.length) {
      const { error: historyError } = await db.from("purchases").insert(purchases);
      if (historyError) console.error("purchase history insert failed", historyError);
    }
  }

  await db.from("receipt_lines").delete().eq("receipt_id", receiptId);
  if (lines.length) {
    const { error } = await db.from("receipt_lines").insert(
      lines.map((l) => ({
        household_id: hh,
        receipt_id: receiptId,
        description: l.description,
        quantity: l.quantity,
        unit_price: money(l.unit_price),
        line_total: money(l.line_total),
        list_item_id: l.list_item_id,
        product_id: l.product_id ?? items?.find((i) => i.id === l.list_item_id)?.product_id ?? null,
      })),
    );
    if (error) {
      console.error("receipt_lines insert failed", error);
      return giveBack("Couldn't save the receipt lines.");
    }
  }

  // Count each product once per receipt, however many lines it had.
  const bought = new Set<string>(productIds);
  for (const l of lines) {
    const p = l.product_id ?? items?.find((i) => i.id === l.list_item_id)?.product_id;
    if (p) bought.add(p);
  }
  if (bought.size) {
    const { data: current } = await db.from("products").select("id, times_bought").eq("household_id", hh).in("id", [...bought]);
    await Promise.all(
      (current ?? []).map((p) =>
        db
          .from("products")
          .update({ times_bought: (p.times_bought ?? 0) + 1, last_bought_at: boughtAt, updated_at: now })
          .eq("id", p.id),
      ),
    );
  }

  return Response.json({ ticked: itemIds.length, lines: lines.length });
}
