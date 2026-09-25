// Offline-first sync.
// The UI reads and writes only the local Dexie store. Every local change also goes into the
// outbox; this module pushes the outbox to Supabase in order whenever there is signal, and pulls
// other people's changes through Realtime plus a catch-up query after reconnecting.
// Conflicts are settled on the server by triggers (see the schema migration).

import type { RealtimeChannel } from "@supabase/supabase-js";
import { db, getMeta, setMeta, type OutboxEntry } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { SYNCED_TABLES, type AnyRow, type ProfileRow, type SyncedTable } from "@/lib/types";

// ---------------------------------------------------------------------------
// Status, readable from React with useSyncStatus()
// ---------------------------------------------------------------------------

export type SyncStatus = {
  online: boolean; // the device thinks it has a connection and the last request worked
  syncing: boolean;
  pending: number; // changes waiting in the outbox
  ready: boolean; // the first full download has finished at least once on this device
};

let status: SyncStatus = { online: true, syncing: false, pending: 0, ready: false };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch };
  if (
    next.online === status.online &&
    next.syncing === status.syncing &&
    next.pending === status.pending &&
    next.ready === status.ready
  ) {
    return;
  }
  status = next;
  listeners.forEach((l) => l());
}

export function subscribeStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStatus(): SyncStatus {
  return status;
}

const SERVER_STATUS: SyncStatus = { online: true, syncing: false, pending: 0, ready: false };
export function getServerStatus(): SyncStatus {
  return SERVER_STATUS;
}

// Several of these can run at once; only the newest count is allowed to land, so an older,
// slower read can never overwrite a newer one with a stale number.
let pendingReadSeq = 0;
async function refreshPending() {
  const seq = ++pendingReadSeq;
  const count = await db().outbox.count();
  if (seq === pendingReadSeq) setStatus({ pending: count });
}

// ---------------------------------------------------------------------------
// Writing: every local change goes through here
// ---------------------------------------------------------------------------

export async function saveLocal<T extends AnyRow>(table: SyncedTable, rows: T | T[]): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return;
  const d = db();
  const now = new Date().toISOString();
  await d.transaction("rw", d.table(table), d.outbox, async () => {
    await d.table(table).bulkPut(list);
    await d.outbox.bulkAdd(
      list.map((r) => ({ table, row_id: r.id, queued_at: now, attempts: 0 }) satisfies OutboxEntry),
    );
  });
  await refreshPending();
  scheduleFlush(0);
}

// Changes only the given fields, on the newest copy of the row, in one step. Two updates that
// land close together (say the aisle from auto-sort and a picture) can never undo each other.
export async function patchLocal<T extends AnyRow>(
  table: SyncedTable,
  id: string,
  patch: Partial<T> | ((current: T) => Partial<T> | null),
): Promise<T | undefined> {
  const d = db();
  const now = new Date().toISOString();
  const result = await d.transaction("rw", d.table(table), d.outbox, async () => {
    const current = (await d.table(table).get(id)) as T | undefined;
    if (!current) return undefined;
    const changes = typeof patch === "function" ? patch(current) : patch;
    if (!changes) return current;
    const next = { ...current, ...changes } as T;
    await d.table(table).put(next);
    await d.outbox.add({ table, row_id: id, queued_at: now, attempts: 0 });
    return next;
  });
  await refreshPending();
  scheduleFlush(0);
  return result;
}

// ---------------------------------------------------------------------------
// Applying rows that came from the server
// ---------------------------------------------------------------------------

type Stamped = AnyRow & { synced_at?: string };

// A row with a local change still waiting to go up is left alone: our version will reach the
// server, the server settles the conflict, and the settled row comes back through Realtime.
// A copy older than the one we hold (a late Realtime message overtaken by a catch-up read) is
// ignored too, judged by the server's own clock.
export async function applyRemote(table: SyncedTable, rows: AnyRow[]): Promise<void> {
  if (rows.length === 0) return;
  const d = db();
  await d.transaction("rw", d.table(table), d.outbox, async () => {
    const ids = rows.map((r) => r.id);
    const pending = new Set(
      (await d.outbox.where("[table+row_id]").anyOf(ids.map((id) => [table, id])).toArray()).map((e) => e.row_id),
    );
    const held = new Map(
      ((await d.table(table).bulkGet(ids)) as (Stamped | undefined)[])
        .filter((r): r is Stamped => Boolean(r))
        .map((r) => [r.id, r.synced_at]),
    );
    const incoming = (rows as Stamped[]).filter((r) => {
      if (pending.has(r.id)) return false;
      const mine = held.get(r.id);
      return !mine || !r.synced_at || new Date(r.synced_at).getTime() >= new Date(mine).getTime();
    });
    if (incoming.length) await d.table(table).bulkPut(incoming);
  });
}

