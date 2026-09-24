import "server-only";
import { z } from "zod";
import { admin } from "@/lib/server/auth";
import { anthropic } from "@/lib/server/anthropic";
import { serverEnv } from "@/lib/server/env";
import { pickPageImage } from "@/lib/pageImage";
import { safeFetch } from "@/lib/server/safeFetch";

// Last resort for pictures: Claude searches the web for the product's own page, and we take
// the picture that page advertises for sharing (its og:image). Capped each month, because
// each search costs about a cent.

export const MONTHLY_WEB_LOOKUPS = 150;

export async function underMonthlyCap(householdId: string): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await admin().rpc("bump_usage", {
    p_household: householdId,
    p_month: month,
    p_kind: "web_picture",
  });
  if (error) {
    console.error("usage counter failed", error);
    return false;
  }
  return (data as number) <= MONTHLY_WEB_LOOKUPS;
}

const Pages = z.object({ pages: z.array(z.string()).max(5) });

const SYSTEM = `You help a family shopping-list app find a product photo.
Search the web for the item and reply with ONLY a JSON object {"pages": ["https://...", ...]} listing up to 3 web pages, each one dedicated to exactly that product (a single product's page, not a shop's home page, category page, article or search results).
Prefer the manufacturer's or brand's own product page, then Wikipedia. Never list coles.com.au or woolworths.com.au.
If the item is personal, one-off or too vague to have its own product page (for example "birthday card for Nan", "stuff for school", "present for Mum"), don't search; reply {"pages": []}. Also reply {"pages": []} if nothing fits.`;

export async function findProductPages(name: string, context: string | null): Promise<string[]> {
  const response = await anthropic().messages.create({
    model: serverEnv.categoryModel(),
    max_tokens: 1024,
    system: SYSTEM,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 1,
        blocked_domains: ["coles.com.au", "woolworths.com.au"],
        user_location: { type: "approximate", country: "AU", timezone: "Australia/Sydney" },
      },
    ],
    messages: [{ role: "user", content: `Item: ${name}${context ? `\nContext: ${context}` : ""}` }],
  });
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  try {
    return Pages.parse(JSON.parse(json)).pages.filter((u) => /^https:\/\//.test(u));
  } catch {
    return [];
  }
}

export async function webPictureCandidates(name: string, context: string | null): Promise<string[]> {
  const pages = await findProductPages(name, context);
  const images: string[] = [];
  for (const page of pages) {
    try {
      const { body, type, url } = await safeFetch(page, {
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 8000,
        accept: "text/html",
        userAgent: serverEnv.offUserAgent(),
      });
      if (!type.includes("html")) continue;
      const img = pickPageImage(body.toString("utf8"), url);
      if (img) images.push(img);
    } catch {
      // try the next page
    }
    if (images.length >= 2) break;
  }
  return images;
}
