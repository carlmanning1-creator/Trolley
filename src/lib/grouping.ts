import type { AisleRow, ListItemRow } from "@/lib/types";

export type Group = { key: string; title: string; icon: string; items: ListItemRow[] };

// Groups the unticked items by aisle, in the order you walk the shop. Lists that don't use
// aisles come back as one group in the order things were added.
export function groupItems(items: ListItemRow[], aisles: AisleRow[], useAisles: boolean): Group[] {
  const open = items.filter((i) => !i.checked);
  if (open.length === 0) return [];
  if (!useAisles) {
    return [{ key: "all", title: "", icon: "", items: open.sort((a, b) => a.created_at.localeCompare(b.created_at)) }];
  }
  const byAisle = new Map<string, ListItemRow[]>();
  const known = new Set(aisles.map((a) => a.id));
  for (const i of open) {
    const k = i.aisle_id && known.has(i.aisle_id) ? i.aisle_id : "none";
    const bucket = byAisle.get(k);
    if (bucket) bucket.push(i);
    else byAisle.set(k, [i]);
  }
  const groups: Group[] = aisles
    .filter((a) => byAisle.has(a.id))
    .map((a) => ({ key: a.id, title: a.name, icon: a.icon, items: byAisle.get(a.id)! }));
  const unsorted = byAisle.get("none");
  if (unsorted) groups.push({ key: "none", title: "Not sorted yet", icon: "📦", items: unsorted });
  for (const g of groups) g.items.sort((x, y) => x.name.localeCompare(y.name));
  return groups;
}
