import { describe, expect, it } from "vitest";
import { groupItems } from "@/components/ListView";
import type { AisleRow, ListItemRow } from "@/lib/types";

const t = "2026-01-01T00:00:00.000Z";
const aisle = (id: string, name: string, sort_order: number): AisleRow => ({
  id, household_id: "h", name, icon: "x", sort_order, created_at: t, updated_at: t, deleted_at: null,
});
const item = (id: string, name: string, aisle_id: string | null, checked = false, created_at = t): ListItemRow => ({
  id, household_id: "h", list_id: "l", product_id: null, aisle_id, name, quantity: null, unit: null, note: null,
  link: null, added_by: null, checked, checked_by: null, checked_at: null, check_changed_at: null, created_at, updated_at: t,
  deleted_at: null,
});

describe("groupItems", () => {
  const aisles = [aisle("fv", "Fruit & Veg", 1), aisle("d", "Dairy", 2)];

  it("groups by aisle in walk order, unsorted last, ticked excluded", () => {
    const groups = groupItems(
      [item("1", "Milk", "d"), item("2", "Apples", "fv"), item("3", "Card", null), item("4", "Bananas", "fv", true)],
      aisles,
      true,
    );
    expect(groups.map((g) => g.title)).toEqual(["Fruit & Veg", "Dairy", "Not sorted yet"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Apples"]);
  });

  it("keeps a flat list in the order things were added", () => {
    const groups = groupItems(
      [item("1", "Zinc", null, false, "2026-01-02T00:00:00.000Z"), item("2", "Apples", "fv", false, "2026-01-01T00:00:00.000Z")],
      aisles,
      false,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Apples", "Zinc"]);
  });
});
