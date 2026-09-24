"use client";

import { callApi } from "@/lib/api";
import { db, getMeta, setMeta } from "@/lib/db";
import { aisleIdByName, normaliseName, nowIso } from "@/lib/mutations";
import { patchLocal } from "@/lib/sync";
import type { ListItemRow, ProductRow } from "@/lib/types";

// Gives a product an aisle and moves any unsorted items for it into that aisle.
export async function assignAisle(product: ProductRow, aisleId: string | null) {
  if (!aisleId) return;
  // Only fill in an aisle if nobody has set one in the meantime.
  const updated = await patchLocal<ProductRow>("products", product.id, (cur) =>
    cur.aisle_id ? null : { aisle_id: aisleId, updated_at: nowIso() },
  );
  if (!updated || updated.aisle_id !== aisleId) return;
  const items = await db()
    .list_items.where("product_id")
    .equals(product.id)
    .filter((i) => !i.deleted_at && !i.aisle_id)
    .toArray();
  const t = nowIso();
  for (const i of items) {
    await patchLocal<ListItemRow>("list_items", i.id, (cur) => (cur.aisle_id ? null : { aisle_id: aisleId, updated_at: t }));
  }
}

const inflight = new Set<string>();

// Step 4 of aisle auto-sort: ask Claude (through our server) when the catalogue and the
// keyword map don't know an item. Each name is only ever asked once per device.
export async function autoSortProduct(product: ProductRow): Promise<void> {
  if (product.aisle_id || !navigator.onLine) return;
  const key = `classified:${normaliseName(product.name)}`;
  if (inflight.has(key) || (await getMeta(key))) return;
  inflight.add(key);
  try {
    const { aisle } = await callApi<{ aisle: string | null }>("/api/classify", {
      method: "POST",
      json: { name: product.name },
    });
    await setMeta(key, aisle ?? "none");
    await assignAisle(product, (await aisleIdByName(aisle)) ?? (await aisleIdByName("Other")));
  } catch {
    // No signal or the service is busy: the next sweep tries again.
  } finally {
    inflight.delete(key);
  }
}

// Finds products on any open list that still have no aisle, and sorts them.
export async function sweepUnsorted(): Promise<void> {
  if (!navigator.onLine) return;
  const open = await db().list_items.filter((i) => !i.deleted_at && !i.checked && !i.aisle_id && !!i.product_id).toArray();
  const ids = [...new Set(open.map((i) => i.product_id!))];
  for (const id of ids) {
    const product = await db().products.get(id);
    if (!product || product.deleted_at) continue;
    if (product.aisle_id) {
      await assignAisleToItems(product);
      continue;
    }
    await autoSortProduct(product);
  }
}

// An item can be unsorted while its product already has an aisle (for example the product was
// sorted on another phone). Bring the item in line.
async function assignAisleToItems(product: ProductRow) {
  const items = await db()
    .list_items.where("product_id")
    .equals(product.id)
    .filter((i) => !i.deleted_at && !i.aisle_id)
    .toArray();
  const t = nowIso();
  for (const i of items) {
    await patchLocal<ListItemRow>("list_items", i.id, (cur) =>
      cur.aisle_id ? null : { aisle_id: product.aisle_id, updated_at: t },
    );
  }
}
