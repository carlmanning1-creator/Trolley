"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { clearTicked, restoreItems, type Actor } from "@/lib/mutations";
import { notify } from "@/lib/notices";
import { enableNotifications, needsHomeScreenInstall } from "@/lib/push";
import { finishShopping, startShopping } from "@/lib/shopping";
import { STORE_NAMES } from "@/lib/storeOrder";
import type { ListItemRow, ListRow, ProfileRow, ShoppingSessionRow, Store } from "@/lib/types";

const LAST_STORE_KEY = "trolley-last-store";
const STORES: Store[] = ["coles", "woolworths", "aldi", "other"];

function readLastStore(): Store | null {
  try {
    const s = localStorage.getItem(LAST_STORE_KEY);
    return STORES.includes(s as Store) ? (s as Store) : null;
  } catch {
    return null;
  }
}

// "Start shopping" (after picking the store) / "Finish shopping", progress while shopping, and
// the banner everyone else sees while someone is at the shops.
export function ShoppingBar({
  actor,
  list,
  sessions,
  profiles,
  items,
  onScanReceipt,
  storeOrderLearned = false,
  large = false,
  controls = true,
}: {
  actor: Actor;
  list: ListRow;
  sessions: ShoppingSessionRow[]; // active sessions on this list
  profiles: Map<string, ProfileRow>;
  items: ListItemRow[];
  onScanReceipt?: () => void;
  storeOrderLearned?: boolean; // the list is in the order this store is usually walked
  large?: boolean;
  controls?: boolean; // false on the kitchen screen: banner only
}) {
  const [finishing, setFinishing] = useState<ShoppingSessionRow | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mine = sessions.find((s) => s.started_by === actor.userId);
  const others = sessions.filter((s) => s.started_by !== actor.userId);
  const ticked = items.filter((i) => i.checked).length;
  const left = items.length - ticked;
  const lastStore = readLastStore();

  async function start(store: Store) {
    setPicking(false);
    try {
      localStorage.setItem(LAST_STORE_KEY, store);
    } catch {
      // not remembered: fine
    }
    await startShopping(actor, list.id, store);
    // Asked right after the tap, as iPhones require. Declining is fine: shopping still works.
    try {
      const state = await enableNotifications(actor.householdId, actor.userId);
      if (state === "needs-install") setNote("To get notifications on iPhone, add Trolley to your Home Screen first.");
      else setNote(null);
    } catch (err) {
      setNote(err instanceof Error ? err.message : null);
    }
  }

  const text = large ? "text-xl" : "text-base";
  return (
    <>
      {others.map((s) => {
        const who = profiles.get(s.started_by ?? "")?.display_name ?? "Someone";
        return (
          <div
            key={s.id}
            role="status"
            className={`flex items-center gap-2 rounded-2xl bg-warn-bg px-4 py-3 font-medium text-warn-fg ${text}`}
          >
            <span aria-hidden>🛒</span>
            {who} is at the shops. Add anything you need now.
          </div>
        );
      })}
      {!controls ? null : mine ? (
        <div className={`flex flex-col gap-2 rounded-2xl bg-brand px-4 py-2 text-brand-contrast ${text}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-semibold" data-testid="trip-progress">
                {left === 0 ? "All done" : `${left} of ${items.length} left`}
              </span>
              <span className="block text-sm opacity-90">
                {mine.store ? STORE_NAMES[mine.store] : "Shopping"}
                {storeOrderLearned ? " · in the order you usually walk it" : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setFinishing(mine)}
              className="min-h-11 shrink-0 rounded-xl bg-brand-contrast/15 px-4 font-semibold"
            >
              Finish shopping
            </button>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-brand-contrast/25"
            role="progressbar"
            aria-label="Shopping progress"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={ticked}
          >
            <div
              className="h-full rounded-full bg-brand-contrast transition-[width]"
              style={{ width: `${items.length ? (ticked / items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`min-h-11 rounded-2xl border border-brand px-4 font-semibold text-brand-strong ${text}`}
        >
          🛒 Start shopping
        </button>
      )}
      {note && <p className="text-sm text-muted">{note}</p>}
      {needsHomeScreenInstall() && !note && mine && (
        <p className="text-sm text-muted">Tip: add Trolley to your Home Screen to get notifications on iPhone.</p>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Where are you shopping?">
        <div className="grid grid-cols-2 gap-2">
          {STORES.map((store) => (
            <button
              key={store}
              type="button"
              onClick={() => void start(store)}
              className={`min-h-16 rounded-xl px-3 text-lg font-semibold ${
                store === lastStore ? "bg-brand text-brand-contrast" : "border border-border"
              }`}
            >
              {STORE_NAMES[store]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          The list learns each store&apos;s aisle order from the order you tick things off there.
        </p>
      </Sheet>

      <Sheet open={Boolean(finishing)} onClose={() => setFinishing(null)} title="Finish shopping">
        <div className="flex flex-col gap-3">
          {ticked > 0 ? (
            <button
              type="button"
              onClick={async () => {
                const ids = await clearTicked(list.id);
                if (finishing) await finishShopping(finishing);
                setFinishing(null);
                if (ids.length) notify(`Cleared ${ids.length} item${ids.length === 1 ? "" : "s"}`, { label: "Undo", run: () => restoreItems(ids) });
              }}
              className="min-h-14 rounded-xl bg-brand px-4 text-lg font-semibold text-brand-contrast"
            >
              Clear {ticked} ticked item{ticked === 1 ? "" : "s"} and finish
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              if (finishing) await finishShopping(finishing);
              setFinishing(null);
            }}
            className="min-h-14 rounded-xl border border-border px-4 text-lg font-semibold"
          >
            {ticked > 0 ? "Finish, keep ticked items" : "Finish"}
          </button>
          {onScanReceipt && (
            <button
              type="button"
              onClick={async () => {
                if (finishing) await finishShopping(finishing);
                setFinishing(null);
                onScanReceipt();
              }}
              className="min-h-11 text-sm text-muted underline"
            >
              Finish and scan the receipt
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
