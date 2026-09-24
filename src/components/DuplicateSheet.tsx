"use client";

import { useState } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Sheet } from "@/components/Sheet";
import { keepSeparate, mergeItems } from "@/lib/mutations";
import { formatQuantity } from "@/lib/parse";
import type { AisleRow, ListItemRow, ProductRow, ProfileRow } from "@/lib/types";

export function DuplicateSheet({
  group,
  products,
  aisles,
  profiles,
  onClose,
}: {
  group: ListItemRow[] | null;
  products: Map<string, ProductRow>;
  aisles: AisleRow[];
  profiles: Map<string, ProfileRow>;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(group && group.length > 1)} onClose={onClose} title="Possible duplicates">
      {group && group.length > 1 && (
        <DuplicateForm key={group.map((g) => g.id).join()} group={group} products={products} aisles={aisles} profiles={profiles} onClose={onClose} />
      )}
    </Sheet>
  );
}

function DuplicateForm({
  group,
  products,
  aisles,
  profiles,
  onClose,
}: {
  group: ListItemRow[];
  products: Map<string, ProductRow>;
  aisles: AisleRow[];
  profiles: Map<string, ProfileRow>;
  onClose: () => void;
}) {
  // Default to keeping the one added first.
  const [keepId, setKeepId] = useState(() => [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id);
  const [busy, setBusy] = useState(false);

  async function merge() {
    setBusy(true);
    const keep = group.find((g) => g.id === keepId)!;
    await mergeItems(keep, group.filter((g) => g.id !== keepId));
    onClose();
  }
  async function separate() {
    setBusy(true);
    await keepSeparate(group);
    onClose();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">These look like the same thing. Pick the one to keep and merge, or keep them all.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Keep which one</legend>
        {group.map((i) => {
          const qty = formatQuantity(i.quantity, i.unit);
          const who = i.added_by ? profiles.get(i.added_by)?.display_name : undefined;
          return (
            <label
              key={i.id}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 p-2 ${keepId === i.id ? "border-brand" : "border-transparent bg-surface-2"}`}
            >
              <input
                type="radio"
                name="keep"
                checked={keepId === i.id}
                onChange={() => setKeepId(i.id)}
                className="h-5 w-5 accent-[var(--brand)]"
              />
              <ProductThumb
                product={i.product_id ? products.get(i.product_id) : undefined}
                aisle={aisles.find((a) => a.id === i.aisle_id)}
                size={44}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {i.name}
                  {qty && <span className="ml-2 font-normal text-muted">{qty}</span>}
                </span>
                <span className="block text-sm text-muted">
                  {[i.note, who && `added by ${who}`].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="text-sm text-muted">Merging adds the quantities together and keeps every note.</p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void separate()}
          className="min-h-12 flex-1 rounded-xl border border-border font-semibold"
        >
          Keep both
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void merge()}
          className="min-h-12 flex-[2] rounded-xl bg-brand font-semibold text-brand-contrast"
        >
          Merge into one
        </button>
      </div>
    </div>
  );
}
