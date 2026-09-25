"use client";

import { useSyncExternalStore } from "react";

// The short message at the bottom of the screen ("Milk is already on the list"), optionally
// with one action such as Undo. Any part of the app can show one; the newest replaces the last.

export type Notice = { id: number; text: string; action?: { label: string; run: () => void | Promise<void> } };

let current: Notice | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Notice | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function notify(text: string, action?: Notice["action"]) {
  if (timer) clearTimeout(timer);
  const notice = { id: ++seq, text, action };
  set(notice);
  // Long enough to reach an Undo button, short enough not to get in the way.
  timer = setTimeout(() => current?.id === notice.id && set(null), action ? 6000 : 2500);
}

export function dismissNotice() {
  if (timer) clearTimeout(timer);
  set(null);
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
