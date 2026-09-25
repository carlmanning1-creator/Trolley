import type { AisleRow, ListItemRow, ProductRow, PurchaseRow, ShoppingSessionRow, Store } from "@/lib/types";

// Learns the order a store's aisles are walked in, from the order things were ticked off on
// past trips there. Each trip gives every aisle a position from 0 (first) to 1 (last); an
// aisle's place is its average over recent trips. Aisles never seen at that store keep their
// usual place, spread across the same 0 to 1 range.

const TRIPS_USED = 6; // recent trips only, in case the store is rearranged
const MIN_TRIPS = 2; // one trip could be a one-off route
const MIN_AISLES_PER_TRIP = 3; // a two-aisle top-up says little about the layout

export const STORE_NAMES: Record<Store, string> = {
  coles: "Coles",
  woolworths: "Woolworths",
  aldi: "Aldi",
  other: "Somewhere else",
};

export function learnedAisleOrder(opts: {
  store: Store;
  aisles: AisleRow[]; // in the household's usual order
  sessions: ShoppingSessionRow[];
  purchases: PurchaseRow[];
  items: Map<string, ListItemRow>;
  products: Map<string, ProductRow>;
}): AisleRow[] | null {
  if (opts.store === "other") return null;
  const trips = opts.sessions
    .filter((s) => s.store === opts.store)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const tripIds = new Set(trips.map((t) => t.id));

  const byTrip = new Map<string, PurchaseRow[]>();
  for (const p of opts.purchases) {
    if (p.deleted_at || !p.session_id || !tripIds.has(p.session_id)) continue;
    const bucket = byTrip.get(p.session_id);
    if (bucket) bucket.push(p);
    else byTrip.set(p.session_id, [p]);
  }

  const positions = new Map<string, number[]>();
  let used = 0;
  for (const trip of trips) {
    if (used >= TRIPS_USED) break;
    const ticks = (byTrip.get(trip.id) ?? []).sort((a, b) => a.bought_at.localeCompare(b.bought_at));
    const walk: string[] = [];
    for (const p of ticks) {
      const aisle =
        (p.list_item_id ? opts.items.get(p.list_item_id)?.aisle_id : null) ?? opts.products.get(p.product_id)?.aisle_id;
      if (aisle && !walk.includes(aisle)) walk.push(aisle);
    }
    if (walk.length < MIN_AISLES_PER_TRIP) continue;
    used++;
    walk.forEach((aisle, i) => positions.set(aisle, [...(positions.get(aisle) ?? []), i / (walk.length - 1)]));
  }
  if (used < MIN_TRIPS) return null;

  const usual = (i: number) => (opts.aisles.length > 1 ? i / (opts.aisles.length - 1) : 0);
  const place = (aisle: AisleRow, i: number) => {
    const seen = positions.get(aisle.id);
    return seen ? seen.reduce((a, b) => a + b, 0) / seen.length : usual(i);
  };
  return opts.aisles
    .map((a, i) => ({ a, key: place(a, i), i }))
    .sort((x, y) => x.key - y.key || x.i - y.i)
    .map((x) => x.a);
}
