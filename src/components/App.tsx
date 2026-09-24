"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AddBar } from "@/components/AddBar";
import { useAuth } from "@/components/AuthProvider";
import { ItemSheet } from "@/components/ItemSheet";
import { ListView } from "@/components/ListView";
import { Settings } from "@/components/Settings";
import { Sheet } from "@/components/Sheet";
import { StatusPill } from "@/components/StatusPill";
import { APP_NAME } from "@/lib/config";
import { openDb } from "@/lib/db";
import { useAisles, useItems, useLists, useProducts, useProfiles, useSyncStatus } from "@/lib/hooks";
import type { Actor, AddResult } from "@/lib/mutations";
import { startSync, stopSync } from "@/lib/sync";
import type { ListItemRow } from "@/lib/types";

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

type Overlay = null | "settings" | "lists";

function Main({ mode }: { mode: "phone" | "kiosk" }) {
  const { session, profile: authProfile, signOut } = useAuth();
  const actor: Actor = useMemo(
    () => ({ userId: session.user.id, householdId: authProfile.household_id }),
    [session.user.id, authProfile.household_id],
  );
  const { ready } = useSyncStatus();
  const lists = useLists();
  const aisles = useAisles() ?? [];
  const profiles = useProfiles();
  const products = useProducts();
  const [chosenList, setChosenList] = useState<string | null>(readActiveList);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [editing, setEditing] = useState<ListItemRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const kiosk = mode === "kiosk";

  const activeList = useMemo(() => {
    if (!lists || lists.length === 0) return null;
    if (kiosk) return lists.find((l) => l.name.toLowerCase() === "groceries") ?? lists[0];
    return lists.find((l) => l.id === chosenList) ?? lists[0];
  }, [lists, chosenList, kiosk]);

  const items = useItems(activeList?.id ?? null) ?? [];
  const openCount = items.filter((i) => !i.checked).length;

  const chooseList = useCallback((id: string) => {
    setChosenList(id);
    try {
      localStorage.setItem(ACTIVE_LIST_KEY, id);
    } catch {
      // not saved: fine
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const closeEditor = useCallback(() => setEditing(null), []);

  function onAdded(r: AddResult) {
    if (r.status === "already") setToast(`${r.item.name} is already on the list`);
    else if (r.status === "restored") setToast(`${r.item.name} is back on the list`);
  }

  // Keep the editor showing the latest version of the item if it changes elsewhere.
  const liveEditing = editing ? (items.find((i) => i.id === editing.id) ?? null) : null;

  if (!lists || !activeList) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-muted" role="status">
        {ready || lists ? "Getting your lists…" : "Getting your lists… (this needs signal the first time)"}
      </div>
    );
  }

  const nav: { key: string; label: string; icon: string; onClick: () => void }[] = [
    { key: "lists", label: "Lists", icon: "📋", onClick: () => setOverlay("lists") },
    { key: "settings", label: "Settings", icon: "⚙️", onClick: () => setOverlay("settings") },
  ];

  return (
    <div className={`mx-auto flex min-h-dvh flex-col ${kiosk ? "max-w-none" : "max-w-3xl lg:max-w-6xl"}`}>
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-background/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className={`flex items-center gap-2 font-bold ${kiosk ? "text-4xl" : "text-2xl"}`}>
            <span aria-hidden>{activeList.icon}</span>
            {kiosk ? activeList.name : APP_NAME}
            <span className="sr-only">, {openCount} items to get</span>
          </h1>
          <StatusPill />
        </div>
        {!kiosk && (
          <nav aria-label="Lists" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-current={l.id === activeList.id ? "page" : undefined}
                onClick={() => chooseList(l.id)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-medium ${
                  l.id === activeList.id ? "bg-brand text-brand-contrast" : "bg-surface-2"
                }`}
              >
                <span aria-hidden>{l.icon}</span>
                {l.name}
              </button>
            ))}
          </nav>
        )}
        <AddBar actor={actor} listId={activeList.id} onAdded={onAdded} large={kiosk} />
      </header>

      <main className={`flex-1 px-4 pt-2 ${kiosk ? "pb-8" : "pb-28"}`}>
        <ListView
          actor={actor}
          list={activeList}
          items={items}
          aisles={aisles}
          products={products}
          profiles={profiles}
          large={kiosk}
          columns={kiosk ? 3 : 2}
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
                  <span aria-hidden className="text-xl">
                    {n.icon}
                  </span>
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl bg-foreground px-4 py-3 text-center text-background shadow-xl"
        >
          {toast}
        </div>
      )}

      <ItemSheet item={liveEditing} aisles={aisles} onClose={closeEditor} />

      <Sheet open={overlay === "lists"} onClose={closeOverlay} title="Lists">
        <ListPicker
          lists={lists.map((l) => ({ id: l.id, label: `${l.icon} ${l.name}` }))}
          activeId={activeList.id}
          onPick={(id) => {
            chooseList(id);
            closeOverlay();
          }}
          footer={
            <button
              type="button"
              onClick={() => setOverlay("settings")}
              className="min-h-12 w-full rounded-xl border border-border font-medium"
            >
              Add, rename or reorder lists
            </button>
          }
        />
      </Sheet>

      <Settings
        open={overlay === "settings"}
        onClose={closeOverlay}
        actor={actor}
        profile={profiles.get(actor.userId)}
        onSignOut={() => void signOut()}
      />
    </div>
  );
}

function ListPicker({
  lists,
  activeId,
  onPick,
  footer,
}: {
  lists: { id: string; label: string }[];
  activeId: string;
  onPick: (id: string) => void;
  footer: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {lists.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onPick(l.id)}
          aria-current={l.id === activeId ? "page" : undefined}
          className={`min-h-14 rounded-xl px-4 text-left text-lg font-medium ${
            l.id === activeId ? "bg-brand text-brand-contrast" : "bg-surface-2"
          }`}
        >
          {l.label}
        </button>
      ))}
      <div className="pt-2">{footer}</div>
    </div>
  );
}
