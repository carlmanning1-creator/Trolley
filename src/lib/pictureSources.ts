import type { ProductRow } from "@/lib/types";

// The product's page on Open Food Facts, kept as a picture's source.
export function offProductPage(code: string): string {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`;
}

// The source page of a product's picture. Pictures from before sources were recorded only
// know it when they came from Open Food Facts.
export function sourceUrlOf(
  product: Pick<ProductRow, "image_source" | "image_source_url" | "off_code">,
): string | null {
  if (product.image_source_url) return product.image_source_url;
  return product.image_source === "off" && product.off_code ? offProductPage(product.off_code) : null;
}

// Where a product's picture came from, in words, for the picture editor.
export function describeSource(product: Pick<ProductRow, "image_path" | "image_source" | "image_source_url">): string | null {
  if (!product.image_path) return null;
  switch (product.image_source) {
    case "off":
      return "From Open Food Facts";
    case "commons":
      return "From Wikimedia Commons";
    case "web": {
      try {
        return `From ${new URL(product.image_source_url ?? "").hostname.replace(/^www\./, "")}`;
      } catch {
        return "From a web search";
      }
    }
    case "photo":
      return "A photo someone here took";
    case "upload":
      return "A picture someone here uploaded";
    default:
      return null;
  }
}
