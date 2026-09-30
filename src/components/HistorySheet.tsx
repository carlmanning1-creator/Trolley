"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { db } from "@/lib/db";
import { groupByDay, HISTORY_DAYS, timeLabel, verb } from "@/lib/history";
import type { ListRow, ProfileRow } from "@/lib/types";

const select = "min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-2 text-base";

// History: who added, ticked, unticked, deleted or cleared what, and when, for the last month.
export function HistorySheet({
  open,
  onClose,
  lists,
  profiles,
  activeListId,
}: {
  open: boolean;
  onClose: () => void;
  lists: ListRow[];
  profiles: Map<string, ProfileRow>;
  activeListId: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="History" wide>
      {open && <HistoryFeed lists={lists} profiles={profiles} activeListId={activeListId} />}
    </Sheet>
  );
}

function HistoryFeed({
  lists,
  profiles,
  activeListId,
}: {
  lists: ListRow[];
  profiles: Map<string, ProfileRow>;
  activeListId: string;
}) {
  const [listId, setListId] = useState(activeListId);
  const [person, setPerson] = useState("");
  const events = useLiveQuery(() => {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    return db().item_events.where("at").aboveOrEqual(since).toArray();
  }, []);
  const listNames = useMemo(() => new Map(lists.map((l) => [l.id, `${l.icon} ${l.name}`])), [lists]);
  const groups = useMemo(
    () =>
      groupByDay(
        (events ?? []).filter((e) => (!listId || e.list_id === listId) && (!person || e.actor === person)),
      ),
    [events, listId, person],
  );
  const people = [...profiles.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <label htmlFor="history-list" className="sr-only">
          Which list
        </label>
        <select id="history-list" value={listId} onChange={(e) => setListId(e.target.value)} className={select}>
          <option value="">All lists</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.icon} {l.name}
            </option>
          ))}
        </select>
        <label htmlFor="history-person" className="sr-only">
          Who
        </label>
        <select id="history-person" value={person} onChange={(e) => setPerson(e.target.value)} className={select}>
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </div>

      {events && groups.length === 0 && (
        <p className="py-6 text-center text-muted">Nothing in the last {HISTORY_DAYS} days.</p>
      )}
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{g.label}</h3>
          <ul className="flex flex-col gap-1">
            {g.events.map((e) => {
              const who = e.actor ? profiles.get(e.actor) : undefined;
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2" data-testid="history-row">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: who?.colour ?? "#6b7280" }}
                  >
                    {who?.display_name.charAt(0).toUpperCase() ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <span className="font-semibold">{who?.display_name ?? "Someone"}</span> {verb(e.kind)}{" "}
                      <span className="font-semibold">{e.name}</span>
                    </span>
                    {!listId && e.list_id && listNames.get(e.list_id) && (
                      <span className="block text-sm text-muted">{listNames.get(e.list_id)}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-muted">{timeLabel(Date.parse(e.at))}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
