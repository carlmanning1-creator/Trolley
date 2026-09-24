"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/mutations";
import {
  addReceiptPhoto,
  confirmReceipt,
  discardReceipt,
  loadReceipts,
  onReceiptProcessed,
  retryReceipt,
  type Proposal,
  type ProposalLine,
  type ReceiptRow,
} from "@/lib/receipts";
import type { ListItemRow } from "@/lib/types";

const money = (n: number | null) => (n === null ? "" : `$${n.toFixed(2)}`);

export function ReceiptsSheet({
  open,
  onClose,
  actor,
  listId,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  listId: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; proposal: Proposal } | null>(null);
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const pending = useLiveQuery(() => db().pending_receipts.toArray(), []) ?? [];

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      setLoadError("Past receipts show when there's signal.");
      return;
    }
    try {
      setReceipts(await loadReceipts());
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load receipts right now.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadReceipts()
      .then((r) => {
        if (alive) {
          setReceipts(r);
          setLoadError(null);
        }
      })
      .catch(() => alive && setLoadError(navigator.onLine ? "Couldn't load receipts right now." : "Past receipts show when there's signal."));
    return () => {
      alive = false;
    };
  }, [open]);

  // When a receipt finishes reading, go straight to its review.
  useEffect(
    () =>
      onReceiptProcessed((id, proposal, error) => {
        setReading((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        if (proposal) setReviewing({ id, proposal });
        else if (error) setMessage(error);
        void refresh();
      }),
    [refresh],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      const id = await addReceiptPhoto(actor, listId, file);
      setReading((s) => new Set(s).add(id));
      if (!navigator.onLine) setMessage("Saved. It will be read when there's signal.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't use that photo.");
    } finally {
      if (camera.current) camera.current.value = "";
      if (upload.current) upload.current.value = "";
    }
  }

  const close = useCallback(() => {
    setReviewing(null);
    onClose();
  }, [onClose]);

  if (reviewing) {
    return (
      <Sheet open={open} onClose={close} title="Check the receipt" wide>
        <Review
          id={reviewing.id}
          proposal={reviewing.proposal}
          onDone={(msg) => {
            setReviewing(null);
            setMessage(msg);
            void refresh();
          }}
          onBack={() => setReviewing(null)}
        />
      </Sheet>
    );
  }

  const btn = "min-h-14 flex-1 rounded-xl px-4 text-lg font-semibold";
  return (
    <Sheet open={open} onClose={close} title="Receipts" wide>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button type="button" className={`${btn} bg-brand text-brand-contrast`} onClick={() => camera.current?.click()}>
            📷 Scan a receipt
          </button>
          <button type="button" className={`${btn} border border-border`} onClick={() => upload.current?.click()}>
            Upload photo
          </button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Photograph a receipt"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <input
          ref={upload}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Upload a receipt photo"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {message && (
          <p role="status" className="rounded-xl bg-surface-2 p-3">
            {message}
          </p>
        )}

        <ul className="flex flex-col gap-2" aria-label="Receipts">
          {pending.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-2xl bg-surface-2 p-3">
              <span>Receipt photo from {new Date(p.queued_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="rounded-full bg-warn-bg px-3 py-1 text-sm font-semibold text-warn-fg">
                {navigator.onLine ? "Uploading…" : "Waiting for signal"}
              </span>
            </li>
          ))}
          {(receipts ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3" data-testid="receipt-row" data-status={r.status}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.store_name ?? "Receipt"}</span>
                <span className="block text-sm text-muted">
                  {new Date(r.purchased_at ?? r.created_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}
                  {r.total !== null ? ` · ${money(r.total)}` : ""}
                </span>
                {r.status === "failed" && r.error_message && <span className="block text-sm text-danger">{r.error_message}</span>}
              </span>
              {r.status === "review" && r.raw_ai_json?.proposal ? (
                <button
                  type="button"
                  onClick={() => setReviewing({ id: r.id, proposal: r.raw_ai_json!.proposal! })}
                  className="min-h-11 shrink-0 rounded-xl bg-brand px-3 font-semibold text-brand-contrast"
                >
                  Review
                </button>
              ) : r.status === "processing" || reading.has(r.id) ? (
                <span className="shrink-0 text-sm text-muted">Reading…</span>
              ) : r.status === "failed" ? (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setReading((s) => new Set(s).add(r.id));
                      try {
                        setReviewing({ id: r.id, proposal: await retryReceipt(r.id, r.list_id ?? listId) });
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Still couldn't read it.");
                      } finally {
                        setReading((s) => {
                          const n = new Set(s);
                          n.delete(r.id);
                          return n;
                        });
                        void refresh();
                      }
                    }}
                    className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await discardReceipt(r.id);
                      void refresh();
                    }}
                    className="min-h-11 rounded-xl px-3 text-sm text-danger"
                  >
                    Remove
                  </button>
                </span>
              ) : (
                <span className="shrink-0 text-sm text-muted">✓ Done</span>
              )}
            </li>
          ))}
        </ul>
        {loadError && <p className="text-sm text-muted">{loadError}</p>}
        {receipts?.length === 0 && pending.length === 0 && (
          <p className="text-center text-muted">No receipts yet. After a shop, scan the receipt to tick things off.</p>
        )}
      </div>
    </Sheet>
  );
}

