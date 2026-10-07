import { describe, expect, it } from "vitest";
import { rankRearCameras, unnamedLens } from "@/lib/camera";

const cam = (label: string, deviceId = label) => ({ kind: "videoinput", label, deviceId, groupId: "", toJSON: () => ({}) }) as MediaDeviceInfo;

describe("rankRearCameras", () => {
  it("puts the main rear lens first and leaves out the front camera", () => {
    const ranked = rankRearCameras([
      cam("Back Ultra Wide Camera"),
      cam("Front Camera"),
      cam("Back Telephoto Camera"),
      cam("Back Camera"),
    ]);
    expect(ranked.map((c) => c.label)).toEqual(["Back Camera", "Back Telephoto Camera", "Back Ultra Wide Camera"]);
  });

  it("keeps Android's own order when the names don't say which lens is which", () => {
    const ranked = rankRearCameras([cam("camera2 0, facing back"), cam("camera2 1, facing front"), cam("camera2 2, facing back")]);
    expect(ranked.map((c) => c.label)).toEqual(["camera2 0, facing back", "camera2 2, facing back"]);
  });

  it("puts Android's main rear lens (the lowest number) first, whatever order the phone lists them in", () => {
    const ranked = rankRearCameras([cam("camera2 3, facing back"), cam("camera2 2, facing back"), cam("camera2 0, facing back")]);
    expect(ranked.map((c) => c.label)).toEqual(["camera2 0, facing back", "camera2 2, facing back", "camera2 3, facing back"]);
  });
});

describe("unnamedLens", () => {
  it("spots Android's numbered lens names", () => {
    expect(unnamedLens("camera2 2, facing back")).toBe(true);
    expect(unnamedLens("Back Ultra Wide Camera")).toBe(false);
  });
});
