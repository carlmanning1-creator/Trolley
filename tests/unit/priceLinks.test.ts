import { describe, expect, it } from "vitest";
import { priceLinks, priceQuery } from "@/lib/priceLinks";

describe("priceQuery", () => {
  it("searches by brand, name and pack size", () => {
    expect(priceQuery({ name: "Vegemite", brand: "Bega", quantity: "380 g" })).toBe("Bega Vegemite 380g");
  });

  it("doesn't repeat what the name already says", () => {
    expect(priceQuery({ name: "Sanitarium Weet-Bix 1.2kg", brand: "Sanitarium", quantity: "1.2 kg" })).toBe(
      "Sanitarium Weet-Bix 1.2kg",
    );
  });

  it("falls back to the name alone", () => {
    expect(priceQuery({ name: " Tim Tams " })).toBe("Tim Tams");
  });
});

describe("priceLinks", () => {
  it("builds each store's search link", () => {
    const links = priceLinks("Bega Vegemite 380g");
    expect(links.woolworths).toBe("https://www.woolworths.com.au/shop/search/products?searchTerm=Bega%20Vegemite%20380g");
    expect(links.coles).toBe("https://www.coles.com.au/search/products?q=Bega%20Vegemite%20380g");
    expect(links.compare).toBe("https://trolleychecker.com.au/search?q=Bega%20Vegemite%20380g");
  });
});
