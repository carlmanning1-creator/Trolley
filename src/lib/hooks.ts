"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { getServerStatus, getStatus, subscribeStatus } from "@/lib/sync";
import { isActive } from "@/lib/shopping";
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
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const marker = Math.random();
    history.pushState({ trolleyOverlay: marker }, "");
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed with a button rather than the back key: remove the history entry we added.
      if (!poppedByBack && history.state?.trolleyOverlay === marker) history.back();
    };
  }, [open]);
}

// Shopping trips in progress on a list (re-checked each minute so forgotten trips expire).
export function useActiveSessions(listId: string | null): ShoppingSessionRow[] {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(t);
  }, []);
  const rows = useLiveQuery(
    async () => (listId ? await db().shopping_sessions.where("list_id").equals(listId).toArray() : []),
    [listId],
  );
  return (rows ?? []).filter((s) => isActive(s, minute * 60_000 + 59_999));
}
