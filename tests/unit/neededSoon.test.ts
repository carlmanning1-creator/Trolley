import { describe, expect, it } from "vitest";
import { readNeededSoon } from "@/lib/neededSoon";
import { describeTold } from "@/lib/toldMessage";

describe("readNeededSoon", () => {
  it("treats a leading ! as needed soon", () => {
    expect(readNeededSoon("!orange juice")).toEqual({ text: "orange juice", neededSoon: true });
    expect(readNeededSoon("  !! 2 milk ")).toEqual({ text: "2 milk", neededSoon: true });
  });

  it("leaves everything else alone", () => {
    expect(readNeededSoon("orange juice!")).toEqual({ text: "orange juice!", neededSoon: false });
  });
});

describe("describeTold", () => {
  it("says who got it", () => {
    expect(describeTold({ told: ["Bec", "Grace"], notTold: [] })).toBe("Sent to Bec and Grace.");
  });
  it("says who didn't, and where to fix it", () => {
    expect(describeTold({ told: ["Grace"], notTold: ["Bec"] })).toBe(
      "Sent to Grace. Bec doesn't have notifications on yet (Settings, Notifications).",
    );
    expect(describeTold({ told: [], notTold: ["Bec", "Grace"] })).toBe(
      "Nobody was told. Bec and Grace don't have notifications on yet (Settings, Notifications).",
    );
  });
});
