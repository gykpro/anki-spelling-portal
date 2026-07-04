import { describe, it, expect, vi, afterEach } from "vitest";
import { getDistributionTargets } from "@/lib/settings";

/**
 * DISTRIBUTION_TARGETS parser (plan 2026-07-04, Task 1).
 * Format: comma-separated `Name=URL` pairs. The function defaults its
 * argument to getConfig("DISTRIBUTION_TARGETS"); tests inject raw strings.
 */

afterEach(() => vi.restoreAllMocks());

describe("getDistributionTargets", () => {
  it("parses Name=URL pairs and trims whitespace", () => {
    expect(
      getDistributionTargets(
        " Gao Tian = http://localhost:8770 , Gao Yi=http://localhost:8771 "
      )
    ).toEqual([
      { name: "Gao Tian", url: "http://localhost:8770" },
      { name: "Gao Yi", url: "http://localhost:8771" },
    ]);
  });

  it("returns empty list for empty string", () => {
    expect(getDistributionTargets("")).toEqual([]);
  });

  it("skips malformed entries (no '=', empty name or URL) with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      getDistributionTargets("just-a-name, =http://x, Valid=http://ok, Name=")
    ).toEqual([{ name: "Valid", url: "http://ok" }]);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps URLs containing '=' intact (splits on first '=' only)", () => {
    expect(getDistributionTargets("A=http://h:1?x=y")).toEqual([
      { name: "A", url: "http://h:1?x=y" },
    ]);
  });
});
