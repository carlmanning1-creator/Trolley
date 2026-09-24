import { describe, expect, it } from "vitest";
import { nameFit } from "@/lib/offMatch";

describe("nameFit", () => {
  it("rejects products whose name doesn't contain what was typed", () => {
    expect(nameFit("Milk", "Meiji chocolate", "Meiji", false)).toBeNull();
    expect(nameFit("Pantry thing", "Eraser", "Staedtler", true)).toBeNull();
    expect(nameFit("Milk", "Milk Chocolate", "Meiji", true)).toBeNull();
    expect(nameFit("Bananas", "Banana muffins", "White Wings", true)).toBeNull();
  });
  it("accepts and ranks real matches", () => {
    const plain = nameFit("Milk", "Full Cream Milk", "Woolworths", true)!;
    const long = nameFit("Milk", "Lactose free full cream milk", "Brand", false)!;
    expect(plain).toBeGreaterThan(long);
    expect(nameFit("Weet-Bix", "Weet-Bix", "Sanitarium", true)).not.toBeNull();
    expect(nameFit("Tim Tams", "Tim Tam", "Arnott's", true)).not.toBeNull();
    expect(nameFit("Sourdough", "Organic rye sourdough", "Edwards", true)).not.toBeNull();
  });
  it("counts the brand, so 'Vegemite' finds a jar named by brand", () => {
    expect(nameFit("Vegemite", "Yeast extract spread", "Vegemite", true)).not.toBeNull();
  });
});