function Review({
  id,
  proposal,
  onDone,
  onBack,
}: {
  id: string;
  proposal: Proposal;
  onDone: (message: string) => void;
  onBack: () => void;
}) {
  const [lines, setLines] = useState<ProposalLine[]>(proposal.lines);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useLiveQuery(
    async () =>
      (await db().list_items.where("list_id").equals(proposal.list_id).toArray()).filter((i) => !i.deleted_at),
    [proposal.list_id],
  );
  const items = useMemo(() => loaded ?? [], [loaded]);
  const open = useMemo(() => items.filter((i) => !i.checked), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const matchedIds = new Set(lines.map((l) => l.list_item_id).filter(Boolean));
  const matched = lines.map((l, i) => ({ l, i })).filter((x) => x.l.list_item_id);
  const unmatched = lines.map((l, i) => ({ l, i })).filter((x) => !x.l.list_item_id);
  const notBought = open.filter((i) => !matchedIds.has(i.id));

  function setMatch(index: number, itemId: string) {
    setLines((ls) =>
      ls.map((l, i) => {
        if (i === index) return { ...l, list_item_id: itemId || null, product_id: itemId ? (byId.get(itemId)?.product_id ?? l.product_id) : l.product_id };
        // An item can only be ticked off by one line.
        if (itemId && l.list_item_id === itemId) return { ...l, list_item_id: null };
        return l;
      }),
    );
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await confirmReceipt(id, lines);
      const n = lines.filter((l) => l.list_item_id).length;
      onDone(`Done. ${n} item${n === 1 ? "" : "s"} ticked off.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const lineRow = ({ l, i }: { l: ProposalLine; i: number }) => (
    <li key={i} className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-3" data-testid="receipt-line" data-matched={Boolean(l.list_item_id)}>
      <div className="flex justify-between gap-3">
        <span className="font-mono text-sm">{l.description}</span>
        <span className="shrink-0 font-medium">{money(l.line_total)}</span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted">Ticks off</span>
        <select
          value={l.list_item_id ?? ""}
          onChange={(e) => setMatch(i, e.target.value)}
          aria-label={`List item for ${l.description}`}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-2"
        >
          <option value="">Nothing on the list</option>
          {l.list_item_id && byId.get(l.list_item_id) && !open.some((o) => o.id === l.list_item_id) && (
            <option value={l.list_item_id}>{byId.get(l.list_item_id)!.name}</option>
          )}
          {open.map((o: ListItemRow) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted">
        {proposal.store_name ?? "Receipt"}
        {proposal.purchased_at ? ` · ${new Date(proposal.purchased_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}` : ""}
        {proposal.total !== null ? ` · ${money(proposal.total)}` : ""}
      </p>

      <section aria-label="Matched">
        <h3 className="mb-2 font-bold">Ticks these off ({matched.length})</h3>
        {matched.length ? <ul className="flex flex-col gap-2">{matched.map(lineRow)}</ul> : <p className="text-sm text-muted">No matches yet. Pick them below.</p>}
      </section>

      {unmatched.length > 0 && (
        <section aria-label="Not matched">
          <h3 className="mb-2 font-bold">Other things on the receipt ({unmatched.length})</h3>
          <ul className="flex flex-col gap-2">{unmatched.map(lineRow)}</ul>
        </section>
      )}

      {notBought.length > 0 && (
        <section aria-label="Still to buy">
          <h3 className="mb-2 font-bold">Still on the list ({notBought.length})</h3>
          <p className="text-muted">{notBought.map((i) => i.name).join(", ")}</p>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-warn-bg p-3 text-warn-fg">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="min-h-14 flex-1 rounded-xl border border-border font-semibold">
          Later
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="min-h-14 flex-[2] rounded-xl bg-brand text-lg font-semibold text-brand-contrast disabled:opacity-60"
        >
          {busy ? "Saving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
