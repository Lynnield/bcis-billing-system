import { describe, it, expect } from "vitest";
import { formatPeso } from "@/lib/utils";

describe("formatPeso (display only, string-based — never parses to a float)", () => {
  it("groups thousands and keeps exactly two decimals", () => {
    expect(formatPeso("41047.50")).toBe("₱41,047.50");
    expect(formatPeso("1234567.8")).toBe("₱1,234,567.80");
    expect(formatPeso("999")).toBe("₱999.00");
    expect(formatPeso("0.00")).toBe("₱0.00");
  });
  it("keeps large values exact and shows negatives and blanks safely", () => {
    expect(formatPeso("90071992547409.99")).toBe("₱90,071,992,547,409.99");
    expect(formatPeso("-100.00")).toBe("−₱100.00");
    expect(formatPeso(null)).toBe("—");
  });
});
