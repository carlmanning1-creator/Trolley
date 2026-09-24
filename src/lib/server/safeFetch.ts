import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicIp } from "@/lib/netSafety";

// Fetches a web address that came from outside (a search result), carefully:
// https only, public addresses only (checked again after every redirect), a time limit,
// and a size limit. Returns the body and its content type.

export class UnsafeUrl extends Error {}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "https:") throw new UnsafeUrl("Only https links are fetched");
  if (url.username || url.password) throw new UnsafeUrl("Links with passwords aren't fetched");
  if (url.port && url.port !== "443") throw new UnsafeUrl("Unusual ports aren't fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrl("Private address");
    return;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new UnsafeUrl("Private host");
  }
  // Machines that reach the internet through a proxy can't resolve names themselves; the
  // proxy enforces its own rules there. Everywhere else, check every address the name has.
  if (process.env.HTTPS_PROXY || process.env.https_proxy) return;
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0 || addrs.some((a) => !isPublicIp(a.address))) throw new UnsafeUrl("Private address");
}

export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; timeoutMs?: number; accept?: string; userAgent: string },
): Promise<{ body: Buffer; type: string; url: string }> {
  let url = new URL(raw);
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 12_000);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "User-Agent": opts.userAgent, Accept: opts.accept ?? "*/*" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new Error("Redirect without a location");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Fetch failed (${res.status})`);
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > opts.maxBytes) {
      await res.body?.cancel();
      throw new Error("Too large");
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > opts.maxBytes) {
          await reader.cancel();
          throw new Error("Too large");
        }
        chunks.push(value);
      }
    }
    return {
      body: Buffer.concat(chunks),
      type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(),
      url: url.toString(),
    };
  }
  throw new Error("Too many redirects");
}
