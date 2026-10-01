"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  enableNotifications,
  ensureNotificationsRegistered,
  getPushState,
  PUSH_CHANGED,
  turnedOffOnPurpose,
  type PushState,
} from "@/lib/push";

// A card above the list reminding someone whose phone can't get notifications yet that they're
// missing out. "Not now" hides it for a fortnight; switching them off in Settings hides it for good.
const SNOOZE_KEY = "trolley-notify-nudge-snoozed";
const SNOOZE_MS = 14 * 86_400_000;

function snoozed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

const card = "mb-3 flex flex-col gap-2 rounded-xl bg-surface-2 px-3 py-3 text-sm";
const primary = "min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-contrast";
const secondary = "min-h-11 rounded-xl px-3 font-medium text-muted";

export function NotificationNudge({ householdId, userId }: { householdId: string; userId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);
  const [showSteps, setShowSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      // Let a phone that already allows notifications finish registering before deciding.
      await ensureNotificationsRegistered(householdId, userId);
      const s = await getPushState();
      if (alive) {
        setState(s);
        setHidden(snoozed() || turnedOffOnPurpose());
      }
    };
    void check();
    // Coming back from the phone's settings may have changed things.
    const onVisible = () => document.visibilityState === "visible" && void check();
    const onChanged = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PUSH_CHANGED, onChanged);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PUSH_CHANGED, onChanged);
    };
  }, [householdId, userId]);

  if (hidden || state === null || state === "on" || state === "unsupported") return null;

  const notNow = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      // only hidden until the app next opens
    }
    setHidden(true);
  };
  const buttons = (main?: ReactNode) => (
    <div className="flex flex-wrap items-center gap-2">
      {main}
      <button type="button" onClick={notNow} className={secondary}>
        Not now
      </button>
    </div>
  );

  return (
    <section aria-label="Notifications" className={card} data-testid="notify-nudge">
      <p className="flex gap-2">
        <span aria-hidden>🔔</span>
        <span>
          {state === "needs-install" && (
            <>Add Trolley to your Home Screen to get notifications when someone&apos;s at the shops or needs something.</>
          )}
          {state === "blocked" && (
            <>
              Notifications are blocked, so you won&apos;t hear when someone&apos;s at the shops or needs something.
              Allow them for Trolley in your phone&apos;s settings.
            </>
          )}
          {state === "off" && <>Turn on notifications to hear when someone&apos;s at the shops or needs something.</>}
        </span>
      </p>
      {state === "needs-install" && showSteps && (
        <ol className="list-decimal pl-6 text-muted">
          <li>Tap the Share button (the square with an arrow) at the bottom of Safari.</li>
          <li>Scroll down and tap “Add to Home Screen”, then “Add”.</li>
          <li>Open Trolley from the new icon.</li>
        </ol>
      )}
      {state === "needs-install" &&
        buttons(
          !showSteps && (
            <button type="button" onClick={() => setShowSteps(true)} className={primary}>
              Show me how
            </button>
          ),
        )}
      {state === "blocked" && buttons()}
      {state === "off" &&
        buttons(
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                setState(await enableNotifications(householdId, userId));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't turn on notifications.");
              }
            }}
            className={primary}
          >
            Turn on
          </button>,
        )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
