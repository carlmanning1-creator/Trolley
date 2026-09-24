// Every change people make. Each one writes to the device first (instant, works offline)
// and queues the change for the server.

import { db } from "@/lib/db";
import { aisleForName } from "@/lib/keywords";
import { parseItem } from "@/lib/parse";
import { saveLocal } from "@/lib/sync";
import type { AisleRow, ListItemRow, ListRow, ProductRow, ProfileRow } from "@/lib/types";

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export type Actor = { userId: string; householdId: string };

export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Products (the household catalogue)
// ---------------------------------------------------------------------------

export async function findProductByName(name: string): Promise<ProductRow | undefined> {
  const key = normaliseName(name);
  if (!key) return undefined;
  const matches = await db()
    .products.filter((p) => !p.deleted_at && normaliseName(p.name) === key)
    .toArray();
  // If two phones created the same product offline, prefer the one with a picture, then the oldest.
  return matches.sort(
    (a, b) =>
      Number(Boolean(b.image_path)) - Number(Boolean(a.image_path)) ||
      a.created_at.localeCompare(b.created_at),
  )[0];
}

export async function aisleIdByName(name: string | null): Promise<string | null> {
  if (!name) return null;
  const aisle = await db()
    .aisles.filter((a) => !a.deleted_at && a.name.toLowerCase() === name.toLowerCase())
    .first();
  return aisle?.id ?? null;
}

export async function createProduct(
  actor: Actor,
  fields: Partial<ProductRow> & { name: string },
): Promise<ProductRow> {
  const t = nowIso();
  const aisleId =
    fields.aisle_id !== undefined ? fields.aisle_id : await aisleIdByName(aisleForName(fields.name));
  const product: ProductRow = {
    id: newId(),
    household_id: actor.householdId,
    barcode: null,
    image_path: null,
    image_source: "none",
    off_code: null,
    is_staple: false,
    default_quantity: null,
    default_unit: null,
    times_bought: 0,
    last_bought_at: null,
    deleted_at: null,
    created_at: t,
    updated_at: t,
    ...fields,
    aisle_id: aisleId,
  };
  await saveLocal("products", product);
  return product;
}

export async function updateProduct(product: ProductRow, patch: Partial<ProductRow>): Promise<ProductRow> {
  const next: ProductRow = { ...product, ...patch, updated_at: nowIso() };
  await saveLocal("products", next);
  return next;
}

// ---------------------------------------------------------------------------
// List items
// ---------------------------------------------------------------------------

export type AddResult = { item: ListItemRow; product: ProductRow; status: "added" | "already" | "restored" };