// ---------------------------------------------------------------------------
// Pushing the outbox
// ---------------------------------------------------------------------------

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2_000;

// Tries again later, waiting twice as long each time (2 seconds up to 30).
function retryLater() {
  scheduleFlush(retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
}

export function scheduleFlush(delay = 0) {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, delay);
}

// Only a real answer from the server saying "no" counts as a rejection. Anything else (no signal,
// a request cut off mid-way, a timeout, a server hiccup, an expired sign-in) just waits and retries,
// however long that takes, so a change is never dropped because the signal was bad.
export function isRejection(error: { status?: number } | null): boolean {
  const status = error?.status ?? 0;
  return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

// Columns added after launch: rows saved on the device before then don't have them.
const COLUMN_DEFAULTS: Partial<Record<SyncedTable, Record<string, unknown>>> = {
  list_items: { link: null, distinct_from: [] },
  products: { image_source_url: null, rejected_sources: [], hide_running_low: false },
  shopping_sessions: { store: null },
};

// Columns only the server writes are left out.
function forServer(table: SyncedTable, row: AnyRow): Record<string, unknown> {
  const { synced_at: _synced, ...rest } = row as AnyRow & { synced_at?: string };
  void _synced;
  // Every row in a batch must have the same columns, so fill in the ones older rows lack.
  const r = rest as Record<string, unknown>;
  for (const [column, fallback] of Object.entries(COLUMN_DEFAULTS[table] ?? {})) {
    if (r[column] === undefined) r[column] = fallback;
  }
  return r;
}

const MAX_ATTEMPTS = 5;

export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus({ online: false });
    return;
  }
  flushing = true;
  setStatus({ syncing: true });
  const d = db();
  const sb = supabase();
  try {
    for (;;) {
      const all = await d.outbox.orderBy("seq").toArray();
      if (all.length === 0) break;

      // We always send a row as it is now, so one entry per row is enough: keep its latest and
      // clear the earlier ones with it. Parent tables go first (SYNCED_TABLES is in that order),
      // so an item never reaches the server before the list, aisle or product it points at,
      // even when that product was changed again after the item was added. Within a table,
      // queue order holds.
      const lastSeq = new Map<string, number>();
      for (const e of all) lastSeq.set(`${e.table}:${e.row_id}`, e.seq!);
      const rank = (t: SyncedTable) => SYNCED_TABLES.indexOf(t);
      const ordered = all
        .filter((e) => lastSeq.get(`${e.table}:${e.row_id}`) === e.seq)
        .sort((a, b) => rank(a.table) - rank(b.table) || a.seq! - b.seq!);

      // Take the leading run for one table (up to 100 rows), keeping queue order across tables.
      const table = ordered[0].table;
      const group: OutboxEntry[] = [];
      for (const e of ordered) {
        if (e.table !== table || group.length >= 100) break;
        group.push(e);
      }
      const superseded = (e: OutboxEntry) =>
        all.filter((x) => x.table === e.table && x.row_id === e.row_id && x.seq! <= e.seq!).map((x) => x.seq!);
      const ids = [...new Set(group.map((e) => e.row_id))];
      const rows = (await d.table(table).bulkGet(ids)).filter(Boolean) as AnyRow[];

      let error: { message?: string; code?: string; status?: number } | null = null;
      let returned: AnyRow[] = [];

      if (rows.length > 0) {
        if (table === "profiles") {
          // People can edit their own profile but never create one, so this is an update.
          for (const r of rows) {
            const p = r as ProfileRow;
            const res = await sb
              .from("profiles")
              .update({
                display_name: p.display_name,
                colour: p.colour,
                swipe_actions: p.swipe_actions ?? true,
                updated_at: p.updated_at,
              })
              .eq("id", p.id)
              .select();
            if (res.error) {
              error = { ...res.error, status: res.status };
              break;
            }
            returned.push(...((res.data ?? []) as AnyRow[]));
          }
        } else {
          const res = await sb.from(table).upsert(rows.map((r) => forServer(table, r)), { onConflict: "id" }).select();
          if (res.error) error = { ...res.error, status: res.status };
          else returned = (res.data ?? []) as AnyRow[];
        }
      }

      if (error) {
        if (!isRejection(error)) {
          setStatus({ online: false });
          retryLater();
          return;
        }
        // The server refused these rows. Retry a few times (a missing parent row may still be
        // on its way), then drop them so one bad change can't block everything behind it.
        console.warn("Sync refused a change", table, error);
        const tooMany = group.filter((e) => e.attempts + 1 >= MAX_ATTEMPTS).flatMap(superseded);
        const retry = group.filter((e) => e.attempts + 1 < MAX_ATTEMPTS);
        await d.outbox.bulkDelete(tooMany);
        await Promise.all(retry.map((e) => d.outbox.update(e.seq!, { attempts: e.attempts + 1 })));
        if (tooMany.length) {
          // Put the device back in step with the server for anything we gave up on.
          await refetch(table, group.filter((e) => tooMany.includes(e.seq!)).map((e) => e.row_id));
        }
        await refreshPending();
        if (retry.length) {
          retryLater();
          return;
        }
        continue;
      }

      // Success: clear what we sent, then store the row exactly as the server settled it.
      await d.outbox.bulkDelete(group.flatMap(superseded));
      const missing = ids.filter((id) => !returned.some((r) => r.id === id));
      await applyRemote(table, returned);
      // Rows the server kept its own newer copy of come back empty; fetch that copy.
      if (missing.length) await refetch(table, missing);
      retryDelay = 2_000;
      setStatus({ online: true });
      await refreshPending();
    }
  } catch (err) {
    console.warn("Sync push failed", err);
    setStatus({ online: false });
    retryLater();
  } finally {
    flushing = false;
    setStatus({ syncing: false });
    await refreshPending();
  }
}

