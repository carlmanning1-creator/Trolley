"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { autoSortProduct } from "@/lib/autosort";
import { db } from "@/lib/db";
import { findPicture } from "@/lib/images";
import { deleteItem, restoreItems, updateItem, type Actor } from "@/lib/mutations";
import { notify } from "@/lib/notices";
import type { AisleRow, ListItemRow } from "@/lib/types";

const UNIT_OPTIONS = ["", "kg", "g", "L", "mL", "pack", "dozen", "bunch", "can", "bottle", "bag", "box", "jar", "loaf"];

// The quantity after tapping − or +: whole steps, never below one, empty means "not set".
function step(value: string, by: 1 | -1): string {
  const n = Number(value.replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(n)) return by > 0 ? "2" : "";
  const next = Math.floor(n) + by;
  return next < 1 ? "" : String(next);
}

export function ItemSheet({
  actor,
  item,
  aisles,
  onClose,
  extra,
}: {
  actor: Actor;
  item: ListItemRow | null;
  aisles: AisleRow[];
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <Sheet open={Boolean(item)} onClose={onClose} title="Edit item">
      {item && <ItemForm key={item.id} actor={actor} item={item} aisles={aisles} onClose={onClose} extra={extra} />}
    </Sheet>
  );
}

function ItemForm({
  actor,
  item,
  aisles,
  onClose,
  extra,
}: {
  actor: Actor;
  item: ListItemRow;
  aisles: AisleRow[];
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [link, setLink] = useState(item.link ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [aisleId, setAisleId] = useState(item.aisle_id ?? "");
  // The less-used fields start folded, unless this item already uses one of them.
  const [more, setMore] = useState(Boolean(item.link));

  async function save(e: FormEvent) {
    e.preventDefault();
    const q = quantity.trim() === "" ? null : Number(quantity.replace(",", "."));
    let cleanLink: string | null = link.trim() || null;
    if (cleanLink && !/^https?:\/\//i.test(cleanLink)) cleanLink = `https://${cleanLink}`;
    if (cleanLink) {
      try {
        const u = new URL(cleanLink);
        if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
        cleanLink = u.toString();
      } catch {
        setLinkError("That doesn't look like a web address.");
        setMore(true);
        return;
      }
    }
    const relinked = await updateItem(actor, item, {
      name: name.trim() || item.name,
      quantity: q !== null && Number.isFinite(q) && q > 0 ? q : null,
      unit: unit || null,
      note: note.trim() || null,
      link: cleanLink,
      ...(aisleId !== (item.aisle_id ?? "") ? { aisle_id: aisleId || null } : {}),
    });
    const newNote = note.trim() || null;
    // Renamed to something else: find that thing's aisle and picture.
    if (relinked) {
      if (!relinked.aisle_id) void autoSortProduct(relinked);
      if (!relinked.image_path) void findPicture(relinked, { note: newNote });
    } else if (newNote !== (item.note ?? null) && item.product_id) {
      // A changed note can say which one ("Sanitarium 1.2kg"): look again, keeping any photo.
      const product = await db().products.get(item.product_id);
      if (product && product.image_source !== "photo" && product.image_source !== "upload") {
        void findPicture(product, { force: true, note: newNote, keepPhotos: true });
      }
    }
    onClose();
  }

  async function remove() {
    await deleteItem(item);
    onClose();
    notify(`Deleted ${item.name}`, { label: "Undo", run: () => restoreItems([item.id]) });
  }

  const field = "min-h-12 w-full rounded-xl border border-border bg-background px-3 text-lg";
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div>
        <label htmlFor="item-name" className="mb-1 block font-medium">
          Name
        </label>
        <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="item-qty" className="mb-1 block font-medium">
          Quantity
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="One less"
            onClick={() => setQuantity(step(quantity, -1))}
            className="min-h-12 min-w-12 rounded-xl border border-border text-2xl"
          >
            −
          </button>
          <input
            id="item-qty"
            inputMode="decimal"
            value={quantity}
            placeholder="–"
            onChange={(e) => setQuantity(e.target.value)}
            className={`${field} w-20 text-center`}
          />
          <button
            type="button"
            aria-label="One more"
            onClick={() => setQuantity(step(quantity, 1))}
            className="min-h-12 min-w-12 rounded-xl border border-border text-2xl"
          >
            +
          </button>
          <label htmlFor="item-unit" className="sr-only">
            Unit
          </label>
          <select id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field} min-w-0 flex-1`}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u || "no unit"}
              </option>
            ))}
            {unit && !UNIT_OPTIONS.includes(unit) && <option value={unit}>{unit}</option>}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="item-note" className="mb-1 block font-medium">
          Note
        </label>
        <input
          id="item-note"
          value={note}
          placeholder="e.g. the 2L one"
          onChange={(e) => setNote(e.target.value)}
          className={field}
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => void remove()}
          className="min-h-12 flex-1 rounded-xl border border-danger px-4 font-semibold text-danger"
        >
          Delete
        </button>
        <button type="submit" className="min-h-12 flex-[2] rounded-xl bg-brand px-4 font-semibold text-brand-contrast">
          Save
        </button>
      </div>
      <details
        open={more}
        onToggle={(e) => setMore((e.currentTarget as HTMLDetailsElement).open)}
        className="rounded-xl border border-border px-3"
      >
        <summary className="flex min-h-12 cursor-pointer items-center font-medium">More: link, aisle, picture, staple</summary>
        <div className="flex flex-col gap-4 pb-3">
        <div>
          <label htmlFor="item-link" className="mb-1 block font-medium">
            Link
          </label>
          <input
            id="item-link"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            placeholder="e.g. a product page"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(null);
            }}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? "item-link-error" : undefined}
            className={field}
          />
          {linkError && (
            <p id="item-link-error" role="alert" className="mt-1 text-sm text-danger">
              {linkError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="item-aisle" className="mb-1 block font-medium">
            Aisle
          </label>
          <select id="item-aisle" value={aisleId} onChange={(e) => setAisleId(e.target.value)} className={field}>
            <option value="">Not sorted</option>
            {aisles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </div>
        {extra}
        </div>
      </details>
    </form>
  );
}
