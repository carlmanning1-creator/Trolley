"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { clearTicked, type Actor } from "@/lib/mutations";
import { enableNotifications, needsHomeScreenInstall } from "@/lib/push";
import { finishShopping, startShopping } from "@/lib/shopping";
import type { ListItemRow, ListRow, ProfileRow, ShoppingSessionRow } from "@/lib/types";

// "Start shopping" / "Finish shopping", and the banner everyone sees while someone is at the shops.
export function ShoppingBar({
  actor,
  list,
  sessions,
  profiles,
  items,
  onScanReceipt,
  large = false,
  controls = true,
}: {
  actor: Actor;
  list: ListRow;
  sessions: ShoppingSessionRow[]; // active sessions on this list
  profiles: Map<string, ProfileRow>;
  items: ListItemRow[];
  onScanReceipt?: () => void;
  large?: boolean;
  controls?: boolean; // false on the kitchen screen: banner only
}) {
  const [finishing, setFinishing] = useState<ShoppingSessionRow | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const mine = sessions.find((s) => s.started_by === actor.userId);
  const others = sessions.filter((s) => s.started_by !== actor.userId);
  const ticked = items.filter((i) => i.checked).length;

  async function start() {
    await startShopping(actor, list.id);
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
        <div className={`flex items-center justify-between gap-3 rounded-2xl bg-brand px-4 py-2 text-brand-contrast ${text}`}>
          <span className="font-semibold">You&apos;re shopping</span>
          <button
            type="button"
            onClick={() => setFinishing(mine)}
            className="min-h-11 rounded-xl bg-brand-contrast/15 px-4 font-semibold"
          >
            Finish shopping
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          className={`min-h-11 rounded-2xl border border-brand px-4 font-semibold text-brand-strong ${text}`}
        >
          🛒 Start shopping
        </button>
      )}
      {note && <p className="text-sm text-muted">{note}</p>}
      {needsHomeScreenInstall() && !note && mine && (
        <p className="text-sm text-muted">Tip: add Trolley to your Home Screen to get notifications on iPhone.</p>
      )}

      <Sheet open={Boolean(finishing)} onClose={() => setFinishing(null)} title="Finish shopping">
        <div className="flex flex-col gap-3">
          {ticked > 0 ? (
            <button
              type="button"
              onClick={async () => {
                await clearTicked(list.id);
                if (finishing) await finishShopping(finishing);
                setFinishing(null);
                onScanReceipt?.();
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
              onScanReceipt?.();
            }}
            className="min-h-14 rounded-xl border border-border px-4 text-lg font-semibold"
          >
            {ticked > 0 ? "Finish, keep ticked items" : "Finish"}
          </button>
          <p className="text-center text-sm text-muted">
            {onScanReceipt ? "Next you can scan the receipt." : ""}
          </p>
        </div>
      </Sheet>
    </>
  );
}
