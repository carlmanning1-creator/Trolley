import { describe, expect, it } from "vitest";
import { formatQuantity, parseItem } from "@/lib/parse";

describe("parseItem", () => {
  it.each([
    ["milk", { name: "Milk", quantity: null, unit: null }],
    ["2 milk", { name: "Milk", quantity: 2, unit: null }],
    ["2x milk", { name: "Milk", quantity: 2, unit: null }],
    ["2 x milk", { name: "Milk", quantity: 2, unit: null }],
    ["2xmilk", { name: "Milk", quantity: 2, unit: null }],
    ["500g mince", { name: "Mince", quantity: 500, unit: "g" }],
    ["1.5 kg potatoes", { name: "Potatoes", quantity: 1.5, unit: "kg" }],
    ["3 bunches bananas", { name: "Bananas", quantity: 3, unit: "bunch" }],
    ["avocados x3", { name: "Avocados", quantity: 3, unit: null }],
    ["eggs × 2", { name: "Eggs", quantity: 2, unit: null }],
    ["2 green apples", { name: "Green apples", quantity: 2, unit: null }],
    ["milk 2L", { name: "Milk 2L", quantity: null, unit: null }],
    ["7up", { name: "7up", quantity: null, unit: null }],
    ["  weet-bix  ", { name: "Weet-bix", quantity: null, unit: null }],
  ])("%s", (input, expected) => {
    expect(parseItem(input)).toEqual(expected);
  });
});

describe("formatQuantity", () => {
  it("formats quantities and units", () => {
    expect(formatQuantity(null, null)).toBe("");
    expect(formatQuantity(2, null)).toBe("×2");
    expect(formatQuantity(500, "g")).toBe("500g");
    expect(formatQuantity(1.5, "kg")).toBe("1.5kg");
    expect(formatQuantity(2, "pack")).toBe("2 packs");
    expect(formatQuantity(1, "bunch")).toBe("1 bunch");
    expect(formatQuantity(2, "bunch")).toBe("2 bunches");
    expect(formatQuantity(2, "loaf")).toBe("2 loaves");
  });
});
