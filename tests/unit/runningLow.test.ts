import { describe, expect, it } from "vitest";
import { describeGap, describeSince, runningLow } from "@/lib/runningLow";
import type { ListItemRow, ProductRow, PurchaseRow } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-30T09:00:00Z");
const LIST = "list-groceries";

function product(id: string, extra: Partial<ProductRow> = {}): ProductRow {
  return {
    id,
    household_id: "h",
    name: id,
    barcode: null,
    aisle_id: null,
    image_path: null,
    image_source: "none",
    off_code: null,
    is_staple: false,
    default_quantity: null,
    default_unit: null,
    times_bought: 0,
    last_bought_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

let n = 0;
// Purchases this many days before NOW.
function bought(productId: string, daysAgo: number[], extra: Partial<PurchaseRow> = {}): PurchaseRow[] {
  return daysAgo.map((d) => {
    const at = new Date(NOW - d * DAY).toISOString();
    return {
      id: `p${n++}`,
      household_id: "h",
      product_id: productId,
      list_item_id: null,
      list_id: LIST,
      session_id: null,
      bought_by: null,
      bought_at: at,
      created_at: at,
      updated_at: at,
      deleted_at: null,
      ...extra,
    };
  });
}

function item(productId: string, checked = false): ListItemRow {
  return {
    id: `i-${productId}`,
    household_id: "h",
    list_id: LIST,
    product_id: productId,
    aisle_id: null,
    name: productId,
    quantity: null,
    unit: null,
    note: null,
    link: null,
    added_by: null,
    checked,
    checked_by: null,
    checked_at: null,
    check_changed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };
}

const run = (products: ProductRow[], purchases: PurchaseRow[], items: ListItemRow[] = []) =>
  runningLow({ products, purchases, items, listId: LIST, now: NOW });

describe("runningLow", () => {
  it("suggests something whose usual gap is nearly up", () => {
    // Milk every 5 days, last bought 5 days ago.
    const out = run([product("milk")], bought("milk", [20, 15, 10, 5]));
    expect(out.map((s) => s.product.id)).toEqual(["milk"]);
    expect(out[0].usualDays).toBeCloseTo(5);
    expect(out[0].sinceDays).toBeCloseTo(5);
  });

  it("stays quiet until it has seen three shops", () => {
    expect(run([product("milk")], bought("milk", [10, 5]))).toEqual([]);
  });

  it("doesn't suggest things bought recently", () => {
    // Toilet paper every 28 days, bought 10 days ago.
    expect(run([product("tp")], bought("tp", [66, 38, 10]))).toEqual([]);
  });

  it("treats a same-day or next-day top-up as the same shop", () => {
    // Fortnightly, with an extra tick the day after one shop: still every 14 days.
    const out = run([product("bread")], bought("bread", [42, 41, 28, 14]));
    expect(out[0].usualDays).toBeCloseTo(14);
  });

  it("ignores taken-back purchases", () => {
    const history = [...bought("eggs", [21, 14]), ...bought("eggs", [7], { deleted_at: "2026-10-23T00:00:00Z" })];
    expect(run([product("eggs")], history)).toEqual([]);
  });

  it("gives up on things they've stopped buying", () => {
    // Every 7 days, but not for 40 days.
    expect(run([product("nappies")], bought("nappies", [54, 47, 40]))).toEqual([]);
  });

  it("respects Don't suggest this", () => {
    expect(run([product("milk", { hide_running_low: true })], bought("milk", [15, 10, 5]))).toEqual([]);
  });

  it("only suggests for the list it was last bought from", () => {
    const history = bought("screws", [60, 30, 1], { list_id: "list-bunnings" });
    expect(run([product("screws")], bought("screws", [90, 60, 30]).concat(history))).toEqual([]);
  });

  it("puts the most overdue first and things already on the list last", () => {
    const products = [product("bread"), product("eggs"), product("milk")];
    const history = [
      ...bought("milk", [17.5, 12.5, 7.5]), // every 5 days, 7.5 days ago: 1.5 times its gap
      ...bought("bread", [30, 20, 10]), // every 10 days, 10 days ago: exactly due
      ...bought("eggs", [30, 20, 15]), // overdue, but already on the list
    ];
    const out = run(products, history, [item("eggs")]);
    expect(out.map((s) => [s.product.id, s.onList])).toEqual([
      ["milk", false],
      ["bread", false],
      ["eggs", true],
    ]);
  });
});

describe("wording", () => {
  it("describes gaps and times in plain words", () => {
    expect(describeGap(1)).toBe("every day or so");
    expect(describeGap(5.2)).toBe("every 5 days");
    expect(describeGap(14)).toBe("every 2 weeks");
    expect(describeGap(8)).toBe("every 8 days");
    const now = new Date(2026, 9, 30, 9, 0).getTime(); // 9am local time
    expect(describeSince(new Date(2026, 9, 30, 7, 0).getTime(), now)).toBe("today");
    expect(describeSince(new Date(2026, 9, 29, 21, 0).getTime(), now)).toBe("yesterday");
    expect(describeSince(new Date(2026, 9, 24, 18, 0).getTime(), now)).toBe("6 days ago");
    expect(describeSince(new Date(2026, 9, 9, 10, 0).getTime(), now)).toBe("3 weeks ago");
  });
});
