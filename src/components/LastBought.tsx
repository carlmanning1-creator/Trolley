"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dayLabel } from "@/lib/history";
import type { ProfileRow } from "@/lib/types";

// "Last bought by Grace · Thu 24 Sep", from the purchase history ticks leave.
export function LastBought({ productId, profiles }: { productId: string; profiles: Map<string, ProfileRow> }) {
  const last = useLiveQuery(async () => {
    const all = await db().purchases.where("product_id").equals(productId).toArray();
    return all.filter((p) => !p.deleted_at).sort((a, b) => b.bought_at.localeCompare(a.bought_at))[0] ?? null;
  }, [productId]);
  if (!last) return null;
  const who = last.bought_by ? profiles.get(last.bought_by)?.display_name : undefined;
  return (
    <p className="text-sm text-muted" data-testid="last-bought">
      Last bought{who ? ` by ${who}` : ""} · {dayLabel(Date.parse(last.bought_at))}
    </p>
  );
}
