// Turns what someone types into an item: "2 milk", "500g mince", "avocados x3", "bananas".

const UNITS: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g",
  l: "L", lt: "L", ltr: "L", litre: "L", litres: "L", liter: "L", liters: "L",
  ml: "mL",
  pk: "pack", pack: "pack", packs: "pack", packet: "pack", packets: "pack",
  doz: "dozen", dozen: "dozen",
  bunch: "bunch", bunches: "bunch",
  can: "can", cans: "can", tin: "tin", tins: "tin",
  bottle: "bottle", bottles: "bottle",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  jar: "jar", jars: "jar",
  loaf: "loaf", loaves: "loaf",
  x: "",
};

export type ParsedItem = { name: string; quantity: number | null; unit: string | null };

function tidyName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}

function toNumber(text: string): number | null {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
}

export function parseItem(input: string): ParsedItem {
  const text = input.replace(/\s+/g, " ").trim();

  // Leading amount: "2 milk", "2x milk", "500g mince", "1.5 kg potatoes", "3 bunches bananas"
  const lead = text.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
  if (lead) {
    const qty = toNumber(lead[1]);
    const unitWord = lead[2]?.toLowerCase();
    if (qty !== null) {
      if (unitWord && unitWord in UNITS) {
        return { name: tidyName(lead[3]), quantity: qty, unit: UNITS[unitWord] || null };
      }
      if (!unitWord) return { name: tidyName(lead[3]), quantity: qty, unit: null };
      // "2 apples": the word after the number is part of the name
      return { name: tidyName(`${lead[2]} ${lead[3]}`), quantity: qty, unit: null };
    }
  }
  // "2xmilk" with no space
  const leadX = text.match(/^(\d+)x(\S.*)$/i);
  if (leadX && toNumber(leadX[1]) !== null) {
    return { name: tidyName(leadX[2]), quantity: toNumber(leadX[1]), unit: null };
  }

  // Trailing multiplier: "avocados x3", "milk x 2", "eggs * 2"
  const trail = text.match(/^(.+?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)$/i);
  if (trail && toNumber(trail[2]) !== null) {
    return { name: tidyName(trail[1]), quantity: toNumber(trail[2]), unit: null };
  }

  return { name: tidyName(text), quantity: null, unit: null };
}

export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null && !unit) return "";
  const q = quantity === null ? "" : String(Number(quantity.toFixed(2)));
  if (!unit) return q ? `×${q}` : "";
  if (["kg", "g", "L", "mL"].includes(unit)) return `${q}${unit}`;
  const plural = quantity !== null && quantity !== 1 && !["dozen"].includes(unit);
  const word = plural ? (unit.endsWith("x") || unit.endsWith("ch") ? `${unit}es` : unit === "loaf" ? "loaves" : `${unit}s`) : unit;
  return `${q} ${word}`.trim();
}
