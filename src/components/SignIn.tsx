"use client";

import { useState, type FormEvent } from "react";
import { APP_NAME } from "@/lib/config";
import { supabase } from "@/lib/supabase";

// Two steps: email, then the 6-digit code from the email.
// Codes instead of magic links, because links open Safari instead of the installed app on iPhone.
export function SignIn() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setBusy(true);
    const { error } = await supabase().auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("signups not allowed") ||
          error.status === 422
          ? "That email isn't on the household list."
          : error.status === 429
            ? "Too many codes asked for. Wait a minute and try again."
            : "Couldn't send the code. Check your connection and try again.",
      );
      return;
    }
    setEmail(clean);
    setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      setError("The code has 6 digits.");
      return;
    }
    setBusy(true);
    const { error } = await supabase().auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (error) setError("That code didn't work. Check it or ask for a new one.");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto rounded-2xl" />
        <h1 className="mt-4 text-3xl font-bold">{APP_NAME}</h1>
        <p className="mt-1 text-muted">
          {step === "email" ? "Sign in with your email." : `We sent a code to ${email}.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label htmlFor="email" className="font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-lg"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-xl bg-brand px-4 text-lg font-semibold text-brand-contrast disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <label htmlFor="code" className="font-medium">
            6-digit code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-center text-2xl tracking-[0.4em]"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-xl bg-brand px-4 text-lg font-semibold text-brand-contrast disabled:opacity-60"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="min-h-11 px-2 text-brand-strong underline"
            >
              Use another email
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
              className="min-h-11 px-2 text-brand-strong underline"
            >
              Send a new code
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-warn-bg p-3 text-warn-fg">
          {error}
        </p>
      )}
    </main>
  );
}
