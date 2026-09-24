import { describe, expect, it } from "vitest";
import { listAsCsv, listAsPrintHtml, listAsText } from "@/lib/exportList";
import type { AisleRow, ListItemRow, ListRow, ProfileRow } from "@/lib/types";

const t = "2026-09-24T00:00:00.000Z";
const list: ListRow = { id: "l", household_id: "h", name: "Groceries", icon: "🛒", sort_order: 1, use_aisles: true, created_at: t, updated_at: t, deleted_at: null };
const aisles: AisleRow[] = [
  { id: "fv", household_id: "h", name: "Fruit & Veg", icon: "🥦", sort_order: 1, created_at: t, updated_at: t, deleted_at: null },
  { id: "d", household_id: "h", name: "Dairy & Eggs", icon: "🥛", sort_order: 2, created_at: t, updated_at: t, deleted_at: null },
];
const item = (id: string, name: string, aisle: string | null, extra: Partial<ListItemRow> = {}): ListItemRow => ({
  id, household_id: "h", list_id: "l", product_id: null, aisle_id: aisle, name, quantity: null, unit: null, note: null, link: null,
  added_by: "c", checked: false, checked_by: null, checked_at: null, check_changed_at: null, created_at: t, updated_at: t, deleted_at: null, ...extra,
});
const profiles = new Map<string, ProfileRow>([["c", { id: "c", household_id: "h", display_name: "Carl", colour: "#000", created_at: t, updated_at: t }]]);
const items = [
  item("1", "Milk", "d", { quantity: 2 }),
  item("2", "Bananas", "fv", { note: "ripe, please" }),
  item("3", "Bread", null, { checked: true }),
  item("4", "=cmd|' /C calc'!A0", null, { link: "https://example.com/a?b=1" }),
];

describe("export", () => {
  it("shares as text grouped by aisle, then what's in the trolley", () => {
    const text = listAsText({ list, items, aisles, profiles });
    expect(text.indexOf("FRUIT & VEG")).toBeLessThan(text.indexOf("DAIRY & EGGS"));
    expect(text).toContain("• Milk (×2)");
    expect(text).toContain("• Bananas - ripe, please");
    expect(text).toContain("IN THE TROLLEY\n✓ Bread");
  });
  it("makes a spreadsheet that's safe to open", () => {
    const csv = listAsCsv({ list, items, aisles, profiles });
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe("List,Item,Quantity,Unit,Note,Link,Aisle,Added by,In the trolley,Added on");
    expect(csv).toContain('Groceries,Bananas,,,"ripe, please",,Fruit & Veg,Carl,No,2026-09-24');
    // A note or name that looks like a formula is neutralised.
    expect(csv).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(rows.at(-1)).toContain("Bread");
  });
  it("prints escaped HTML", () => {
    const html = listAsPrintHtml({ list, items: [item("5", "<b>Tea</b>", "d")], aisles, profiles });
    expect(html).toContain("&lt;b&gt;Tea&lt;/b&gt;");
    expect(html).not.toContain("<b>Tea</b>");
  });
});
