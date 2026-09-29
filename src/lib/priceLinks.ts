// "Compare prices": links to the product's search results at each store, and a side-by-side
// comparison site. Nothing is fetched from the stores themselves (their terms forbid it); the
// person sees the live price and any special in the store's own app or website. On a phone
// with the store's app installed, its links open in the app.

export type PriceLinks = { woolworths: string; coles: string; compare: string };

// A search that finds the same product: brand, name and pack size ("Bega Vegemite 380g").
export function priceQuery(p: { name: string; brand?: string | null; quantity?: string | null }): string {
  const name = p.name.trim();
  const brand = p.brand?.trim();
  const withBrand = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const size = p.quantity
    ?.trim()
    .toLowerCase()
    .replace(/(\d)\s+(g|kg|ml|l|pk|pack)\b/g, "$1$2");
  return size && !withBrand.toLowerCase().includes(size) ? `${withBrand} ${size}` : withBrand;
}

export function priceLinks(query: string): PriceLinks {
  const q = encodeURIComponent(query);
  return {
    woolworths: `https://www.woolworths.com.au/shop/search/products?searchTerm=${q}`,
    coles: `https://www.coles.com.au/search/products?q=${q}`,
    compare: `https://trolleychecker.com.au/search?q=${q}`,
  };
}
