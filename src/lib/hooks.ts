"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { getServerStatus, getStatus, subscribeStatus } from "@/lib/sync";
import { runningLow, type Suggestion } from "@/lib/runningLow";
import { isActive } from "@/lib/trips";
import type { AisleRow, ListItemRow, ListRow, ProductRow, ProfileRow, ShoppingSessionRow } from "@/lib/types";

export function useSyncStatus() {
  return useSyncExternalStore(subscribeStatus, getStatus, getServerStatus);
}

// Changes still waiting to reach the server, read live from the device's queue.
// Undefined until the queue has been read at least once.
export function usePendingCount(): number | undefined {
  return useLiveQuery(() => db().outbox.count(), []);
}

const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

export function useLists(): ListRow[] | undefined {
  return useLiveQuery(async () => (await db().lists.toArray()).filter((l) => !l.deleted_at).sort(bySort), []);
}

export function useAisles(): AisleRow[] | undefined {
  return useLiveQuery(async () => (await db().aisles.toArray()).filter((a) => !a.deleted_at).sort(bySort), []);
}

export function useItems(listId: string | null): ListItemRow[] | undefined {
  return useLiveQuery(
    async () =>
      listId
        ? (await db().list_items.where("list_id").equals(listId).toArray()).filter((i) => !i.deleted_at)
        : [],
    [listId],
  );
}

// Keyed by id. The map only changes when the rows do, so components can depend on it.
function useById<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  return useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
}

export function useProfiles(): Map<string, ProfileRow> {
  return useById(useLiveQuery(() => db().profiles.toArray(), []));
}

export function useProducts(): Map<string, ProductRow> {
  return useById(useLiveQuery(() => db().products.toArray(), []));
}

// Closes an overlay when the phone's back button is pressed, instead of leaving the app.
// Each open overlay owns one history entry. When one closes by a button and another opens in
// the same moment (Settings to Receipts), the new one takes over the entry rather than having
// the old one's "go back" land on it and close it straight away.
let pendingBack: ReturnType<typeof setTimeout> | null = null;

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const marker = Math.random();
    if (pendingBack) {
      clearTimeout(pendingBack);
      pendingBack = null;
      history.replaceState({ trolleyOverlay: marker }, "");
    } else {
      history.pushState({ trolleyOverlay: marker }, "");
    }
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed with a button rather than the back key: remove the entry, unless another
      // overlay claims it first.
      if (!poppedByBack && history.state?.trolleyOverlay === marker) {
        pendingBack = setTimeout(() => {
          pendingBack = null;
          history.back();
        }, 0);
      }
    };
  }, [open]);
}

// The current minute, updating once a minute, for things that change with time alone.
function useMinute(): number {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(t);
  }, []);
  return minute;
}

export function useActiveSessions(listId: string | null): ShoppingSessionRow[] {
  const minute = useMinute();
  const rows = useLiveQuery(
    async () => (listId ? await db().shopping_sessions.where("list_id").equals(listId).toArray() : []),
    [listId],
  );
  return (rows ?? []).filter((s) => isActive(s, minute * 60_000 + 59_999));
}

// What's probably due on this list, most overdue first (see runningLow). Rechecked each
// minute as well as whenever the data changes, since things become due with time alone.
export function useRunningLow(listId: string | null): Suggestion[] | undefined {
  const minute = useMinute();
  return useLiveQuery(async () => {
    if (!listId) return [];
    const [products, purchases, items] = await Promise.all([
      db().products.toArray(),
      db().purchases.toArray(),
      db().list_items.where("list_id").equals(listId).toArray(),
    ]);
    return runningLow({ products, purchases, items, listId });
  }, [listId, minute]);
}
