"use client";

import { useRef, useState, type PointerEvent } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { formatQuantity } from "@/lib/parse";
import type { AisleRow, ListItemRow, ProductRow, ProfileRow } from "@/lib/types";

const LONG_PRESS_MS = 500;
const SWIPE_PX = 80;

// One line on the list. Tap or swipe right to tick, swipe left to delete (with Undo),
// long-press or the ⋯ button to edit.
export function ItemRow({
  item,
  product,
  aisle,
  addedBy,
  highlight,
  large,
  shopping,
  duplicate,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  item: ListItemRow;
  product: ProductRow | undefined;
  aisle: AisleRow | undefined;
  addedBy: ProfileRow | undefined; // shown only for other people's items
  highlight?: boolean;
  large?: boolean;
  shopping?: boolean;
  duplicate?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}) {
  const [dx, setDx] = useState(0);
  // Set when a long press or swipe opened the editor, so the click that follows doesn't tick.
  const suppressClick = useRef(false);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; fired: boolean } | null>(
    null,
  );

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    suppressClick.current = false;
    const timer = setTimeout(() => {
      if (press.current) {
        press.current.fired = true;
        suppressClick.current = true;
        navigator.vibrate?.(15);
        onEdit();
      }
    }, LONG_PRESS_MS);
    press.current = { x: e.clientX, y: e.clientY, timer, fired: false };
  }

  function move(e: PointerEvent) {
    const p = press.current;
    if (!p) return;
    const mx = e.clientX - p.x;
    const my = e.clientY - p.y;
    if (Math.abs(mx) > 10 || Math.abs(my) > 10) {
      if (p.timer) clearTimeout(p.timer);
      p.timer = null;
      // A drag, however short, isn't a tap: don't let the click that follows tick the item.
      suppressClick.current = true;
    }
    // Only track clearly sideways drags, so scrolling the list still works.
    if (Math.abs(mx) > Math.abs(my) && Math.abs(mx) > 10) setDx(Math.max(-120, Math.min(120, mx)));
  }

  function up() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    setDx(0);
    if (Math.abs(dx) >= SWIPE_PX) {
      suppressClick.current = true;
      if (dx > 0) onToggle();
      else onDelete();
    }
  }

  function cancel() {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
    setDx(0);
  }

  function click() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onToggle();
  }

  const qty = formatQuantity(item.quantity, item.unit);
  const initial = addedBy?.display_name?.charAt(0).toUpperCase() ?? "?";

  return (
    <li
      className={`relative overflow-hidden rounded-2xl ${highlight ? "ring-2 ring-amber-400" : ""} ${
        duplicate ? "border-l-4 border-amber-400" : ""
      }`}
      data-testid="list-item"
      data-name={item.name}
      data-checked={item.checked}
    >
      <div
        aria-hidden
        className={`absolute inset-0 flex items-center px-5 font-semibold ${
          dx > 0 ? "justify-start bg-brand text-brand-contrast" : dx < 0 ? "justify-end bg-danger text-white" : ""
        }`}
      >
        {dx > 0 ? (item.checked ? "↩ Untick" : "✓ Tick") : dx < 0 ? "Delete" : null}
      </div>
      <div
        className="relative flex items-center gap-2 bg-surface"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 150ms" }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={item.checked}
          aria-label={`${item.name}${qty ? `, ${qty}` : ""}${item.checked ? ", in the trolley" : ""}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onPointerLeave={() => press.current && !press.current.fired && up()}
          onContextMenu={(e) => e.preventDefault()}
          onClick={click}
          className={`flex min-w-0 flex-1 touch-pan-y items-center gap-3 px-2 py-1.5 text-left select-none ${
            large ? "min-h-20" : "min-h-14"
          }`}
        >
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center rounded-full border-2 ${
              large ? "h-10 w-10 text-xl" : shopping ? "h-9 w-9 text-lg" : "h-7 w-7 text-sm"
            } ${item.checked ? "border-brand bg-brand text-brand-contrast" : "border-border"}`}
          >
            {item.checked ? "✓" : ""}
          </span>
          <ProductThumb product={product} aisle={aisle} size={large ? 64 : 40} />
          <span className="min-w-0 flex-1">
            <span
              className={`block line-clamp-2 break-words font-medium ${large ? "text-3xl" : "text-lg"} ${
                item.checked ? "text-muted line-through" : ""
              }`}
            >
              {item.name}
              {qty && <span className="ml-2 font-normal text-muted">{qty}</span>}
            </span>
            {item.note && (
              <span className={`block truncate text-muted ${large ? "text-lg" : "text-sm"}`}>{item.note}</span>
            )}
          </span>
          {addedBy && (
            <span
              className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${
                large ? "h-8 w-8 text-base" : "h-6 w-6 text-xs"
              }`}
              style={{ backgroundColor: addedBy.colour }}
              title={`Added by ${addedBy.display_name}`}
              aria-label={`Added by ${addedBy.display_name}`}
            >
              {initial}
            </span>
          )}
        </button>
        {duplicate && onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            aria-label={`${item.name} might be a duplicate. Review`}
            title="Possible duplicate"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-warn-bg text-lg font-bold text-warn-fg"
          >
            <span aria-hidden>⚠</span>
          </button>
        )}
        {item.link && /^https?:\/\//i.test(item.link) && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open link for ${item.name}`}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xl hover:bg-surface-2"
          >
            🔗
          </a>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${item.name}`}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-2xl text-muted hover:bg-surface-2"
        >
          ⋯
        </button>
      </div>
    </li>
  );
}
