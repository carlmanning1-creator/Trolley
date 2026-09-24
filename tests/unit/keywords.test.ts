import { describe, expect, it } from "vitest";
import { aisleForName } from "@/lib/keywords";

describe("aisleForName", () => {
  it.each([
    ["Milk", "Dairy & Eggs"],
    ["Full cream milk", "Dairy & Eggs"],
    ["Snags", "Meat & Seafood"],
    ["Weet-Bix", "Breakfast"],
    ["Weetbix", "Breakfast"],
    ["Peanut butter", "Pantry"],
    ["Butter", "Dairy & Eggs"],
    ["Frozen peas", "Frozen"],
    ["Bananas", "Fruit & Veg"],
    ["Strawberries", "Fruit & Veg"],
    ["Tomatoes", "Fruit & Veg"],
    ["Tinned tomatoes", "Pantry"],
    ["Coconut milk", "Pantry"],
    ["Toilet paper", "Cleaning & Household"],
    ["Dishwasher tablets", "Cleaning & Household"],
    ["Nappies", "Baby"],
    ["Cat food", "Pet"],
    ["Tim Tams", "Snacks & Lollies"],
    ["Chips", "Snacks & Lollies"],
    ["Coke", "Drinks"],
    ["Sourdough", "Bakery"],
    ["Shampoo", "Health & Beauty"],
    ["Ice cream", "Frozen"],
    ["Chicken thighs", "Meat & Seafood"],
    ["Chicken stock", "Pantry"],
    ["Hummus", "Deli"],
    ["Eggs", "Dairy & Eggs"],
  ])("%s goes to %s", (name, aisle) => {
    expect(aisleForName(name)).toBe(aisle);
  });

  it("returns null for unknown things", () => {
    expect(aisleForName("Birthday card for Nan")).toBeNull();
    expect(aisleForName("")).toBeNull();
  });

  it("does not match inside other words", () => {
    expect(aisleForName("Eggplant")).toBe("Fruit & Veg");
    expect(aisleForName("Rice")).toBe("Pantry");
  });
});
