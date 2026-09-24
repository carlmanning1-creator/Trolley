"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { APP_NAME } from "@/lib/config";
import { supabase } from "@/lib/supabase";

type ListRow = { id: string; name: string; icon: string };

export function Home() {
  const { profile, signOut } = useAuth();
  const [lists, setLists] = useState<ListRow[] | null>(null);

  useEffect(() => {
    supabase()
      .from("lists")
      .select("id, name, icon")
      .is("deleted_at", null)
      .order("sort_order")
      .then(({ data }) => setLists(data ?? []));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded-xl border border-border px-4"
        >
          Sign out
        </button>
      </header>
      <p className="text-lg">
        Hi <span style={{ color: profile.colour }} className="font-semibold">{profile.display_name}</span>, you&apos;re signed in.
      </p>
      <ul className="flex flex-col gap-2" aria-label="Lists">
        {lists?.map((l) => (
          <li key={l.id} className="rounded-xl bg-surface p-4 text-lg">
            <span aria-hidden>{l.icon}</span> {l.name}
          </li>
        ))}
      </ul>
    </main>
  );
}
