"use client";

import { useEffect, useState } from "react";
import { disableNotifications, enableNotifications, getPushState, type PushState } from "@/lib/push";

export function NotificationSettings({ householdId, userId }: { householdId: string; userId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  if (state === null) return <p className="text-muted">Checking…</p>;

  if (state === "needs-install") {
    return (
      <div className="flex flex-col gap-2">
        <p>On iPhone, notifications only work once Trolley is on your Home Screen:</p>
        <ol className="list-decimal pl-6 text-muted">
          <li>Tap the Share button (the square with an arrow) at the bottom of Safari.</li>
          <li>Scroll down and tap “Add to Home Screen”, then “Add”.</li>
          <li>Open Trolley from the new icon and come back here.</li>
        </ol>
      </div>
    );
  }
  if (state === "unsupported") return <p className="text-muted">This browser can&apos;t show notifications.</p>;
  if (state === "blocked") {
    return (
      <p className="text-muted">
        Notifications are blocked for Trolley. Allow them in your phone&apos;s settings for this app, then come back.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>
          <span className="font-medium">Notifications on this device</span>
          <span className="block text-sm text-muted">When someone starts shopping, and new items while you shop</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={state === "on"}
          onChange={async (e) => {
            setError(null);
            try {
              setState(e.target.checked ? await enableNotifications(householdId, userId) : await disableNotifications());
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't change notifications.");
            }
          }}
          className="h-6 w-6 accent-[var(--brand)]"
        />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
