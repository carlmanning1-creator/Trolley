import type { ShoppingSessionRow } from "@/lib/types";

// A shopping trip counts as active until it's finished, or for six hours if someone forgets.
export const SESSION_MAX_MS = 6 * 60 * 60 * 1000;

export function isActive(s: ShoppingSessionRow, now = Date.now()): boolean {
  return !s.ended_at && now - new Date(s.started_at).getTime() < SESSION_MAX_MS;
}
