import { describe, expect, it } from "vitest";
import { readNeededSoon } from "@/lib/neededSoon";

describe("readNeededSoon", () => {
  it("treats a leading ! as needed soon", () => {
    expect(readNeededSoon("!orange juice")).toEqual({ text: "orange juice", neededSoon: true });
    expect(readNeededSoon("  !! 2 milk ")).toEqual({ text: "2 milk", neededSoon: true });
  });

  it("leaves everything else alone", () => {
    expect(readNeededSoon("orange juice!")).toEqual({ text: "orange juice!", neededSoon: false });
  });
});
