"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { autoSortProduct } from "@/lib/autosort";
import { findPicture } from "@/lib/images";
import { deleteItem, updateItem, type Actor } from "@/lib/mutations";
import type { AisleRow, ListItemRow } from "@/lib/types";

const UNIT_OPTIONS = ["", "kg", "g", "L", "mL", "pack", "dozen", "bunch", "can", "bottle", "bag", "box", "jar", "loaf"];

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
    // Renamed to something else: find that thing's aisle and picture.
    if (relinked) {
      if (!relinked.aisle_id) void autoSortProduct(relinked);
      if (!relinked.image_path) void findPicture(relinked);
    }
    onClose();
  }

  async function remove() {
    await deleteItem(item);
    onClose();
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
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="item-qty" className="mb-1 block font-medium">
            Quantity
          </label>
          <input
            id="item-qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={field}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="item-unit" className="mb-1 block font-medium">
            Unit
          </label>
          <select id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={field}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u || "none"}
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
    </form>
  );
}
