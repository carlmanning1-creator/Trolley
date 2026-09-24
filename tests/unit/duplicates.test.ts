import { describe, expect, it } from "vitest";
import { findDuplicates, looksLikeSameThing } from "@/lib/duplicates";
import type { ListItemRow } from "@/lib/types";

describe("looksLikeSameThing", () => {
  it.each([
    ["Milk", "milk"],
    ["Banana", "Bananas"],
    ["Tomatos", "Tomatoes"],
    ["Bannanas", "Bananas"],
    ["Milk", "Full cream milk"],
    ["Toilet paper", "Toilet paper 24 pack"],
    ["Weet-Bix", "Weetbix"],
    ["Strawberries", "Strawberry"],
    ["Dishwasher tablets", "Dishwasher tablet"],
    ["Eggs", "Free range eggs"],
    ["Milk 2L", "Milk"],
  ])("%s ~ %s", (a, b) => expect(looksLikeSameThing(a, b)).toBe(true));

  it.each([
    ["Milk", "Milk chocolate"],
    ["Tea", "Pea"],
    ["Butter", "Peanut butter"],
    ["Apples", "Apple juice"],
    ["Bread", "Breadcrumbs"],
    ["Rice", "Mice"],
    ["Eggs", "Eggplant"],
    ["Milk", "Oat milk"],
  ])("%s is not %s", (a, b) => expect(looksLikeSameThing(a, b)).toBe(false));
});

const t = "2026-09-24T00:00:00.000Z";
const item = (id: string, name: string, extra: Partial<ListItemRow> = {}): ListItemRow => ({
  id, household_id: "h", list_id: "l", product_id: null, aisle_id: null, name, quantity: null, unit: null, note: null,
  link: null, distinct_from: [], added_by: null, checked: false, checked_by: null, checked_at: null, check_changed_at: null,
  created_at: t, updated_at: t, deleted_at: null, ...extra,
});

describe("findDuplicates", () => {
  it("groups likely duplicates and ignores ticked items", () => {
    const d = findDuplicates([item("1", "Milk"), item("2", "Full cream milk"), item("3", "Bread"), item("4", "milk", { checked: true })]);
    expect(d.get("1")?.sort()).toEqual(["1", "2"]);
    expect(d.has("3")).toBe(false);
    expect(d.has("4")).toBe(false);
  });
  it("respects 'keep both'", () => {
    const d = findDuplicates([item("1", "Milk", { distinct_from: ["2"] }), item("2", "Full cream milk")]);
    expect(d.size).toBe(0);
  });
  it("flags two items for the same product even with different names", () => {
    const d = findDuplicates([item("1", "Vegemite", { product_id: "p" }), item("2", "Yeast spread", { product_id: "p" })]);
    expect(d.get("1")).toEqual(["1", "2"]);
  });
});
