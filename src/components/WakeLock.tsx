"use client";

import { useEffect } from "react";

// Keeps the screen awake: always on the kitchen screen (Fully Kiosk has its own setting too),
// and on the shopper's phone during a trip.
export function WakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    async function acquire() {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Not allowed (battery saver or no user gesture yet): the screen may dim, nothing breaks.
      }
    }
    const onVisible = () => {
      if (!stopped && document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("click", onVisible, { once: true });
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
  return null;
}
