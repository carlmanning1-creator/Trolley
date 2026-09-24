"use client";

import { usePendingCount, useSyncStatus } from "@/lib/hooks";

export function StatusPill() {
  const { online, syncing } = useSyncStatus();
  const counted = usePendingCount();
  // Never claim "Synced" before the queue has been checked.
  const unknown = counted === undefined;
  const pending = counted ?? 0;

  let text: string;
  let tone: string;
  if (!online) {
    text = pending
      ? `Offline, ${pending} change${pending === 1 ? "" : "s"} waiting`
      : "Offline";
    tone = "bg-warn-bg text-warn-fg";
  } else if (syncing || pending || unknown) {
    text = "Syncing";
    tone = "bg-surface-2 text-muted";
  } else {
    text = "Synced";
    tone = "bg-surface-2 text-muted";
  }

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="sync-status"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${tone}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${!online ? "bg-warn-fg" : syncing || pending || unknown ? "animate-pulse bg-muted" : "bg-brand"}`}
      />
      {text}
    </span>
  );
}
