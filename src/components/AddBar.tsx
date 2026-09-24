"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { db } from "@/lib/db";
import { addItem, normaliseName, type Actor, type AddResult } from "@/lib/mutations";
import { parseItem } from "@/lib/parse";
import type { ProductRow } from "@/lib/types";

// The text box pinned at the top. Enter adds straight away; suggestions come from the catalogue.
export function AddBar({
  actor,
  listId,
  onAdded,
  large = false,
}: {
  actor: Actor;
  listId: string;
  onAdded: (result: AddResult) => void;
  large?: boolean;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const products = useLiveQuery(() => db().products.toArray(), []);
  const onList = useLiveQuery(
    async () =>
      new Set(
        (await db().list_items.where("list_id").equals(listId).toArray())
          .filter((i) => !i.deleted_at && !i.checked)
          .map((i) => i.product_id),
      ),
    [listId],
  );

  const suggestions = useMemo(() => {
    const query = normaliseName(parseItem(text).name);
    if (!query || !products) return [];
    const seen = new Set<string>();
    return products
      .filter((p) => !p.deleted_at)
      .map((p) => {
        const name = normaliseName(p.name);
        const starts = name.startsWith(query) || name.split(" ").some((w) => w.startsWith(query));
        const contains = name.includes(query);
        const score =
          (starts ? 100 : contains ? 50 : 0) + (p.is_staple ? 20 : 0) + Math.min(p.times_bought, 20);
        return { p, name, score };
      })
      .filter((s) => s.score >= 50)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)))
      .slice(0, 6)
      .map((s) => s.p);
  }, [text, products]);

  async function submit(e?: FormEvent, product?: ProductRow) {
    e?.preventDefault();
    // Read straight from the box and clear it before saving, so fast typing never loses an item.
    const value = (input.current?.value ?? text).trim();
    if (!product && !value) return;
    setText("");
    if (input.current) input.current.value = "";
    input.current?.focus();
    const parsed = parseItem(value);
    const result = await addItem(
      actor,
      listId,
      product ? { product, quantity: parsed.quantity, unit: parsed.unit } : { text: value },
    );
    if (result) onAdded(result);
  }

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative">
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="add-item" className="sr-only">
          Add an item
        </label>
        <input
          ref={input}
          id="add-item"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          placeholder="Add an item, e.g. 2 milk"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          className={`min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 shadow-sm ${
            large ? "min-h-16 text-2xl" : "min-h-12 text-lg"
          }`}
        />
        <button
          type="submit"
          aria-label="Add"
          className={`rounded-2xl bg-brand font-semibold text-brand-contrast ${
            large ? "min-h-16 min-w-16 px-6 text-2xl" : "min-h-12 min-w-12 px-4 text-lg"
          }`}
        >
          Add
        </button>
      </form>
      {showSuggestions && (
        <ul
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        >
          {suggestions.map((p) => {
            const already = onList?.has(p.id);
            return (
              <li key={p.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void submit(undefined, p)}
                  className={`flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left hover:bg-surface-2 ${
                    large ? "text-xl" : "text-base"
                  }`}
                >
                  <span className={already ? "text-muted" : ""}>
                    {p.name}
                    {p.is_staple && <span className="ml-2 text-sm text-brand-strong">★ staple</span>}
                  </span>
                  {already && <span className="text-sm text-muted">on the list</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
