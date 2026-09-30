import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay, timeLabel, verb } from "@/lib/history";
import type { ItemEventRow } from "@/lib/types";

const now = new Date(2026, 8, 30, 10, 0).getTime(); // Tue 30 Sep, 10am local
const event = (name: string, at: Date, kind: ItemEventRow["kind"] = "ticked"): ItemEventRow => ({
  id: name,
  household_id: "h",
  list_id: "l",
  list_item_id: null,
  product_id: null,
  name,
  kind,
  actor: null,
  at: at.toISOString(),
  created_at: at.toISOString(),
  updated_at: at.toISOString(),
});

describe("history", () => {
  it("labels days the way people say them", () => {
    expect(dayLabel(new Date(2026, 8, 30, 7, 0).getTime(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 8, 29, 23, 0).getTime(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 8, 24, 20, 36).getTime(), now)).toBe("Thu 24 Sep");
  });

  it("shows short times", () => {
    expect(timeLabel(new Date(2026, 8, 24, 20, 36).getTime())).toBe("8:36pm");
  });

  it("groups newest first by day", () => {
    const groups = groupByDay(
      [
        event("Milk", new Date(2026, 8, 29, 9, 0)),
        event("Bread", new Date(2026, 8, 30, 9, 0)),
        event("Eggs", new Date(2026, 8, 30, 8, 0), "deleted"),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.events.map((e) => e.name)])).toEqual([
      ["Today", ["Bread", "Eggs"]],
      ["Yesterday", ["Milk"]],
    ]);
  });

  it("describes what happened", () => {
    expect(verb("ticked")).toBe("ticked off");
    expect(verb("readded")).toBe("put back on the list");
  });
});
