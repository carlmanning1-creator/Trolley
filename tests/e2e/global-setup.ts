import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// The scanner test plays this video as the camera. Build it once if it isn't there.
export default function globalSetup() {
  if (!existsSync("tests/fixtures/barcode.y4m")) {
    execFileSync("node", ["scripts/make-barcode-video.mjs"], { stdio: "inherit" });
  }
}
