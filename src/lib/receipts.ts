"use client";

import { callApi } from "@/lib/api";
import { db } from "@/lib/db";
import { resizeImage } from "@/lib/imageResize";
import { newId, nowIso, type Actor } from "@/lib/mutations";
import { supabase } from "@/lib/supabase";
import { pull } from "@/lib/sync";

export type ProposalLine = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  list_item_id: string | null;
  product_id: string | null;
};
export type Proposal = {
  store_name: string | null;
  purchased_at: string | null;
  total: number | null;
  list_id: string;
  lines: ProposalLine[];
};
export type ReceiptRow = {
  id: string;
  store_name: string | null;
  purchased_at: string | null;
  total: number | null;
  status: "processing" | "review" | "confirmed" | "failed";
  error_message: string | null;
  created_at: string;
  list_id: string | null;
  raw_ai_json: { proposal?: Proposal } | null;
};

// Saves the photo on the device first, so it survives no signal, then processes it.
export async function addReceiptPhoto(actor: Actor, listId: string, file: Blob): Promise<string> {
  // Big enough to read small print, small enough to upload on weak signal.
  const blob = await resizeImage(file, 2000, 0.85);
  const id = newId();
  await db().pending_receipts.put({ id, list_id: listId, blob, queued_at: nowIso() });
  void processPendingReceipts(actor);
  return id;
}

let processing = false;
const listeners = new Set<(id: string, proposal: Proposal | null, error?: string) => void>();
export function onReceiptProcessed(fn: (id: string, proposal: Proposal | null, error?: string) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Uploads and reads every waiting receipt. Called on start, when signal returns, and after a photo.
export async function processPendingReceipts(actor: Actor): Promise<void> {
  if (processing || !navigator.onLine) return;
  processing = true;
  try {
    for (const r of await db().pending_receipts.toArray()) {
      const ext = r.blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${actor.householdId}/${r.id}.${ext}`;
      const sb = supabase();
      const up = await sb.storage.from("receipts").upload(path, r.blob, { contentType: r.blob.type, upsert: true });
      if (up.error) break; // try again later
      const ins = await sb.from("receipts").upsert(
        {
          id: r.id,
          household_id: actor.householdId,
          uploaded_by: actor.userId,
          image_path: path,
          list_id: r.list_id,
          status: "processing",
        },
        { onConflict: "id" },
      );
      if (ins.error) break;
      // From here the receipt lives on the server; the photo can leave the device queue.
      await db().pending_receipts.delete(r.id);
      try {
        const { proposal } = await callApi<{ proposal: Proposal }>("/api/receipts/process", {
          method: "POST",
          json: { receiptId: r.id, listId: r.list_id },
        });
        listeners.forEach((l) => l(r.id, proposal));
      } catch (err) {
        listeners.forEach((l) => l(r.id, null, err instanceof Error ? err.message : "Couldn't read the receipt."));
      }
    }
  } finally {
    processing = false;
  }
}

export async function retryReceipt(id: string, listId: string): Promise<Proposal> {
  const { proposal } = await callApi<{ proposal: Proposal }>("/api/receipts/process", {
    method: "POST",
    json: { receiptId: id, listId },
  });
  return proposal;
}

export async function loadReceipts(): Promise<ReceiptRow[]> {
  const { data, error } = await supabase()
    .from("receipts")
    .select("id, store_name, purchased_at, total, status, error_message, created_at, list_id, raw_ai_json")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []) as ReceiptRow[];
}

export async function confirmReceipt(id: string, lines: ProposalLine[]): Promise<void> {
  await callApi("/api/receipts/confirm", { method: "POST", json: { receiptId: id, lines } });
  // Bring the newly ticked items onto this device straight away.
  await pull();
}

export async function discardReceipt(id: string): Promise<void> {
  await supabase().from("receipts").update({ deleted_at: nowIso(), updated_at: nowIso() }).eq("id", id);
}
