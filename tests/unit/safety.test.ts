import { describe, expect, it } from "vitest";
import { isPublicIp } from "@/lib/netSafety";
import { commonsFit } from "@/lib/offMatch";
import { pickPageImage } from "@/lib/pageImage";

describe("isPublicIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPublicIp(ip)).toBe(false),
  );
  it.each(["1.1.1.1", "142.250.70.14", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPublicIp(ip)).toBe(true),
  );
  it("rejects things that aren't addresses", () => {
    expect(isPublicIp("localhost")).toBe(false);
    expect(isPublicIp("999.1.1.1")).toBe(false);
  });
});

describe("commonsFit", () => {
  it("prefers plain product shots and rejects people and paintings", () => {
    const plain = commonsFit("cordless drill", "File:Cordless Drill - unbranded.jpg")!;
    const person = commonsFit("cordless drill", "File:A boy with Down syndrome using cordless drill to assemble.jpg");
    expect(plain).not.toBeNull();
    expect(person === null || person < plain).toBe(true);
    expect(commonsFit("bananas", "File:Bananas on black background 02.jpg")).not.toBeNull();
    expect(commonsFit("garden hose", "File:Gartenschlauch (Freiburg) 2962.jpg")).toBeNull();
  });
});

describe("pickPageImage", () => {
  it("finds og:image and makes relative links absolute", () => {
    const html = `<head><meta property="og:image" content="/img/p.jpg?w=800&amp;h=800"></head>`;
    expect(pickPageImage(html, "https://brand.example/product/1")).toBe("https://brand.example/img/p.jpg?w=800&h=800");
  });
  it("falls back to twitter:image, and ignores non-https", () => {
    expect(pickPageImage(`<meta name="twitter:image" content="https://cdn.example/x.png">`, "https://a.example")).toBe(
      "https://cdn.example/x.png",
    );
    expect(pickPageImage(`<meta property="og:image" content="http://insecure.example/x.png">`, "https://a.example")).toBeNull();
    expect(pickPageImage(`<p>no meta</p>`, "https://a.example")).toBeNull();
  });
});
