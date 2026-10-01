"use client";

import { notify } from "@/lib/notices";
import { noticeNeededSoon } from "@/lib/shopping";
import type { ListItemRow } from "@/lib/types";

// After flagging something, offer to tell everyone. Nothing is sent unless they tap it.
export function offerToTellEveryone(item: Pick<ListItemRow, "id" | "name">) {
  notify(`${item.name} is flagged as needed soon`, {
    label: "Tell everyone",
    run: async () => {
      // The result (who got it) replaces this once it's actually sent.
      notify(navigator.onLine ? "Sending…" : "It'll send when you have signal.");
      await noticeNeededSoon(item.id);
    },
  });
}

// "!orange juice" in the add box means flag it as needed soon.
export function readNeededSoon(text: string): { text: string; neededSoon: boolean } {
  const trimmed = text.trim();
  return trimmed.startsWith("!")
    ? { text: trimmed.replace(/^!+\s*/, ""), neededSoon: true }
    : { text: trimmed, neededSoon: false };
}
