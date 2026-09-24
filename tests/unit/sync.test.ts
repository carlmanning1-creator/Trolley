import { describe, expect, it } from "vitest";
import { isRejection } from "@/lib/sync";

describe("isRejection", () => {
  it("treats only definite server refusals as final", () => {
    expect(isRejection({ status: 400 })).toBe(true);
    expect(isRejection({ status: 403 })).toBe(true);
    expect(isRejection({ status: 409 })).toBe(true);
  });
  it("retries anything that could be bad signal or a passing problem", () => {
    expect(isRejection(null)).toBe(false);
    expect(isRejection({})).toBe(false);
    expect(isRejection({ status: 0 })).toBe(false);
    expect(isRejection({ status: 401 })).toBe(false);
    expect(isRejection({ status: 408 })).toBe(false);
    expect(isRejection({ status: 429 })).toBe(false);
    expect(isRejection({ status: 500 })).toBe(false);
    expect(isRejection({ status: 503 })).toBe(false);
  });
});
