"use client";

import { callApi } from "@/lib/api";
import { db, setMeta } from "@/lib/db";
import { newId, nowIso, type Actor } from "@/lib/mutations";
import { patchLocal, saveLocal } from "@/lib/sync";
import { SESSION_MAX_MS } from "@/lib/trips";
import type { ShoppingSessionRow, Store } from "@/lib/types";

export async function startShopping(actor: Actor, listId: string, store: Store): Promise<ShoppingSessionRow> {
  const t = nowIso();
  const session: ShoppingSessionRow = {
    id: newId(),
    household_id: actor.householdId,
    list_id: listId,
    started_by: actor.userId,
    started_at: t,
    ended_at: null,
    store,
    created_at: t,
    updated_at: t,
  };
  await saveLocal("shopping_sessions", session);
  await setMeta(`notify-start:${session.id}`, `pending|${t}`);
  void sendPendingNotices();
  return session;
}

export async function finishShopping(session: ShoppingSessionRow): Promise<void> {
  const t = nowIso();
  await patchLocal<ShoppingSessionRow>("shopping_sessions", session.id, { ended_at: t, updated_at: t });
}

// Tells the shopper someone added something. Queued, so it still goes if you add it offline.
export async function noticeItemAdded(itemId: string): Promise<void> {
  await setMeta(`notify-item:${itemId}`, `pending|${nowIso()}`);
  void sendPendingNotices();
}

let sending = false;

// Sends queued notices once the row they refer to has reached the server.
export async function sendPendingNotices(): Promise<void> {
  if (sending || !navigator.onLine) return;
  sending = true;
  try {
    const pending = (await db().meta.toArray()).filter(
      (m) => m.value.startsWith("pending|") && (m.key.startsWith("notify-start:") || m.key.startsWith("notify-item:")),
    );
    for (const m of pending) {
      const [kind, id] = m.key.split(":");
      const table = kind === "notify-start" ? "shopping_sessions" : "list_items";
      const waiting = await db().outbox.where("[table+row_id]").equals([table, id]).count();
      if (waiting) continue; // not on the server yet; try again after the next sync
      try {
        await callApi("/api/push/notify", {
          method: "POST",
          json: kind === "notify-start" ? { event: "shopping-started", sessionId: id } : { event: "item-added", itemId: id },
        });
        await db().meta.delete(m.key);
      } catch {
        // Try again later, but don't nag about something from hours ago.
        const age = Date.now() - new Date(m.value.split("|")[1]).getTime();
        if (!(age < SESSION_MAX_MS)) await db().meta.delete(m.key);
      }
    }
  } finally {
    sending = false;
  }
}
