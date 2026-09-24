"use client";

import { useProductImageUrl } from "@/lib/images";
import type { AisleRow, ProductRow } from "@/lib/types";

// The product picture, or a clean tile with the aisle icon when there isn't one.
export function ProductThumb({
  product,
  aisle,
  size = 48,
}: {
  product: ProductRow | undefined;
  aisle: AisleRow | undefined;
  size?: number;
}) {
  const url = useProductImageUrl(product?.image_path ?? null);
  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={style}
        className="shrink-0 rounded-xl bg-white object-contain"
        draggable={false}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: size * 0.5 }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-surface-2"
    >
      {aisle?.icon ?? "🛒"}
    </span>
  );
}
