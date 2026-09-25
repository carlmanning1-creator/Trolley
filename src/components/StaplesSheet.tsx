"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Sheet } from "@/components/Sheet";
import { db } from "@/lib/db";
import { addItem, updateProduct, type Actor } from "@/lib/mutations";
import type { AisleRow, ProductRow } from "@/lib/types";

const EIGHT_WEEKS_MS = 56 * 24 * 60 * 60 * 1000;

type Tab = "staples" | "recent";

export function StaplesSheet({
  open,
  onClose,
  actor,
  listId,
  aisles,
  initialTab = "staples",
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  listId: string;
  aisles: AisleRow[];
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const aisleById = useMemo(() => new Map(aisles.map((a) => [a.id, a])), [aisles]);
  const aisleOrder = useMemo(() => new Map(aisles.map((a, i) => [a.id, i])), [aisles]);

  const data = useLiveQuery(async () => {
    const [allProducts, items, purchases] = await Promise.all([
      db().products.toArray(),
      db().list_items.where("list_id").equals(listId).toArray(),
      db().purchases.toArray(),
    ]);
    const products = allProducts.filter((p) => !p.deleted_at);
    const onList = new Set(items.filter((i) => !i.deleted_at && !i.checked).map((i) => i.product_id));
    // Bought = ticked off in the last eight weeks (plus anything a confirmed receipt counted
    // before purchase history existed).
    const since = Date.now() - EIGHT_WEEKS_MS;
    const counts = new Map<string, number>();
    for (const p of purchases) {
      if (!p.deleted_at && Date.parse(p.bought_at) >= since) counts.set(p.product_id, (counts.get(p.product_id) ?? 0) + 1);
    }
    for (const p of products) {
      if (p.last_bought_at && new Date(p.last_bought_at).getTime() >= since && !counts.has(p.id)) {
        counts.set(p.id, Math.max(1, p.times_bought));
      }
    }
    return { products, onList, counts };
  }, [listId]);

  const staples = useMemo(
    () =>
      (data?.products ?? [])
        .filter((p) => p.is_staple)
        .sort(
          (a, b) =>
            (aisleOrder.get(a.aisle_id ?? "") ?? 999) - (aisleOrder.get(b.aisle_id ?? "") ?? 999) ||
            a.name.localeCompare(b.name),
        ),
    [data, aisleOrder],
  );
  const recent = useMemo(
    () =>
      (data?.products ?? [])
        .filter((p) => data?.counts.has(p.id))
        .sort((a, b) => (data!.counts.get(b.id)! - data!.counts.get(a.id)!) || a.name.localeCompare(b.name)),
    [data],
  );

  const rows = tab === "staples" ? staples : recent;

  return (
    <Sheet open={open} onClose={onClose} title={tab === "staples" ? "Staples" : "Recently bought"} wide>
      <div role="tablist" aria-label="Show" className="mb-4 flex gap-2">
        {(["staples", "recent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-full font-medium ${tab === t ? "bg-brand text-brand-contrast" : "bg-surface-2"}`}
          >
            {t === "staples" ? "Staples" : "Recent (8 weeks)"}
          </button>
        ))}
      </div>
      {rows.length === 0 && (
        <p className="py-6 text-center text-muted">
          {tab === "staples"
            ? "No staples yet. Open any item's editor and tap “Staple” to keep it here."
            : "Nothing bought in the last eight weeks yet."}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {rows.map((p) => (
          <StapleRow
            key={p.id}
            product={p}
            aisle={p.aisle_id ? aisleById.get(p.aisle_id) : undefined}
            onList={data?.onList.has(p.id) ?? false}
            count={tab === "recent" ? data?.counts.get(p.id) : undefined}
            onAdd={() => void addItem(actor, listId, { product: p })}
            onToggleStaple={() => void updateProduct(p, { is_staple: !p.is_staple })}
          />
        ))}
      </ul>
    </Sheet>
  );
}

function StapleRow({
  product,
  aisle,
  onList,
  count,
  onAdd,
  onToggleStaple,
}: {
  product: ProductRow;
  aisle: AisleRow | undefined;
  onList: boolean;
  count?: number;
  onAdd: () => void;
  onToggleStaple: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-2xl bg-surface-2/60 p-1.5" data-testid="staple-row" data-name={product.name}>
      <button
        type="button"
        onClick={onAdd}
        disabled={onList}
        aria-label={onList ? `${product.name} is already on the list` : `Add ${product.name}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left disabled:opacity-45"
      >
        <ProductThumb product={product} aisle={aisle} size={44} />
        <span className="min-w-0 flex-1 truncate text-lg font-medium">{product.name}</span>
        {count !== undefined && <span className="text-sm text-muted">×{count}</span>}
        <span aria-hidden className="text-sm font-semibold text-brand-strong">
          {onList ? "On list" : "+ Add"}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleStaple}
        aria-pressed={product.is_staple}
        aria-label={product.is_staple ? `Remove ${product.name} from staples` : `Make ${product.name} a staple`}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl"
      >
        {product.is_staple ? "★" : "☆"}
      </button>
    </li>
  );
}
