"use client";

import { useCallback, useEffect, useState } from "react";
import { callApi } from "@/lib/api";

type Person = { id: string; displayName: string; colour: string; email: string | null; isAdmin: boolean };

const field = "min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base";

// Settings, People (household admin only). Adding someone creates their sign-in without
// emailing them; they get a code when they open Trolley and ask for one.
export function PeopleManager({ meId }: { meId: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await callApi<{ people: Person[] }>("/api/people");
      setPeople(res.people);
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "Managing people needs a connection.");
    }
  }, []);

  useEffect(() => {
    // Fetching on open is the point here; the list lives on the server, not on this phone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const displayName = name.trim();
    const address = email.trim();
    if (!displayName || !address) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await callApi<{ people: Person[] }>("/api/people", {
        method: "POST",
        json: { displayName, email: address },
      });
      setPeople(res.people);
      setName("");
      setEmail("");
      setNotice(`${displayName} is in. Tell them to open Trolley and sign in with ${address.toLowerCase()}.`);
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "Adding people needs a connection.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Person) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await callApi<{ people: Person[] }>("/api/people", { method: "DELETE", json: { id: p.id } });
      setPeople(res.people);
      setConfirming(null);
      setNotice(`${p.displayName} has been removed and signed out. Items they added stay on the lists.`);
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "Removing people needs a connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {people === null && !error && <p className="text-muted">Loading…</p>}
      {people && (
        <ul className="flex flex-col gap-2" aria-label="People in your household">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full font-bold text-white"
                  style={{ backgroundColor: p.colour }}
                >
                  {p.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {p.displayName}
                    {p.id === meId ? " (you)" : ""}
                    {p.isAdmin ? <span className="ml-2 text-sm font-normal text-muted">Admin</span> : null}
                  </span>
                  <span className="block truncate text-sm text-muted">{p.email ?? "No email"}</span>
                </span>
                {!p.isAdmin && p.id !== meId && confirming !== p.id && (
                  <button
                    type="button"
                    onClick={() => setConfirming(p.id)}
                    className="min-h-11 rounded-xl px-3 text-danger"
                    aria-label={`Remove ${p.displayName}`}
                  >
                    Remove
                  </button>
                )}
              </div>
              {confirming === p.id && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm">
                    Remove {p.displayName}? They&apos;ll be signed out on every device and can&apos;t sign in again unless you add
                    them back.
                  </p>
                  <span className="flex justify-end gap-2">
                    <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-xl px-3">
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(p)}
                      className="min-h-11 rounded-xl bg-danger px-3 font-semibold text-white disabled:opacity-50"
                    >
                      Remove {p.displayName}
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-2" onSubmit={(e) => void add(e)}>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="new-person-name" className="sr-only">
            Their name
          </label>
          <input
            id="new-person-name"
            placeholder="Their name"
            value={name}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
          <label htmlFor="new-person-email" className="sr-only">
            Their email
          </label>
          <input
            id="new-person-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="off"
            placeholder="Their email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim() || !email.trim()}
          className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-contrast disabled:opacity-50"
        >
          Add person
        </button>
      </form>

      <p role="status" aria-live="polite" className="text-sm">
        {error ? <span className="text-danger">{error}</span> : notice}
      </p>
    </div>
  );
}
