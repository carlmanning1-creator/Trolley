"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { SignIn } from "@/components/SignIn";

export type Profile = {
  id: string;
  household_id: string;
  display_name: string;
  colour: string;
};

type AuthState = {
  session: Session;
  profile: Profile;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const PROFILE_CACHE_KEY = "trolley-profile";

function readCachedProfile(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    return p.id === userId ? p : null;
  } catch {
    return null;
  }
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

type Status = "loading" | "signed-out" | "no-profile" | "ready";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const sb = supabase();
    let cancelled = false;

    async function loadProfile(s: Session) {
      // Use the cached copy straight away so the app opens instantly and offline.
      const cached = readCachedProfile(s.user.id);
      if (cached) {
        setProfile(cached);
        setStatus("ready");
      }
      const { data, error } = await sb
        .from("profiles")
        .select("id, household_id, display_name, colour")
        .eq("id", s.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setProfile(data);
        try {
          localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
        } catch {
          // storage full or blocked: the app still works, it just refetches next time
        }
        setStatus("ready");
      } else if (!cached && !error) {
        setStatus("no-profile");
      } else if (!cached) {
        // Network error and nothing cached yet: keep the loader up and try again shortly.
        setStatus("loading");
        setTimeout(() => {
          if (!cancelled) void loadProfile(s);
        }, 3000);
      }
    }

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) void loadProfile(data.session);
      else setStatus("signed-out");
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      setSession(s);
      if (event === "SIGNED_OUT" || !s) {
        setProfile(null);
        setStatus("signed-out");
      } else if (event === "SIGNED_IN") {
        void loadProfile(s);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {
      // ignore
    }
    await supabase().auth.signOut();
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <span className="text-muted">Loading…</span>
      </div>
    );
  }
  if (status === "signed-out" || !session) return <SignIn />;
  if (status === "no-profile" || !profile) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <p>This account isn&apos;t part of a household yet. Ask Carl to add you.</p>
        <button
          type="button"
          onClick={signOut}
          className="min-h-11 rounded-xl border border-border px-4 font-medium"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, profile, signOut }}>{children}</AuthContext.Provider>
  );
}
