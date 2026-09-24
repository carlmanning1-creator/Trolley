"use client";

import { useState, type ReactNode } from "react";
import { PeopleManager } from "@/components/PeopleManager";
import { Sheet } from "@/components/Sheet";
import { PERSON_COLOURS } from "@/lib/people";
import { useAisles, useLists } from "@/lib/hooks";
import {
  addList,
  deleteList,
  moveAisle,
  moveList,
  renameAisle,
  updateList,
  updateProfile,
  type Actor,
} from "@/lib/mutations";
import type { AisleRow, ListRow, ProfileRow } from "@/lib/types";

const LIST_ICONS = ["🛒", "🔨", "💊", "🛍️", "🎁", "🏕️", "🐶", "🍷", "🧒", "📝"];

const field = "min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base";
const smallBtn =
  "flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border px-2 text-lg disabled:opacity-30";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

export function Settings({
  open,
  onClose,
  actor,
  profile,
  onSignOut,
  notifications,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  profile: ProfileRow | undefined;
  onSignOut: () => void;
  notifications?: ReactNode;
}) {
  const lists = useLists() ?? [];
  const aisles = useAisles() ?? [];

  return (
    <Sheet open={open} onClose={onClose} title="Settings" wide>
      <div className="flex flex-col gap-6">
        {profile && (
          <Section title="You">
            <ProfileEditor key={`${profile.id}:${profile.display_name}`} profile={profile} />
          </Section>
        )}

        {notifications && <Section title="Notifications">{notifications}</Section>}

        {profile?.is_admin && (
          <Section title="People">
            <PeopleManager meId={profile.id} />
          </Section>
        )}

        <Section title="Lists">
          <ul className="flex flex-col gap-2">
            {lists.map((l, i) => (
              <ListEditor key={`${l.id}:${l.name}`} list={l} first={i === 0} last={i === lists.length - 1} canDelete={lists.length > 1} />
            ))}
          </ul>
          <NewList actor={actor} />
        </Section>

        <Section title="Aisles (in the order you walk the shop)">
          <ul className="flex flex-col gap-2">
            {aisles.map((a, i) => (
              <AisleEditor key={`${a.id}:${a.name}`} aisle={a} first={i === 0} last={i === aisles.length - 1} />
            ))}
          </ul>
        </Section>

        <Section title="Account">
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-12 rounded-xl border border-danger px-4 font-semibold text-danger"
          >
            Sign out
          </button>
        </Section>
      </div>
    </Sheet>
  );
}

function ProfileEditor({ profile }: { profile: ProfileRow }) {
  const [name, setName] = useState(profile.display_name);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <label htmlFor="display-name" className="sr-only">
          Display name
        </label>
        <input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== profile.display_name && void updateProfile(profile, { display_name: name.trim() })}
          className={field}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm text-muted">Your colour</legend>
        <div className="flex flex-wrap gap-2">
          {PERSON_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={profile.colour === c}
              onClick={() => void updateProfile(profile, { colour: c })}
              className={`h-11 w-11 rounded-full border-4 ${profile.colour === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ListEditor({ list, first, last, canDelete }: { list: ListRow; first: boolean; last: boolean; canDelete: boolean }) {
  const [name, setName] = useState(list.name);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <label htmlFor={`list-icon-${list.id}`} className="sr-only">
          Icon for {list.name}
        </label>
        <select
          id={`list-icon-${list.id}`}
          value={list.icon}
          onChange={(e) => void updateList(list, { icon: e.target.value })}
          className="min-h-11 rounded-xl border border-border bg-background px-1 text-xl"
        >
          {[...new Set([list.icon, ...LIST_ICONS])].map((ic) => (
            <option key={ic} value={ic}>
              {ic}
            </option>
          ))}
        </select>
        <label htmlFor={`list-name-${list.id}`} className="sr-only">
          List name
        </label>
        <input
          id={`list-name-${list.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== list.name && void updateList(list, { name: name.trim() })}
          className={field}
        />
        <button type="button" className={smallBtn} disabled={first} onClick={() => void moveList(list.id, -1)} aria-label={`Move ${list.name} up`}>
          ↑
        </button>
        <button type="button" className={smallBtn} disabled={last} onClick={() => void moveList(list.id, 1)} aria-label={`Move ${list.name} down`}>
          ↓
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={list.use_aisles}
            onChange={(e) => void updateList(list, { use_aisles: e.target.checked })}
            className="h-5 w-5 accent-[var(--brand)]"
          />
          Sort by aisle
        </label>
        {canDelete &&
          (confirming ? (
            <span className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="min-h-11 rounded-xl px-3">
                Keep
              </button>
              <button
                type="button"
                onClick={() => void deleteList(list)}
                className="min-h-11 rounded-xl bg-danger px-3 font-semibold text-white"
              >
                Delete {list.name}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="min-h-11 rounded-xl px-3 text-danger">
              Delete
            </button>
          ))}
      </div>
    </li>
  );
}

function NewList({ actor }: { actor: Actor }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void addList(actor, name);
        setName("");
      }}
    >
      <label htmlFor="new-list" className="sr-only">
        New list name
      </label>
      <input id="new-list" placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      <button type="submit" className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-contrast">
        Add list
      </button>
    </form>
  );
}

function AisleEditor({ aisle, first, last }: { aisle: AisleRow; first: boolean; last: boolean }) {
  const [name, setName] = useState(aisle.name);
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="w-8 text-center text-xl">
        {aisle.icon}
      </span>
      <label htmlFor={`aisle-${aisle.id}`} className="sr-only">
        Aisle name
      </label>
      <input
        id={`aisle-${aisle.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== aisle.name && void renameAisle(aisle, name)}
        className={field}
      />
      <button type="button" className={smallBtn} disabled={first} onClick={() => void moveAisle(aisle.id, -1)} aria-label={`Move ${aisle.name} up`}>
        ↑
      </button>
      <button type="button" className={smallBtn} disabled={last} onClick={() => void moveAisle(aisle.id, 1)} aria-label={`Move ${aisle.name} down`}>
        ↓
      </button>
    </li>
  );
}
