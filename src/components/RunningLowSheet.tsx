"use client";

import { useMemo } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Sheet } from "@/components/Sheet";
import { addItem, updateProduct, type Actor, type AddResult } from "@/lib/mutations";
import { describeGap, describeSince, type Suggestion } from "@/lib/runningLow";
import type { AisleRow } from "@/lib/types";

// Things that are probably due, going by how often they've been bought. Nothing is added
// without a tap.
export function RunningLowSheet({
  open,
  onClose,
  actor,
  listId,
  listName,
  aisles,
  suggestions,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  listId: string;
  listName: string;
  aisles: AisleRow[];
  suggestions: Suggestion[];
  onAdded: (result: AddResult) => void;
}) {
  const aisleById = useMemo(() => new Map(aisles.map((a) => [a.id, a])), [aisles]);
  const toAdd = suggestions.filter((s) => !s.onList);

  async function add(s: Suggestion) {
    const result = await addItem(actor, listId, { product: s.product });
    if (result) onAdded(result);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Running low" wide>
      <p className="mb-4 text-muted">
        Going by how often you buy them, these might be due for {listName}.
      </p>
      {suggestions.length === 0 ? (
        <p className="py-6 text-center text-muted">
          Nothing looks due right now. This learns from what gets ticked off, and starts suggesting something once
          it&apos;s been bought three times.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {suggestions.map((s) => (
            <li
              key={s.product.id}
              className="flex items-center gap-2 rounded-2xl bg-surface-2/60 p-1.5"
              data-testid="running-low-row"
              data-name={s.product.name}
            >
              <button
                type="button"
                onClick={() => void add(s)}
                disabled={s.onList}
                aria-label={s.onList ? `${s.product.name} is already on the list` : `Add ${s.product.name}`}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left disabled:opacity-45"
              >
                <ProductThumb
                  product={s.product}
                  aisle={s.product.aisle_id ? aisleById.get(s.product.aisle_id) : undefined}
                  size={44}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-medium">{s.product.name}</span>
                  <span className="block text-sm text-muted">
                    Usually {describeGap(s.usualDays)} · last bought {describeSince(s.lastBought)}
                  </span>
                </span>
                <span aria-hidden className="text-sm font-semibold whitespace-nowrap text-brand-strong">
                  {s.onList ? "On list" : "+ Add"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void updateProduct(s.product, { hide_running_low: true })}
                aria-label={`Don't suggest ${s.product.name}`}
                title="Don't suggest this"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-muted hover:bg-surface"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {toAdd.length > 1 && (
        <button
          type="button"
          onClick={async () => {
            for (const s of toAdd) await add(s);
            onClose();
          }}
          className="mt-4 min-h-12 w-full rounded-xl bg-brand font-semibold text-brand-contrast"
        >
          Add all {toAdd.length}
        </button>
      )}
    </Sheet>
  );
}
