import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Image generation retry (spec 2026-07-03, criteria C1–C3).
 *
 * Transient Gemini failures (5xx, network error, empty candidates) must be
 * retried once (2 attempts total, 1s delay) instead of permanently failing
 * the word for that pipeline run.
 *
 * Settings are mocked so the test never depends on a real NANO_BANANA_API_KEY.
 */

vi.mock("@/lib/settings", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/settings")>();
  return {
    ...orig,
    getConfig: (key: string) =>
      key === "NANO_BANANA_API_KEY" ? "test-key" : "",
  };
});

import { generateImage } from "@/lib/enrichment-pipeline";

const GOOD_RESPONSE = {
  ok: true,
  json: async () => ({
    candidates: [
      {
        content: {
          parts: [{ inlineData: { data: "abc123", mimeType: "image/png" } }],
        },
      },
    ],
  }),
};

const ERROR_500 = {
  ok: false,
  status: 500,
  text: async () => "Internal error",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("generateImage retry", () => {
  it("C1: retries once after an HTTP error and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ERROR_500)
      .mockResolvedValueOnce(GOOD_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const promise = generateImage("cat", "The cat sleeps.");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ base64: "abc123", mimeType: "image/png" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("C1: retries when Gemini returns no image parts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) })
      .mockResolvedValueOnce(GOOD_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const promise = generateImage("cat", "The cat sleeps.");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.base64).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("C2: makes exactly one request when the first attempt succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(GOOD_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage("cat", "The cat sleeps.");

    expect(result.base64).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("C3: throws the last error when both attempts fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ERROR_500);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const promise = generateImage("cat", "The cat sleeps.");
    const assertion = expect(promise).rejects.toThrow(/Gemini API error 500/);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
