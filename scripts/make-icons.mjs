#!/usr/bin/env node
// Renders the app icons from one SVG. Run after changing the design: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// A trolley on a green tile. `pad` shrinks the artwork for maskable icons, which get cropped to a circle.
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#15803d"/>
  <g transform="translate(${256 - 256 * (1 - pad)} ${256 - 256 * (1 - pad)}) scale(${1 - pad})">
    <path d="M96 132h52l40 196h196l36-140H172" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="214" cy="392" r="30" fill="#fff"/>
    <circle cx="362" cy="392" r="30" fill="#fff"/>
  </g>
</svg>`;

await writeFile("public/icons/icon.svg", svg(0));
const jobs = [
  ["public/icons/icon-192.png", 192, 0],
  ["public/icons/icon-512.png", 512, 0],
  ["public/icons/maskable-512.png", 512, 0.2],
  ["public/icons/apple-touch-icon.png", 180, 0.1],
  ["src/app/icon.png", 64, 0],
];
for (const [file, size, pad] of jobs) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(file);
}
console.log("Icons written.");
