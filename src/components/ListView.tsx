"use client";

import { useMemo, useState } from "react";
import { ItemRow } from "@/components/ItemRow";
import { findDuplicates } from "@/lib/duplicates";
import { groupItems } from "@/lib/grouping";
import { clearTicked, setChecked, type Actor } from "@/lib/mutations";
import type { AisleRow, ListItemRow, ListRow, ProductRow, ProfileRow } from "@/lib/types";

export function ListView({
  actor,
  list,
  items,
  aisles,
  products,
  profiles,
  highlightIds,
  large = false,
  columns = 1,
  onEdit,
  onDuplicates,
}: {
  actor: Actor;
  list: ListRow;
  items: ListItemRow[];
  aisles: AisleRow[];
  products: Map<string, ProductRow>;
  profiles: Map<string, ProfileRow>;
  highlightIds?: Set<string>;
  large?: boolean;
  columns?: 1 | 2 | 3;
  onEdit: (item: ListItemRow) => void;
  onDuplicates?: (ids: string[]) => void;
}) {
  const [showTicked, setShowTicked] = useState(false);
  const groups = useMemo(() => groupItems(items, aisles, list.use_aisles), [items, aisles, list.use_aisles]);
  const ticked = useMemo(
    () => items.filter((i) => i.checked).sort((a, b) => (b.checked_at ?? "").localeCompare(a.checked_at ?? "")),
    [items],
  );
  const aisleById = useMemo(() => new Map(aisles.map((a) => [a.id, a])), [aisles]);
  const duplicates = useMemo(() => findDuplicates(items), [items]);

  const row = (item: ListItemRow) => (
    <ItemRow
      key={item.id}
      item={item}
      product={item.product_id ? products.get(item.product_id) : undefined}
      aisle={item.aisle_id ? aisleById.get(item.aisle_id) : undefined}
      addedBy={item.added_by ? profiles.get(item.added_by) : undefined}
      highlight={highlightIds?.has(item.id)}
      large={large}
      duplicate={duplicates.has(item.id)}
      onToggle={() => void setChecked(actor, item, !item.checked)}
      onEdit={() => onEdit(item)}
      onDuplicate={onDuplicates ? () => onDuplicates(duplicates.get(item.id) ?? []) : undefined}
    />
  );

  const columnClass = columns === 3 ? "lg:columns-3" : columns === 2 ? "lg:columns-2" : "";

  return (
    <div className="flex flex-col gap-6">
      {groups.length === 0 && (
        <p className={`py-10 text-center text-muted ${large ? "text-2xl" : "text-lg"}`}>
          {ticked.length ? "Everything's in the trolley." : "Nothing on this list yet."}
        </p>
      )}

      <div className={`${columnClass} gap-6`}>
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title || list.name} className="mb-5 break-inside-avoid">
            {g.title && (
              <h3 className={`mb-2 flex items-center gap-2 font-semibold text-muted ${large ? "text-2xl" : "text-sm uppercase tracking-wide"}`}>
                <span aria-hidden>{g.icon}</span>
                {g.title}
              </h3>
            )}
            <ul className="flex flex-col gap-1.5">{g.items.map(row)}</ul>
          </section>
        ))}
      </div>

      {ticked.length > 0 && (
        <section aria-label="In the trolley" className="rounded-2xl bg-surface-2/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={showTicked}
              onClick={() => setShowTicked((s) => !s)}
              className={`flex min-h-11 flex-1 items-center gap-2 px-2 text-left font-semibold ${large ? "text-xl" : ""}`}
            >
              <span aria-hidden>{showTicked ? "▾" : "▸"}</span>
              In the trolley ({ticked.length})
            </button>
            <button
              type="button"
              onClick={() => void clearTicked(list.id)}
              className="min-h-11 rounded-xl px-3 font-medium text-brand-strong hover:bg-surface"
            >
              Clear ticked items
            </button>
          </div>
          {showTicked && <ul className="mt-2 flex flex-col gap-1.5">{ticked.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}
