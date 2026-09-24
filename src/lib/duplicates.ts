// Spots items on the same list that are probably the same thing:
//   same name ("Milk" / "milk", "Banana" / "Bananas"),
//   small typos ("Tomatos" / "Tomatoes", "Bannanas" / "Bananas"),
//   or a more specific version of the same thing ("Milk" / "Full cream milk").
// "Milk" and "Milk chocolate" are NOT flagged: the last word says what the thing is.

import type { ListItemRow } from "@/lib/types";

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("oes")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es") && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// Sizes and pack counts don't change what a thing is ("Toilet paper 24 pack" is toilet paper).
const SIZE_WORDS = new Set([
  "pack", "pk", "packet", "roll", "box", "bag", "bottle", "can", "tin", "jar", "dozen", "doz", "bunch",
  "kg", "g", "gm", "gram", "l", "lt", "litre", "liter", "ml", "x", "ea", "each",
]);

// Describing words that leave the thing the same ("Full cream milk" is still milk,
// "Peanut butter" is not butter).
const DESCRIBERS = new Set([
  "full", "cream", "skim", "lite", "light", "low", "fat", "reduced", "free", "range", "organic", "fresh",
  "large", "small", "big", "mini", "whole", "wholemeal", "white", "brown", "sliced", "plain", "original",
  "classic", "family", "value", "bulk", "extra", "thick", "thin", "raw", "unsalted", "salted", "lactose",
  "long", "life", "australian", "local", "homebrand", "essential", "select", "premium", "red", "green",
  "yellow", "ripe", "loose", "prepacked", "pre", "packed", "block", "shredded", "grated", "diced",
]);

export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(\d+(\.\d+)?)(kg|g|ml|l|pk|x)\b/g, " ") // "2l", "500g", "24pk"
    .split(/\s+/)
    .filter((w) => w && !/^\d+(\.\d+)?$/.test(w) && !SIZE_WORDS.has(w))
    .map(singular);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

export function looksLikeSameThing(a: string, b: string): boolean {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const sa = wa.join(" ");
  const sb = wb.join(" ");
  if (sa === sb) return true;

  // Small typos, scaled to length so short words like "tea"/"pea" don't collide.
  const len = Math.min(sa.length, sb.length);
  const allowed = len >= 10 ? 2 : len >= 5 ? 1 : 0;
  if (allowed && editDistance(sa, sb) <= allowed) return true;

  // One is a more specific version of the other: same last word, and the extra words only
  // describe it ("Milk" / "Full cream milk"), rather than make it something else.
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (
    short.length < long.length &&
    short.at(-1) === long.at(-1) &&
    short.every((w) => long.includes(w)) &&
    long.filter((w) => !short.includes(w)).every((w) => DESCRIBERS.has(w))
  ) {
    return true;
  }

  return false;
}

// Groups of likely duplicates among the still-to-buy items of one list, leaving out pairs
// someone has said are different. Returns item id -> the ids of its whole group.
export function findDuplicates(items: ListItemRow[]): Map<string, string[]> {
  const open = items.filter((i) => !i.checked && !i.deleted_at);
  const parent = new Map(open.map((i) => [i.id, i.id]));
  const root = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const dismissed = (x: ListItemRow, y: ListItemRow) =>
    (x.distinct_from ?? []).includes(y.id) || (y.distinct_from ?? []).includes(x.id);

  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const x = open[i];
      const y = open[j];
      if (dismissed(x, y)) continue;
      if ((x.product_id && x.product_id === y.product_id) || looksLikeSameThing(x.name, y.name)) {
        parent.set(root(x.id), root(y.id));
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const i of open) {
    const r = root(i.id);
    groups.set(r, [...(groups.get(r) ?? []), i.id]);
  }
  const out = new Map<string, string[]>();
  for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) out.set(id, ids);
  return out;
}
