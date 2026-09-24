import { z } from "zod";
import { admin, getCaller, unauthorised } from "@/lib/server/auth";
import { readReceipt } from "@/lib/server/receipts";

export const maxDuration = 120;

const Body = z.object({ receiptId: z.string().uuid(), listId: z.string().uuid() });

function fmtQty(q: number | null, unit: string | null) {
  if (q === null) return unit ?? "";
  return unit ? `${q} ${unit}` : `x${q}`;
}

// Reads an uploaded receipt photo and stores the proposed matches for the review screen.
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { receiptId, listId } = parsed.data;
  const db = admin();

  const { data: receipt } = await db
    .from("receipts")
    .select("id, household_id, image_path, status")
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt || receipt.household_id !== caller.householdId) {
    return Response.json({ error: "Receipt not found." }, { status: 404 });
  }
  if (receipt.status === "confirmed") return Response.json({ error: "Already confirmed." }, { status: 409 });

  const fail = async (message: string) => {
    await db
      .from("receipts")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", receiptId);
    return Response.json({ error: message }, { status: 422 });
  };

  const { data: file, error: dlError } = await db.storage.from("receipts").download(receipt.image_path);
  if (dlError || !file) return fail("The receipt photo didn't finish uploading. Try again.");
  const mediaType = (["image/jpeg", "image/png", "image/webp"].includes(file.type) ? file.type : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp";
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  const [{ data: items }, { data: products }] = await Promise.all([
    db
      .from("list_items")
      .select("id, name, quantity, unit, product_id")
      .eq("household_id", caller.householdId)
      .eq("list_id", listId)
      .eq("checked", false)
      .is("deleted_at", null),
    db
      .from("products")
      .select("id, name")
      .eq("household_id", caller.householdId)
      .is("deleted_at", null)
      .order("times_bought", { ascending: false })
      .limit(400),
  ]);
  const itemLabels = new Map((items ?? []).map((i, n) => [`L${n + 1}`, i]));
  const productLabels = new Map((products ?? []).map((p, n) => [`P${n + 1}`, p]));

  let reading;
  try {
    reading = await readReceipt({
      image: { data, mediaType },
      listItems: [...itemLabels].map(([label, i]) => ({ label, name: i.name, quantity: fmtQty(i.quantity, i.unit) })),
      products: [...productLabels].map(([label, p]) => ({ label, name: p.name })),
    });
  } catch (err) {
    console.error("Receipt reading failed", err);
    return fail("We couldn't read that receipt. Try a clearer, flatter photo in good light.");
  }
  if (!reading.is_receipt || reading.lines.length === 0) {
    return fail("That doesn't look like a shopping receipt. Try another photo.");
  }

  // Map labels back to real rows; drop any label that doesn't exist and any second use of an item.
  const used = new Set<string>();
  const lines = reading.lines.map((l) => {
    const item = l.list_item ? itemLabels.get(l.list_item.trim().toUpperCase()) : undefined;
    const listItemId = item && !used.has(item.id) ? item.id : null;
    if (listItemId) used.add(listItemId);
    const product = l.product ? productLabels.get(l.product.trim().toUpperCase()) : undefined;
    return {
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      list_item_id: listItemId,
      product_id: product?.id ?? (item?.product_id as string | null) ?? null,
    };
  });

  const purchasedAt = reading.purchased_on && /^\d{4}-\d{2}-\d{2}$/.test(reading.purchased_on) ? `${reading.purchased_on}T12:00:00+10:00` : null;
  const proposal = { store_name: reading.store_name, purchased_at: purchasedAt, total: reading.total, list_id: listId, lines };
  await db
    .from("receipts")
    .update({
      status: "review",
      store_name: reading.store_name,
      purchased_at: purchasedAt,
      total: reading.total,
      list_id: listId,
      raw_ai_json: { reading, proposal },
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receiptId);

  return Response.json({ proposal });
}
