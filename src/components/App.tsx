"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddBar } from "@/components/AddBar";
import { useAuth } from "@/components/AuthProvider";
import { DuplicateSheet } from "@/components/DuplicateSheet";
import { ItemSheet } from "@/components/ItemSheet";
import { ListView } from "@/components/ListView";
import { ListsSheet } from "@/components/ListsSheet";
import { Settings } from "@/components/Settings";
import { NotificationSettings } from "@/components/NotificationSettings";
import { PictureEditor } from "@/components/PictureEditor";
import { ReceiptsSheet } from "@/components/ReceiptsSheet";
import { RunningLowSheet } from "@/components/RunningLowSheet";
import { ScanSheet } from "@/components/ScanSheet";
import { ShoppingBar } from "@/components/ShoppingBar";
import { StaplesSheet } from "@/components/StaplesSheet";
import { StatusPill } from "@/components/StatusPill";
import { WakeLock } from "@/components/WakeLock";
import { APP_NAME } from "@/lib/config";
import { openDb } from "@/lib/db";
import {
  useActiveSessions,
  useAisles,
  useItems,
  useLists,
  usePendingCount,
  useProducts,
  useProfiles,
  useRunningLow,
  useStoreAisleOrder,
  useSyncStatus,
} from "@/lib/hooks";
import { processPendingReceipts } from "@/lib/receipts";
import { noticeItemAdded, sendPendingNotices } from "@/lib/shopping";
import { autoSortProduct, sweepUnsorted } from "@/lib/autosort";
import { findPicture, flushUploads, sweepPictures } from "@/lib/images";
import { updateProduct, type Actor, type AddResult } from "@/lib/mutations";
import { dismissNotice, notify, useNotice } from "@/lib/notices";
import { startSync, stopSync } from "@/lib/sync";
import type { AisleRow, ListItemRow, ProductRow } from "@/lib/types";

const ACTIVE_LIST_KEY = "trolley-active-list";

function readActiveList(): string | null {
  try {
    return localStorage.getItem(ACTIVE_LIST_KEY);
  } catch {
    return null;
  }
}

// Opens this person's local store and starts syncing before anything reads from it.
export function App({ mode = "phone" }: { mode?: "phone" | "kiosk" }) {
  const { session, profile } = useAuth();
  const userId = session.user.id;
  // Opening is synchronous (Dexie connects lazily), so the store exists before Main renders.
  useMemo(() => openDb(userId), [userId]);

  useEffect(() => {
    void startSync(profile.household_id);
    return () => stopSync();
  }, [userId, profile.household_id]);

  return <Main key={userId} mode={mode} />;
}

type Overlay = null | "settings" | "lists" | "staples" | "scan" | "receipts" | "running-low";

