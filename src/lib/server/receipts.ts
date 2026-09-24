import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic } from "@/lib/server/anthropic";
import { serverEnv } from "@/lib/server/env";

// What we ask Claude to return for a receipt photo. Matches point at short labels
// ("L3" for list item 3, "P12" for catalogue product 12) that the server maps back to real rows.
export const ReceiptSchema = z.object({
  is_receipt: z.boolean(),
  store_name: z.string().nullable(),
  purchased_on: z.string().nullable().describe("Purchase date as YYYY-MM-DD, or null if not printed"),
  total: z.number().nullable(),
  lines: z.array(
    z.object({
      description: z.string().describe("The line exactly as printed"),
      quantity: z.number().nullable(),
      unit_price: z.number().nullable(),
      line_total: z.number().nullable(),
      list_item: z.string().nullable().describe("Label like L3 of the unticked list item this line buys, or null"),
      product: z.string().nullable().describe("Label like P12 of the catalogue product this line is, or null"),
    }),
  ),
});
export type ReceiptReading = z.infer<typeof ReceiptSchema>;

const SYSTEM = `You read photographed Australian supermarket receipts (Woolworths, Coles, Aldi, IGA and others) for a family shopping list app.

Transcribe every purchased line item. Skip subtotals, totals, payment, change, card numbers, loyalty points, GST summaries and savings/discount lines (fold a discount into the line it applies to if it's clearly attached). For weighed items, quantity is the weight in kg and unit_price is the price per kg. For multi-buys like "2 @ $3.50", quantity is 2 and unit_price 3.50. All money is in dollars as plain numbers.

Receipts abbreviate heavily: "WW F/C MLK 2L" is Woolworths full cream milk 2 litres, "BNNA CAVENDISH" is bananas, "TP 12PK" is toilet paper. For each line, if it plainly buys one of the family's unticked list items, give that item's label (L-number). If it is one of their catalogue products, give that product's label (P-number). Only match when you are confident; otherwise use null. Each list item can be matched by at most one line.

If the photo isn't a shopping receipt, set is_receipt to false and return no lines.`;

export async function readReceipt(opts: {
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
  listItems: { label: string; name: string; quantity: string }[];
  products: { label: string; name: string }[];
}): Promise<ReceiptReading> {
  const context =
    `The family's unticked list items:\n${opts.listItems.map((i) => `${i.label}: ${i.name}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n") || "(none)"}\n\n` +
    `Their catalogue products:\n${opts.products.map((p) => `${p.label}: ${p.name}`).join("\n") || "(none)"}`;

  let lastError: unknown = null;
  // One retry on a parse failure, as the brief asks.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropic().messages.parse({
        model: serverEnv.receiptModel(),
        max_tokens: 8000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: opts.image.mediaType, data: opts.image.data } },
              { type: "text", text: `${context}\n\nRead this receipt.` },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(ReceiptSchema) },
      });
      if (response.stop_reason === "refusal") throw new Error("The receipt reader declined this image.");
      if (!response.parsed_output) throw new Error("Receipt reading came back in an unexpected shape.");
      return response.parsed_output;
    } catch (err) {
      lastError = err;
      // Only a bad or unparseable answer is worth retrying; a missing key or bad request isn't.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Couldn't read the receipt.");
}
