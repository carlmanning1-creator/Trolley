"use client";

import { useEffect, useState } from "react";
import { offLookupBarcode } from "@/lib/images";
import { priceLinks, priceQuery } from "@/lib/priceLinks";

type Details = { name: string; brand?: string | null; quantity?: string | null };

// "Compare prices" for a barcoded product: opens the product's search at Woolworths, at Coles,
// or on a side-by-side comparison site. Brand and pack size come from Open Food Facts when we
// have them, so the stores find the same product rather than every one with a similar name.
export function ComparePrices({ barcode, name, known }: { barcode: string; name: string; known?: Details }) {
  const [details, setDetails] = useState<Details | null>(known ?? null);

  useEffect(() => {
    if (known || !navigator.onLine) return;
    let cancelled = false;
    offLookupBarcode(barcode)
      .then((off) => {
        if (!cancelled && off) setDetails({ name: off.name, brand: off.brand, quantity: off.quantity });
      })
      .catch(() => undefined); // the name alone still makes a useful search
    return () => {
      cancelled = true;
    };
  }, [barcode, known]);

  // Our own name wins (people tidy it up), with the brand and size filled in from the barcode.
  const query = priceQuery({ name, brand: details?.brand, quantity: details?.quantity });
  const links = priceLinks(query);
  const link = "flex min-h-11 items-center justify-center rounded-xl border border-border px-2 text-sm font-semibold";

  return (
    <section aria-label="Compare prices" className="flex flex-col gap-2">
      <p className="font-medium">Compare prices</p>
      <div className="grid grid-cols-3 gap-2">
        <a href={links.woolworths} target="_blank" rel="noopener noreferrer" className={link}>
          Woolworths
        </a>
        <a href={links.coles} target="_blank" rel="noopener noreferrer" className={link}>
          Coles
        </a>
        <a href={links.compare} target="_blank" rel="noopener noreferrer" className={link}>
          Side by side
        </a>
      </div>
      <p className="text-sm text-muted">
        Looks up &ldquo;{query}&rdquo;. Prices and specials open in the store&apos;s app or website.
      </p>
    </section>
  );
}