function Main({ mode }: { mode: "phone" | "kiosk" }) {
  const { session, profile: authProfile, signOut } = useAuth();
  const actor: Actor = useMemo(
    () => ({ userId: session.user.id, householdId: authProfile.household_id }),
    [session.user.id, authProfile.household_id],
  );
  const { ready } = useSyncStatus();
  const lists = useLists();
  const loadedAisles = useAisles();
  const aisles = useMemo(() => loadedAisles ?? [], [loadedAisles]);
  const profiles = useProfiles();
  const products = useProducts();
  const [chosenList, setChosenList] = useState<string | null>(readActiveList);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [editing, setEditing] = useState<ListItemRow | null>(null);
  const [dupIds, setDupIds] = useState<string[] | null>(null);
  const kiosk = mode === "kiosk";

  const activeList = useMemo(() => {
    if (!lists || lists.length === 0) return null;
    if (kiosk) return lists.find((l) => l.name.toLowerCase() === "groceries") ?? lists[0];
    return lists.find((l) => l.id === chosenList) ?? lists[0];
  }, [lists, chosenList, kiosk]);

  const loadedItems = useItems(activeList?.id ?? null);
  const items = useMemo(() => loadedItems ?? [], [loadedItems]);
  const sessions = useActiveSessions(activeList?.id ?? null);
  const suggestions = useRunningLow(activeList?.id ?? null) ?? [];
  const dueCount = suggestions.filter((s) => !s.onList).length;
  const pending = usePendingCount();
  const mySession = sessions.find((s) => s.started_by === actor.userId);
  // Whoever is at the shop (the shopper, or someone walking round with them) sees the list in
  // the order that store is usually walked, once the app has learned it.
  const tripStore = mySession?.store ?? sessions.find((s) => s.store)?.store ?? null;
  const storeAisles = useStoreAisleOrder(tripStore, aisles);
  // Which trip the add box was opened on, so it starts folded again on the next trip.
  const [addOpenOn, setAddOpenOn] = useState<string | null>(null);
  const addOpen = Boolean(mySession) && addOpenOn === mySession?.id;
  // While I'm shopping, things other people add after I started get highlighted.
  // (Compared as times, not text: the server and the phone write timestamps differently.)
  const highlightIds = useMemo(() => {
    if (!mySession) return new Set<string>();
    const since = Date.parse(mySession.started_at);
    return new Set(
      items
        .filter((i) => !i.checked && i.added_by !== actor.userId && Date.parse(i.created_at) >= since)
        .map((i) => i.id),
    );
  }, [items, mySession, actor.userId]);

  // Notifications go once the thing they're about has reached the server.
  useEffect(() => {
    if (pending === 0) void sendPendingNotices();
  }, [pending]);
  const openCount = items.filter((i) => !i.checked).length;

  const chooseList = useCallback((id: string) => {
    setChosenList(id);
    try {
      localStorage.setItem(ACTIVE_LIST_KEY, id);
    } catch {
      // not saved: fine
    }
  }, []);


  // Sort anything still unsorted once the device has caught up, and again when signal returns.
  useEffect(() => {
    if (!ready) return;
    void sweepUnsorted();
    void flushUploads();
    void processPendingReceipts(actor);
    // Give first-time lookups a head start before retrying anything still missing a picture.
    const first = setTimeout(() => void sweepPictures(), 30_000);
    const onOnline = () => {
      void sweepUnsorted();
      void flushUploads();
      void processPendingReceipts(actor);
      void sweepPictures();
    };
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", onOnline);
    };
  }, [ready, actor]);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const closeEditor = useCallback(() => setEditing(null), []);

  function onAdded(r: AddResult) {
    if (!r.product.aisle_id) void autoSortProduct(r.product);
    // Scanned products already fetch their Open Food Facts picture in the scanner.
    if (!r.product.image_path && !r.product.off_code) void findPicture(r.product);
    if (r.status !== "already" && sessions.some((s) => s.started_by !== actor.userId)) {
      void noticeItemAdded(r.item.id);
    }
    if (r.status === "already") notify(`${r.item.name} is already on the list`);
    else if (r.status === "restored") notify(`${r.item.name} is back on the list`);
  }

  // Keep the editor showing the latest version of the item if it changes elsewhere.
  const liveEditing = editing ? (items.find((i) => i.id === editing.id) ?? null) : null;
  const editingProduct = liveEditing?.product_id ? products.get(liveEditing.product_id) : undefined;

  // The first time on a device, wait for the first full download so nothing gets added twice.
  // After that the app opens straight from the device, signal or not.
  if (!ready || !lists || !activeList) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-muted" role="status">
        {ready ? "Getting your lists…" : "Getting your lists… (this needs signal the first time)"}
      </div>
    );
  }

  const nav: { key: string; label: string; icon: string; onClick: () => void; badge?: number }[] = [
    { key: "lists", label: "Lists", icon: "📋", onClick: () => setOverlay("lists") },
    { key: "scan", label: "Scan", icon: "📷", onClick: () => setOverlay("scan") },
    { key: "staples", label: "Staples", icon: "⭐", onClick: () => setOverlay("staples") },
    { key: "running-low", label: "Running low", icon: "⏳", onClick: () => setOverlay("running-low"), badge: dueCount },
    { key: "settings", label: "Settings", icon: "⚙️", onClick: () => setOverlay("settings") },
  ];

  return (
    <div className={`mx-auto flex min-h-dvh flex-col ${kiosk ? "max-w-none" : "max-w-3xl lg:max-w-6xl"}`}>
      <header className="sticky top-0 z-20 flex flex-col gap-2.5 bg-background/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 backdrop-blur">
        {kiosk ? (
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-4xl font-bold">
              <span aria-hidden>{activeList.icon}</span>
              {activeList.name}
              <span className="sr-only">, {openCount} items to get</span>
            </h1>
            <StatusPill />
          </div>
        ) : (
          // On a phone the list tabs are the heading: no title row, more room for the list.
          <div className="flex items-center gap-2">
            <h1 className="sr-only">
              {APP_NAME}: {activeList.name}, {openCount} items to get
            </h1>
            <nav aria-label="Lists" className="-ml-4 flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5 pl-4">
              {lists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-current={l.id === activeList.id ? "page" : undefined}
                  onClick={() => chooseList(l.id)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-medium ${
                    l.id === activeList.id ? "bg-brand text-brand-contrast" : "bg-surface-2"
                  }`}
                >
                  <span aria-hidden>{l.icon}</span>
                  {l.name}
                </button>
              ))}
            </nav>
            <StatusPill />
          </div>
        )}
        {kiosk ? (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <AddBar actor={actor} listId={activeList.id} onAdded={onAdded} large />
            </div>
            <button
              type="button"
              onClick={() => setOverlay("scan")}
              className="flex min-h-16 shrink-0 items-center gap-2 rounded-2xl border-2 border-brand px-6 text-2xl font-semibold text-brand-strong"
            >
              <span aria-hidden>📷</span> Scan
            </button>
          </div>
        ) : (
          // While shopping the list matters more than the add box, so it folds away.
          mySession && !addOpen ? (
            <button
              type="button"
              onClick={() => setAddOpenOn(mySession.id)}
              className="min-h-11 rounded-2xl border border-border px-4 text-left font-medium text-muted"
            >
              + Add something
            </button>
          ) : (
            <AddBar actor={actor} listId={activeList.id} onAdded={onAdded} />
          )
        )}
        <ShoppingBar
          actor={actor}
          list={activeList}
          sessions={sessions}
          profiles={profiles}
          items={items}
          large={kiosk}
          controls={!kiosk}
          storeOrderLearned={Boolean(storeAisles)}
          onScanReceipt={() => setOverlay("receipts")}
        />
      </header>

      <main className={`flex-1 px-4 pt-2 ${kiosk ? "pb-8" : "pb-28"}`}>
        {!kiosk && !mySession && dueCount > 0 && (
          <button
            type="button"
            onClick={() => setOverlay("running-low")}
            className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-surface-2 px-3 text-left text-sm font-medium"
          >
            <span aria-hidden>⏳</span>
            <span className="flex-1">
              {dueCount === 1 ? "1 thing might be running low" : `${dueCount} things might be running low`}
            </span>
            <span aria-hidden className="text-brand-strong">
              See →
            </span>
          </button>
        )}
        <ListView
          actor={actor}
          list={activeList}
          items={items}
          aisles={storeAisles ?? aisles}
          shopping={Boolean(mySession)}
          swipe={profiles.get(actor.userId)?.swipe_actions ?? true}
          products={products}
          profiles={profiles}
          large={kiosk}
          columns={kiosk ? 3 : 2}
          highlightIds={highlightIds}
          onDuplicates={setDupIds}
          onEdit={setEditing}
        />
      </main>

      {!kiosk && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <ul className="mx-auto flex max-w-3xl justify-around">
            {nav.map((n) => (
              <li key={n.key} className="flex-1">
                <button
                  type="button"
                  onClick={n.onClick}
                  className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-sm font-medium"
                >
                  <span aria-hidden className="relative text-xl">
                    {n.icon}
                    {n.badge ? (
                      <span className="absolute -top-1 -right-3 min-w-5 rounded-full bg-brand px-1 text-center text-xs font-bold text-brand-contrast">
                        {n.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="leading-tight">{n.label}</span>
                  {n.badge ? <span className="sr-only">, {n.badge} suggested</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <NoticeBar />
      {mySession && <WakeLock />}

      <DuplicateSheet
        group={dupIds ? items.filter((i) => dupIds.includes(i.id) && !i.deleted_at && !i.checked) : null}
        products={products}
        aisles={aisles}
        profiles={profiles}
        onClose={() => setDupIds(null)}
      />

      <ItemSheet
        actor={actor}
        item={liveEditing}
        aisles={aisles}
        onClose={closeEditor}
        extra={
          editingProduct && (
            <ItemExtras
              product={editingProduct}
              aisle={aisles.find((a) => a.id === (liveEditing?.aisle_id ?? editingProduct.aisle_id))}
            />
          )
        }
      />

      <ScanSheet
        open={overlay === "scan"}
        onClose={closeOverlay}
        actor={actor}
        listId={activeList.id}
        aisles={aisles}
        onAdded={onAdded}
      />

      <RunningLowSheet
        open={overlay === "running-low"}
        onClose={closeOverlay}
        actor={actor}
        listId={activeList.id}
        listName={activeList.name}
        aisles={aisles}
        suggestions={suggestions}
        onAdded={onAdded}
      />

      <ReceiptsSheet open={overlay === "receipts"} onClose={closeOverlay} actor={actor} listId={activeList.id} />

      <StaplesSheet
        open={overlay === "staples"}
        onClose={closeOverlay}
        actor={actor}
        listId={activeList.id}
        aisles={aisles}
      />

      <ListsSheet
        open={overlay === "lists"}
        onClose={closeOverlay}
        lists={lists}
        active={activeList}
        items={items}
        aisles={aisles}
        profiles={profiles}
        onPick={chooseList}
        onManage={() => setOverlay("settings")}
        onToast={notify}
      />

      <Settings
        open={overlay === "settings"}
        onClose={closeOverlay}
        actor={actor}
        profile={profiles.get(actor.userId)}
        onSignOut={() => void signOut()}
        onOpenReceipts={() => setOverlay("receipts")}
        notifications={<NotificationSettings householdId={actor.householdId} userId={actor.userId} />}
      />
    </div>
  );
}

// Picture, staple and Running low controls under the item editor: these belong to the product, so they
// carry over to every list the product is on.
function ItemExtras({ product, aisle }: { product: ProductRow; aisle: AisleRow | undefined }) {
  return (
    <>
      <PictureEditor product={product} aisle={aisle} />
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={product.is_staple}
          onChange={(e) => void updateProduct(product, { is_staple: e.target.checked })}
          className="h-5 w-5 accent-[var(--brand)]"
        />
        <span>
          <span className="font-medium">Staple</span>
          <span className="block text-sm text-muted">Keep it on the Staples sheet for one-tap adding</span>
        </span>
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={!product.hide_running_low}
          onChange={(e) => void updateProduct(product, { hide_running_low: !e.target.checked })}
          className="h-5 w-5 accent-[var(--brand)]"
        />
        <span>
          <span className="font-medium">Suggest when running low</span>
          <span className="block text-sm text-muted">Offer it on Running low when it&apos;s usually due</span>
        </span>
      </label>
    </>
  );
}

// The message at the bottom of the screen, with its Undo (or other) button when it has one.
function NoticeBar() {
  const notice = useNotice();
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-foreground px-4 py-2 text-background shadow-xl"
    >
      <span className="min-h-8 flex-1 py-1.5">{notice.text}</span>
      {notice.action && (
        <button
          type="button"
          onClick={() => {
            const { run } = notice.action!;
            dismissNotice();
            void run();
          }}
          className="min-h-11 rounded-xl px-3 font-bold underline"
        >
          {notice.action.label}
        </button>
      )}
    </div>
  );
}
