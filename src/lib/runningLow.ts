import type { ListItemRow, ProductRow, PurchaseRow } from "@/lib/types";

// Running low: works out each product's usual gap between purchases from the ticks people have
// made, and suggests the ones that are about due. It is a guess from timing only.

const DAY = 24 * 60 * 60 * 1000;
const MIN_PURCHASES = 3; // two gaps, so one odd shop can't set the rhythm on its own
const SAME_SHOP_DAYS = 1.5; // buying it again within this is the same shop, not a new cycle
const DUE_AT = 0.85; // suggest a little before the usual gap is up (lists get written the day before)
const GIVEN_UP_AFTER = 3; // this many usual gaps with no purchase: they've stopped buying it

export type Suggestion = {
  product: ProductRow;
  usualDays: number;
  sinceDays: number;
  lastBought: number; // when, as a timestamp
  onList: boolean;
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// The distinct shopping days for one product, oldest first.
function shopDays(purchases: PurchaseRow[]): number[] {
  const times = purchases.map((p) => Date.parse(p.bought_at)).sort((a, b) => a - b);
  const kept: number[] = [];
  for (const t of times) {
    if (kept.length === 0 || t - kept[kept.length - 1] >= SAME_SHOP_DAYS * DAY) kept.push(t);
  }
  return kept;
}

export function runningLow(opts: {
  products: Iterable<ProductRow>;
  purchases: PurchaseRow[];
  items: ListItemRow[]; // the current list's items
  listId: string;
  now?: number;
}): Suggestion[] {
  const now = opts.now ?? Date.now();
  const byProduct = new Map<string, PurchaseRow[]>();
  for (const p of opts.purchases) {
    if (p.deleted_at) continue;
    const bucket = byProduct.get(p.product_id);
    if (bucket) bucket.push(p);
    else byProduct.set(p.product_id, [p]);
  }
  const onList = new Set(opts.items.filter((i) => !i.deleted_at && !i.checked).map((i) => i.product_id));

  const out: Suggestion[] = [];
  for (const product of opts.products) {
    if (product.deleted_at || product.hide_running_low) continue;
    const history = byProduct.get(product.id);
    if (!history) continue;
    // Suggest it for the list it was last bought from (Groceries things on Groceries).
    const latest = history.reduce((a, b) => (Date.parse(b.bought_at) > Date.parse(a.bought_at) ? b : a));
    if (latest.list_id && latest.list_id !== opts.listId) continue;
    const days = shopDays(history);
    if (days.length < MIN_PURCHASES) continue;
    const gaps = days.slice(1).map((t, i) => (t - days[i]) / DAY);
    const usualDays = median(gaps);
    const sinceDays = (now - days[days.length - 1]) / DAY;
    if (sinceDays < usualDays * DUE_AT || sinceDays > usualDays * GIVEN_UP_AFTER) continue;
    out.push({ product, usualDays, sinceDays, lastBought: days[days.length - 1], onList: onList.has(product.id) });
  }
  // Most overdue first; things already on the list sink to the bottom.
  return out.sort(
    (a, b) => Number(a.onList) - Number(b.onList) || b.sinceDays / b.usualDays - a.sinceDays / a.usualDays,
  );
}

export function describeGap(days: number): string {
  if (days < 1.5) return "every day or so";
  if (days < 12) return `every ${Math.round(days)} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "every week" : `every ${weeks} weeks`;
}

// Counted in calendar days on this phone, so something bought last night is "yesterday".
export function describeSince(lastBought: number, now = Date.now()): string {
  const midnight = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const d = Math.round((midnight(now) - midnight(lastBought)) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return `${Math.round(d / 7)} weeks ago`;
}
