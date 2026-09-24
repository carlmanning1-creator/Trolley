import { describe, expect, it } from "vitest";
import { aisleForOffCategories } from "@/lib/offCategories";

describe("aisleForOffCategories", () => {
  it.each([
    [["en:plant-based-foods-and-beverages", "en:spreads", "en:yeast-extract-spreads"], "Pantry"],
    [["en:dairies", "en:milks", "en:whole-milks"], "Dairy & Eggs"],
    [["en:breakfasts", "en:cereals-and-their-products", "en:breakfast-cereals"], "Breakfast"],
    [["en:desserts", "en:frozen-foods", "en:frozen-desserts", "en:ice-creams"], "Frozen"],
    [["en:beverages", "en:carbonated-drinks", "en:sodas"], "Drinks"],
    [["en:snacks", "en:salty-snacks", "en:chips-and-fries", "en:crisps"], "Snacks & Lollies"],
    [["en:meats", "en:poultry", "en:chickens"], "Meat & Seafood"],
    [["en:cereals-and-potatoes", "en:breads", "en:sliced-breads"], "Bakery"],
    [["en:baby-foods", "en:baby-milks"], "Baby"],
    [["en:pet-food", "en:dog-food"], "Pet"],
  ])("%j -> %s", (tags, aisle) => {
    expect(aisleForOffCategories(tags)).toBe(aisle);
  });
  it("returns null with nothing to go on", () => {
    expect(aisleForOffCategories([])).toBeNull();
    expect(aisleForOffCategories(null)).toBeNull();
    expect(aisleForOffCategories(["en:unknown-thing"])).toBeNull();
  });
});
