"use client";

import type { IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Sheet } from "@/components/Sheet";
import { autoSortProduct } from "@/lib/autosort";
import { db } from "@/lib/db";
import { findPicture, offLookupBarcode, type OffProduct } from "@/lib/images";
import { aisleForName } from "@/lib/keywords";
import { addItem, aisleIdByName, createProduct, updateProduct, type Actor, type AddResult } from "@/lib/mutations";
import type { AisleRow, ProductRow } from "@/lib/types";

type Found =
  | { kind: "catalogue"; barcode: string; product: ProductRow }
  | { kind: "off"; barcode: string; off: OffProduct }
  | { kind: "unknown"; barcode: string; reason: "not-found" | "offline" };

// Rear camera with a viewfinder. A read is looked up in the catalogue, then Open Food Facts,
// and added with one confirm tap. Unknown barcodes open a short form so the next scan is instant.
export function ScanSheet({
  open,
  onClose,
  actor,
  listId,
  aisles,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  listId: string;
  aisles: AisleRow[];
  onAdded: (r: AddResult) => void;
}) {
  const [found, setFound] = useState<Found | null>(null);
  const [scanKey, setScanKey] = useState(0);

  function reset() {
    setFound(null);
    setScanKey((k) => k + 1);
  }

  function close() {
    setFound(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title="Scan a barcode">
      {open && !found && <Scanner key={scanKey} onRead={(code) => void resolve(code).then(setFound)} />}
      {found && (
        <Result
          found={found}
          actor={actor}
          listId={listId}
          aisles={aisles}
          onDone={(r) => {
            onAdded(r);
            close();
          }}
          onScanAgain={reset}
        />
      )}
    </Sheet>
  );
}

async function resolve(barcode: string): Promise<Found> {
  const local = await db()
    .products.where("barcode")
    .equals(barcode)
    .filter((p) => !p.deleted_at)
    .first();
  if (local) return { kind: "catalogue", barcode, product: local };
  if (!navigator.onLine) return { kind: "unknown", barcode, reason: "offline" };
  try {
    const off = await offLookupBarcode(barcode);
    if (off) return { kind: "off", barcode, off };
  } catch {
    return { kind: "unknown", barcode, reason: "offline" };
  }
  return { kind: "unknown", barcode, reason: "not-found" };
}

function Scanner({ onRead }: { onRead: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const done = useRef(false);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  });

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        if (cancelled || !video.current) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          video.current,
          (result) => {
            if (result && !done.current) {
              done.current = true;
              navigator.vibrate?.(40);
              controls?.stop();
              onReadRef.current(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera for this app in your phone's settings, or type the number below."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera found. Type the barcode number below instead."
              : "Couldn't start the camera. Type the barcode number below instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.replace(/\D/g, "");
    if (code.length >= 6 && !done.current) {
      done.current = true;
      onRead(code);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!error && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video
            ref={video}
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
            autoPlay
            aria-label="Camera viewfinder"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/3 w-4/5 rounded-xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="rounded-xl bg-warn-bg p-3 text-warn-fg">
          {error}
        </p>
      ) : (
        <p className="text-center text-muted">Line the barcode up inside the box.</p>
      )}
      <form onSubmit={submitManual} className="flex gap-2">
        <label htmlFor="manual-barcode" className="sr-only">
          Barcode number
        </label>
        <input
          id="manual-barcode"
          inputMode="numeric"
          placeholder="Or type the barcode number"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-lg"
        />
        <button type="submit" className="min-h-12 rounded-xl border border-border px-4 font-medium">
          Look up
        </button>
      </form>
    </div>
  );
}

function Result({
  found,
  actor,
  listId,
  aisles,
  onDone,
  onScanAgain,
}: {
  found: Found;
  actor: Actor;
  listId: string;
  aisles: AisleRow[];
  onDone: (r: AddResult) => void;
  onScanAgain: () => void;
}) {
  const [name, setName] = useState(found.kind === "off" ? found.off.name : "");
  const [busy, setBusy] = useState(false);

  async function confirm(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      let product: ProductRow;
      if (found.kind === "catalogue") {
        product = found.product;
      } else if (found.kind === "off") {
        // Step 3 of aisle auto-sort: OFF's categories, then the keyword map.
        const aisleName = found.off.aisle ?? aisleForName(name);
        product =
          (await db().products.where("barcode").equals(found.barcode).filter((p) => !p.deleted_at).first()) ??
          (await createProduct(actor, {
            name: name.trim() || found.off.name,
            barcode: found.barcode,
            off_code: found.off.code,
            aisle_id: await aisleIdByName(aisleName),
          }));
        // Same picture path as everything else (barcode first, with retries and fallbacks).
        void findPicture(product);
      } else {
        const clean = name.trim();
        if (!clean) {
          setBusy(false);
          return;
        }
        // Reuse a product with this name if we have one, and teach it the barcode.
        const byName = await db()
          .products.filter((p) => !p.deleted_at && p.name.toLowerCase() === clean.toLowerCase())
          .first();
        product = byName
          ? await updateProduct(byName, { barcode: found.barcode })
          : await createProduct(actor, { name: clean.charAt(0).toUpperCase() + clean.slice(1), barcode: found.barcode });
        if (!product.aisle_id) void autoSortProduct(product);
      }
      const result = await addItem(actor, listId, { product });
      if (result) onDone(result);
    } finally {
      setBusy(false);
    }
  }

  const aisleFor = (p: ProductRow) => aisles.find((a) => a.id === p.aisle_id);
  const primary = "min-h-14 w-full rounded-xl bg-brand px-4 text-lg font-semibold text-brand-contrast disabled:opacity-60";

  if (found.kind === "unknown") {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-3">
        <p>
          {found.reason === "offline"
            ? "No signal to look this barcode up. Name it and we'll remember it."
            : "We don't know this barcode yet. Name it once and the next scan is instant."}
        </p>
        <p className="text-sm text-muted">Barcode {found.barcode}</p>
        <label htmlFor="scan-name" className="font-medium">
          What is it?
        </label>
        <input
          id="scan-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Vegemite 380g"
          className="min-h-12 rounded-xl border border-border bg-background px-3 text-lg"
        />
        <button type="submit" disabled={busy || !name.trim()} className={primary}>
          Add to list
        </button>
        <button type="button" onClick={onScanAgain} className="min-h-11 font-medium text-brand-strong">
          Scan something else
        </button>
      </form>
    );
  }

  const product = found.kind === "catalogue" ? found.product : undefined;
  return (
    <form onSubmit={confirm} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {product ? (
          <ProductThumb product={product} aisle={aisleFor(product)} size={88} />
        ) : found.kind === "off" && found.off.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={found.off.imageUrl} alt="" width={88} height={88} className="h-22 w-22 rounded-xl bg-white object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          {found.kind === "off" ? (
            <>
              <label htmlFor="scan-name" className="text-sm text-muted">
                Name
              </label>
              <input
                id="scan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-lg"
              />
              {(found.off.brand || found.off.quantity) && (
                <p className="mt-1 text-sm text-muted">{[found.off.brand, found.off.quantity].filter(Boolean).join(" · ")}</p>
              )}
            </>
          ) : (
            <p className="text-xl font-semibold">{product!.name}</p>
          )}
          <p className="text-sm text-muted">Barcode {found.barcode}</p>
        </div>
      </div>
      <button type="submit" disabled={busy} className={primary}>
        Add to list
      </button>
      <button type="button" onClick={onScanAgain} className="min-h-11 font-medium text-brand-strong">
        Scan something else
      </button>
    </form>
  );
}
