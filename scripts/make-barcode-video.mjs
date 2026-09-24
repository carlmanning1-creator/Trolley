#!/usr/bin/env node
// Builds tests/fixtures/barcode.y4m: a short fake-camera video showing one EAN-13 barcode,
// used by the scanner browser test (Chromium plays it as the camera).
// Usage: node scripts/make-barcode-video.mjs [barcode]
import bwipjs from "bwip-js/node";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const code = process.argv[2] ?? "9300650658615";
const W = 640;
const H = 480;
const png = await bwipjs.toBuffer({ bcid: "ean13", text: code, scale: 4, height: 22, includetext: true, backgroundcolor: "FFFFFF" });
const barcode = await sharp(png).flatten({ background: "#ffffff" }).resize({ width: 420 }).png().toBuffer();
const composed = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
  .composite([{ input: barcode, gravity: "center" }])
  .png()
  .toBuffer();
const { data, info } = await sharp(composed).removeAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 3 || info.width !== W || info.height !== H) throw new Error("unexpected image layout");

// RGB -> YUV 4:2:0 planes
const Y = Buffer.alloc(W * H);
const U = Buffer.alloc((W / 2) * (H / 2));
const V = Buffer.alloc((W / 2) * (H / 2));
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    Y[y * W + x] = Math.max(0, Math.min(255, Math.round(0.257 * r + 0.504 * g + 0.098 * b + 16)));
    if (y % 2 === 0 && x % 2 === 0) {
      const j = (y / 2) * (W / 2) + x / 2;
      U[j] = Math.max(0, Math.min(255, Math.round(-0.148 * r - 0.291 * g + 0.439 * b + 128)));
      V[j] = Math.max(0, Math.min(255, Math.round(0.439 * r - 0.368 * g - 0.071 * b + 128)));
    }
  }
}
const frames = 10;
const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
for (let f = 0; f < frames; f++) parts.push(Buffer.from("FRAME\n"), Y, U, V);
await writeFile("tests/fixtures/barcode.y4m", Buffer.concat(parts));
await sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toFile("tests/fixtures/barcode.png");
console.log(`Wrote tests/fixtures/barcode.y4m for ${code}`);
