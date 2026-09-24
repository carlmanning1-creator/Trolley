export const words = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));

// How well an OFF product fits what someone typed. Null means "not a fit at all":
// every typed word must appear in the product's name (or brand), so "Milk" never
// picks a chocolate bar that merely mentions milk in its categories.
export function nameFit(query: string, name: string, brand: string | null, au: boolean): number | null {
  const q = words(query);
  if (q.length === 0) return null;
  const n = words(`${name} ${brand ?? ""}`);
  const nameOnly = words(name);
  if (!q.every((w) => n.includes(w))) return null;
  // The last word of a name says what the thing is ("milk chocolate" is chocolate, "banana
  // muffins" are muffins), so it must be one of the typed words, unless what was typed is the brand.
  const head = nameOnly[nameOnly.length - 1];
  const brandWords = words(brand ?? "");
  const typedTheBrand = brandWords.length > 0 && q.join(" ") === brandWords.join(" ");
  if (!q.includes(head) && !typedTheBrand) return null;
  let score = 0;
  if (au) score += 30;
  if (q.every((w) => nameOnly.includes(w))) score += 20;
  if (nameOnly.join(" ") === q.join(" ")) score += 25;
  score -= Math.max(0, nameOnly.length - q.length) * 3; // prefer plain names over long variants
  return score;
}

// How well a Wikimedia Commons file title fits what someone typed. Every typed word must be
// in the title; short, plain titles and product-style shots ("white background") rank first.
export function commonsFit(query: string, title: string): number | null {
  const q = words(query);
  const t = words(title.replace(/^file:/i, "").replace(/\.(jpe?g|png|webp|gif|tiff?)$/i, ""));
  if (q.length === 0 || !q.every((w) => t.includes(w))) return null;
  let score = 50 - Math.max(0, t.length - q.length) * 4;
  if (/white background|isolated|studio|product/i.test(title)) score += 15;
  // People, paintings, maps and diagrams aren't what anyone means by "bananas".
  if (/\b(boy|girl|man|woman|people|painting|map|diagram|logo|chart|poster|stamp|coat of arms)\b/i.test(title)) score -= 40;
  return score;
}
