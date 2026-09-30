import type { ItemEventKind, ItemEventRow } from "@/lib/types";

// Words for History ("Bec ticked off Milk") and grouping by day, in the phone's own time.

export const HISTORY_DAYS = 30;

const VERBS: Record<ItemEventKind, string> = {
  added: "added",
  readded: "put back on the list",
  ticked: "ticked off",
  unticked: "unticked",
  deleted: "deleted",
  cleared: "cleared",
  restored: "brought back",
  merged: "merged away",
  flagged: "flagged as needed soon:",
  unflagged: "took the needed soon flag off",
};

export function verb(kind: ItemEventKind): string {
  return VERBS[kind];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
}

// Newest first, in days.
export function groupByDay(events: ItemEventRow[], now = Date.now()): { label: string; events: ItemEventRow[] }[] {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const groups: { label: string; events: ItemEventRow[] }[] = [];
  for (const e of sorted) {
    const label = dayLabel(Date.parse(e.at), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.events.push(e);
    else groups.push({ label, events: [e] });
  }
  return groups;
}