// Adds typed text ("2 milk") or a known product to a list.
// If it's already on the list it isn't doubled up; if it was already ticked, it comes back.
export async function addItem(
  actor: Actor,
  listId: string,
  input: { text?: string; product?: ProductRow; quantity?: number | null; unit?: string | null },
): Promise<AddResult | null> {
  const parsed = input.text ? parseItem(input.text) : null;
  const name = input.product?.name ?? parsed?.name ?? "";
  if (!name) return null;
  const quantity = input.quantity ?? parsed?.quantity ?? input.product?.default_quantity ?? null;
  const unit = input.unit ?? parsed?.unit ?? input.product?.default_unit ?? null;

  const product = input.product ?? (await findProductByName(name)) ?? (await createProduct(actor, { name }));

  const existing = await db()
    .list_items.where("list_id")
    .equals(listId)
    .filter((i) => !i.deleted_at && i.product_id === product.id)
    .first();

  const t = nowIso();
  if (existing && !existing.checked) {
    return { item: existing, product, status: "already" };
  }
  if (existing && existing.checked) {
    const restored: ListItemRow = {
      ...existing,
      checked: false,
      checked_by: null,
      checked_at: null,
      check_changed_at: t,
      quantity: quantity ?? existing.quantity,
      unit: unit ?? existing.unit,
      added_by: actor.userId,
      updated_at: t,
    };
    await saveLocal("list_items", restored);
    return { item: restored, product, status: "restored" };
  }

  const item: ListItemRow = {
    id: newId(),
    household_id: actor.householdId,
    list_id: listId,
    product_id: product.id,
    aisle_id: product.aisle_id,
    name: product.name,
    quantity,
    unit,
    note: null,
    added_by: actor.userId,
    checked: false,
    checked_by: null,
    checked_at: null,
    check_changed_at: null,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await saveLocal("list_items", item);
  return { item, product, status: "added" };
}

// Ticking only touches the tick fields, so it never overwrites someone else's edit to the name
// or note. The server keeps whichever tick or untick happened last.
export async function setChecked(actor: Actor, item: ListItemRow, checked: boolean): Promise<void> {
  const t = nowIso();
  await saveLocal("list_items", {
    ...item,
    checked,
    checked_by: checked ? actor.userId : null,
    checked_at: checked ? t : null,
    check_changed_at: t,
  });
}

export async function updateItem(
  item: ListItemRow,
  patch: Partial<Pick<ListItemRow, "name" | "quantity" | "unit" | "note" | "aisle_id">>,
): Promise<void> {
  await saveLocal("list_items", { ...item, ...patch, updated_at: nowIso() });
  // Moving an item to another aisle teaches the catalogue, so it lands there next time.
  if (patch.aisle_id !== undefined && item.product_id) {
    const product = await db().products.get(item.product_id);
    if (product && product.aisle_id !== patch.aisle_id) {
      await updateProduct(product, { aisle_id: patch.aisle_id });
      // Other items for the same product follow along.
      const siblings = await db()
        .list_items.where("product_id")
        .equals(product.id)
        .filter((i) => !i.deleted_at && i.id !== item.id && i.aisle_id !== patch.aisle_id)
        .toArray();
      if (siblings.length) {
        const t = nowIso();
        await saveLocal(
          "list_items",
          siblings.map((s) => ({ ...s, aisle_id: patch.aisle_id ?? null, updated_at: t })),
        );
      }
    }
  }
}

export async function deleteItem(item: ListItemRow): Promise<void> {
  const t = nowIso();
  await saveLocal("list_items", { ...item, deleted_at: t, updated_at: t });
}

export async function clearTicked(listId: string): Promise<number> {
  const t = nowIso();
  const ticked = await db()
    .list_items.where("list_id")
    .equals(listId)
    .filter((i) => !i.deleted_at && i.checked)
    .toArray();
  await saveLocal(
    "list_items",
    ticked.map((i) => ({ ...i, deleted_at: t, updated_at: t })),
  );
  return ticked.length;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function addList(actor: Actor, name: string, icon = "📝"): Promise<ListRow> {
  const lists = await db().lists.filter((l) => !l.deleted_at).toArray();
  const t = nowIso();
  const list: ListRow = {
    id: newId(),
    household_id: actor.householdId,
    name: name.trim(),
    icon,
    sort_order: Math.max(0, ...lists.map((l) => l.sort_order)) + 1,
    use_aisles: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await saveLocal("lists", list);
  return list;
}

export async function updateList(list: ListRow, patch: Partial<Pick<ListRow, "name" | "icon" | "use_aisles">>) {
  await saveLocal("lists", { ...list, ...patch, updated_at: nowIso() });
}

export async function deleteList(list: ListRow) {
  const t = nowIso();
  await saveLocal("lists", { ...list, deleted_at: t, updated_at: t });
}

// Moves a list or aisle one place up (-1) or down (+1) by swapping sort order with its neighbour.
async function move<T extends ListRow | AisleRow>(table: "lists" | "aisles", rows: T[], id: string, dir: -1 | 1) {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const i = sorted.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const t = nowIso();
  // Renumber everything so equal sort orders can't get stuck.
  const reordered = [...sorted];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  const changed = reordered
    .map((r, idx) => ({ ...r, sort_order: idx + 1, updated_at: t }))
    .filter((r, idx) => r.sort_order !== sorted.find((s) => s.id === reordered[idx].id)?.sort_order);
  await saveLocal(table, changed);
}

export async function moveList(id: string, dir: -1 | 1) {
  const lists = await db().lists.filter((l) => !l.deleted_at).toArray();
  await move("lists", lists, id, dir);
}

// ---------------------------------------------------------------------------
// Aisles
// ---------------------------------------------------------------------------

export async function renameAisle(aisle: AisleRow, name: string) {
  await saveLocal("aisles", { ...aisle, name: name.trim(), updated_at: nowIso() });
}

export async function moveAisle(id: string, dir: -1 | 1) {
  const aisles = await db().aisles.filter((a) => !a.deleted_at).toArray();
  await move("aisles", aisles, id, dir);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfile(profile: ProfileRow, patch: Partial<Pick<ProfileRow, "display_name" | "colour">>) {
  await saveLocal("profiles", { ...profile, ...patch, updated_at: nowIso() });
}
