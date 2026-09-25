import { describe, expect, it } from "vitest";
import { learnedAisleOrder } from "@/lib/storeOrder";
import type { AisleRow, ListItemRow, ProductRow, PurchaseRow, ShoppingSessionRow, Store } from "@/lib/types";

const stamp = { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const aisle = (id: string, sort_order: number): AisleRow => ({ id, household_id: "h", name: id, icon: "", sort_order, deleted_at: null, ...stamp });
// The household's usual order: the way the kitchen list is sorted.
const AISLES = ["veg", "bakery", "meat", "dairy", "pantry", "frozen"].map((id, i) => aisle(id, i + 1));

const products = new Map<string, ProductRow>(
  AISLES.map((a) => [
    `p-${a.id}`,
    {
      id: `p-${a.id}`,
      household_id: "h",
      name: a.id,
      barcode: null,
      aisle_id: a.id,
      image_path: null,
      image_source: "none",
      off_code: null,
      is_staple: false,
      default_quantity: null,
      default_unit: null,
      times_bought: 0,
      last_bought_at: null,
      deleted_at: null,
      ...stamp,
    },
  ]),
);

let n = 0;
// A trip to a store where things were ticked off in the given aisle order.
function trip(store: Store, day: number, walk: string[]) {
  const session: ShoppingSessionRow = {
    id: `s${n++}`,
    household_id: "h",
    list_id: "l",
    started_by: null,
    started_at: `2026-10-${String(day).padStart(2, "0")}T09:00:00Z`,
    ended_at: null,
    store,
    ...stamp,
  };
  const purchases: PurchaseRow[] = walk.map((a, i) => ({
    id: `b${n++}`,
    household_id: "h",
    product_id: `p-${a}`,
    list_item_id: null,
    list_id: "l",
    session_id: session.id,
    bought_by: null,
    bought_at: `2026-10-${String(day).padStart(2, "0")}T09:${String(10 + i).padStart(2, "0")}:00Z`,
    deleted_at: null,
    ...stamp,
  }));
  return { session, purchases };
}

function order(store: Store, trips: ReturnType<typeof trip>[]) {
  const result = learnedAisleOrder({
    store,
    aisles: AISLES,
    sessions: trips.map((t) => t.session),
    purchases: trips.flatMap((t) => t.purchases),
    items: new Map<string, ListItemRow>(),
    products,
  });
  return result?.map((a) => a.id) ?? null;
}

describe("learnedAisleOrder", () => {
  it("follows the order things get ticked off at that store", () => {
    // This Coles has the fridges first and the veg at the back.
    const trips = [
      trip("coles", 1, ["dairy", "meat", "pantry", "veg"]),
      trip("coles", 15, ["dairy", "meat", "bakery", "veg"]),
    ];
    expect(order("coles", trips)).toEqual(["dairy", "meat", "bakery", "pantry", "veg", "frozen"]);
  });

  it("keeps each store separate", () => {
    const trips = [
      trip("coles", 1, ["dairy", "meat", "pantry", "veg"]),
      trip("coles", 15, ["dairy", "meat", "pantry", "veg"]),
      trip("woolworths", 8, ["veg", "bakery", "dairy"]),
    ];
    expect(order("woolworths", trips)).toBeNull(); // only one trip there so far
    expect(order("coles", trips)?.[0]).toBe("dairy");
  });

  it("waits for two real trips, ignoring small top-ups", () => {
    expect(order("aldi", [trip("aldi", 1, ["veg", "dairy", "pantry"])])).toBeNull();
    expect(order("aldi", [trip("aldi", 1, ["veg", "dairy", "pantry"]), trip("aldi", 3, ["dairy", "veg"])])).toBeNull();
  });

  it("never reorders for Somewhere else", () => {
    const trips = [trip("other", 1, ["frozen", "veg", "dairy"]), trip("other", 2, ["frozen", "veg", "dairy"])];
    expect(order("other", trips)).toBeNull();
  });
});
