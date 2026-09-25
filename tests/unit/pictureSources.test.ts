import { describe, expect, it } from "vitest";
import { describeSource, offProductPage, sourceUrlOf } from "@/lib/pictureSources";

const base = { image_path: "h/p.webp", image_source_url: null, off_code: null } as const;

describe("picture sources", () => {
  it("says where a picture came from", () => {
    expect(describeSource({ ...base, image_source: "off" })).toBe("From Open Food Facts");
    expect(describeSource({ ...base, image_source: "commons" })).toBe("From Wikimedia Commons");
    expect(describeSource({ ...base, image_source: "web", image_source_url: "https://www.sanitarium.com.au/weet-bix" })).toBe(
      "From sanitarium.com.au",
    );
    expect(describeSource({ ...base, image_source: "web" })).toBe("From a web search");
    expect(describeSource({ ...base, image_source: "photo" })).toBe("A photo someone here took");
    expect(describeSource({ ...base, image_source: "none", image_path: null })).toBeNull();
  });

  it("works out the source page, including for older Open Food Facts pictures", () => {
    expect(sourceUrlOf({ image_source: "web", image_source_url: "https://a.example/p", off_code: null })).toBe(
      "https://a.example/p",
    );
    expect(sourceUrlOf({ image_source: "off", image_source_url: null, off_code: "9300650658615" })).toBe(
      offProductPage("9300650658615"),
    );
    expect(sourceUrlOf({ image_source: "photo", image_source_url: null, off_code: "123" })).toBeNull();
  });
});
