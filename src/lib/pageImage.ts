// Pulls the sharing picture (og:image / twitter:image) out of a product page.
export function pickPageImage(html: string, pageUrl: string): string | null {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const tag = metas.find((t) => (attr(t, "property") ?? attr(t, "name"))?.toLowerCase() === key);
    const content = tag ? attr(tag, "content") : null;
    if (content) {
      try {
        const u = new URL(content.replace(/&amp;/g, "&"), pageUrl);
        if (u.protocol === "https:") return u.toString();
      } catch {
        // ignore a malformed value and try the next
      }
    }
  }
  return null;
}
