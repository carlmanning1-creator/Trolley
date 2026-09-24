import sharp from "sharp";

// A Woolworths-style receipt as a slightly rotated grey-paper photo, with the heavy
// abbreviations real receipts use.
const LINES = [
  "        WOOLWORTHS",
  "   Metro Surry Hills NSW",
  "      ABN 88 000 014 675",
  "",
  "WW F/C MLK 2L              3.10",
  "BNNA CAVENDISH",
  "  0.845 kg @ $3.90/kg      3.30",
  "WW BREAD WHT SNDWCH 650G   2.80",
  "ARN TIM TAM ORIG 200G      3.65",
  "MORTEIN FLY SPRAY 300G     6.50",
  "",
  "SUBTOTAL                  19.35",
  "TOTAL                     19.35",
  "EFTPOS                    19.35",
  "",
  "  24/09/2026  17:42  ST1234",
  " Everyday Rewards pts: 19",
];

export async function receiptPhoto(): Promise<Buffer> {
  const lineH = 34;
  const width = 620;
  const height = 80 + LINES.length * lineH;
  const text = LINES.map(
    (l, i) =>
      `<text xml:space="preserve" x="30" y="${60 + i * lineH}" font-family="DejaVu Sans Mono, monospace" font-size="24" fill="#222">${l
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</text>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f4f1ea"/>${text}</svg>`;
  return sharp(Buffer.from(svg))
    .rotate(-2, { background: "#6b7280" })
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#6b7280" })
    .jpeg({ quality: 88 })
    .toBuffer();
}