async function refetch(table: SyncedTable, ids: string[]) {
  if (ids.length === 0) return;
  const { data } = await supabase().from(table).select("*").in("id", ids);
  if (data) await applyRemote(table, data as AnyRow[]);
}

// ---------------------------------------------------------------------------
// Pulling: catch-up query by server time
// ---------------------------------------------------------------------------

// Re-read a little before the last row seen, because rows commit slightly out of order.
const OVERLAP_MS = 60_000;
const PAGE = 1000;
let pulling: Promise<void> | null = null;
let pullAgain = false;

// One catch-up at a time. A request that arrives mid-way gets its own run straight after,
// since the one in progress may have read the server before the change it's looking for.
export function pull(): Promise<void> {
  if (pulling) {
    pullAgain = true;
    return pulling;
  }
  pulling = doPull().finally(() => {
    pulling = null;
    if (pullAgain) {
      pullAgain = false;
      void pull();
    }
  });
  return pulling;
}

async function doPull(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus({ online: false });
    return;
  }
  const sb = supabase();
  try {
    for (const table of SYNCED_TABLES) {
      const cursor = await getMeta(`cursor:${table}`);
      const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null;
      let newest = cursor ?? null;
      for (let page = 0; ; page++) {
        let q = sb.from(table).select("*").order("synced_at").range(page * PAGE, page * PAGE + PAGE - 1);
        if (since) q = q.gt("synced_at", since);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as (AnyRow & { synced_at: string })[];
        await applyRemote(table, rows);
        if (rows.length) newest = rows[rows.length - 1].synced_at;
        if (rows.length < PAGE) break;
      }
      if (newest) await setMeta(`cursor:${table}`, newest);
    }
    await setMeta("ready", "1");
    setStatus({ online: true, ready: true });
  } catch (err) {
    console.warn("Sync pull failed", err);
    setStatus({ online: false });
  }
}

// ---------------------------------------------------------------------------
// Starting and stopping
// ---------------------------------------------------------------------------

let channel: RealtimeChannel | null = null;
let stopFns: (() => void)[] = [];

export async function startSync(householdId: string): Promise<void> {
  stopSync();
  setStatus({
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    ready: (await getMeta("ready")) === "1",
  });
  await refreshPending();

  const sb = supabase();
  let ch = sb.channel(`household:${householdId}`);
  for (const table of SYNCED_TABLES) {
    ch = ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) void db().table(table).delete(id);
          return;
        }
        void applyRemote(table, [payload.new as AnyRow]);
      },
    );
  }
  channel = ch.subscribe((state) => {
    if (state === "SUBSCRIBED") {
      // Connected (or reconnected): fill any gap, then push anything waiting.
      void pull().then(() => scheduleFlush(0));
    }
  });

  const onOnline = () => {
    setStatus({ online: true });
    retryDelay = 2_000;
    scheduleFlush(0);
    void pull();
  };
  const onOffline = () => setStatus({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      scheduleFlush(0);
      void pull();
    }
  };
  const onFocus = () => {
    scheduleFlush(0);
    void pull();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  // Safety net in case a Realtime message is missed.
  const timer = setInterval(() => {
    scheduleFlush(0);
    void pull();
  }, 60_000);

  stopFns = [
    () => window.removeEventListener("online", onOnline),
    () => window.removeEventListener("offline", onOffline),
    () => window.removeEventListener("focus", onFocus),
    () => document.removeEventListener("visibilitychange", onVisible),
    () => clearInterval(timer),
  ];

  void pull().then(() => scheduleFlush(0));
}

export function stopSync() {
  stopFns.forEach((f) => f());
  stopFns = [];
  if (channel) {
    void supabase().removeChannel(channel);
    channel = null;
  }
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
