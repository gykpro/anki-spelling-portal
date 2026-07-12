import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getConfigMock = vi.hoisted(() => vi.fn());
const ankiConnectMock = vi.hoisted(() => ({
  storeMediaFile: vi.fn(),
  updateNoteFields: vi.fn(),
}));
vi.mock("@/lib/settings", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/settings")>();
  return { ...original, getConfig: getConfigMock };
});
vi.mock("@/lib/anki-connect", () => ({ ankiConnect: ankiConnectMock }));

import { generateAndSaveImage, generateImage } from "@/lib/enrichment-pipeline";

// Synthetic 1x1 PNG. Tests never contact a paid provider.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function successResponse(base64 = PNG_BASE64) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      data: [{ b64_json: base64 }],
      // Dual-shaped only so invariant/retry tests execute against the RED base.
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: base64, mimeType: "image/png" } }],
          },
        },
      ],
    }),
  };
}

function errorResponse(status: number, retryAfter?: string) {
  return {
    ok: false,
    status,
    headers: new Headers(retryAfter ? { "Retry-After": retryAfter } : {}),
    text: async () => `provider error ${status}`,
    json: async () => ({ error: { message: `provider error ${status}` } }),
  };
}

beforeEach(() => {
  getConfigMock.mockImplementation((key: string) =>
    key === "ANKI_CONNECT_URL" ? "http://source.invalid" : "sk-test-openai"
  );
  ankiConnectMock.storeMediaFile.mockResolvedValue("finalized.png");
  ankiConnectMock.updateNoteFields.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  getConfigMock.mockReset();
  ankiConnectMock.storeMediaFile.mockReset();
  ankiConnectMock.updateNoteFields.mockReset();
});

describe("atomic Anki image finalization", () => {
  it("stores a validated PNG before mutating Picture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));

    const media = await generateAndSaveImage(
      42,
      "cat",
      "The cat sleeps."
    );

    expect(ankiConnectMock.storeMediaFile).toHaveBeenCalledWith(
      "spelling_img_cat_42.png",
      PNG_BASE64
    );
    expect(ankiConnectMock.updateNoteFields).toHaveBeenCalledWith({
      id: 42,
      fields: { Picture: '<img src="finalized.png">' },
    });
    expect(
      ankiConnectMock.storeMediaFile.mock.invocationCallOrder[0]
    ).toBeLessThan(ankiConnectMock.updateNoteFields.mock.invocationCallOrder[0]);
    expect(media).toEqual([
      { filename: "finalized.png", data: PNG_BASE64 },
    ]);
  });

  it("never mutates Picture when media storage fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    ankiConnectMock.storeMediaFile.mockRejectedValue(
      new Error("media store failed")
    );

    await expect(
      generateAndSaveImage(42, "cat", "The cat sleeps.")
    ).rejects.toThrow(/media store failed/i);
    expect(ankiConnectMock.updateNoteFields).not.toHaveBeenCalled();
  });

  it("rejects an empty media-finalization result before mutating Picture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    ankiConnectMock.storeMediaFile.mockResolvedValue("");

    await expect(
      generateAndSaveImage(42, "cat", "The cat sleeps.")
    ).rejects.toThrow(/media|filename|final/i);
    expect(ankiConnectMock.updateNoteFields).not.toHaveBeenCalled();
  });

  it.each([
    " finalized.png",
    "finalized.png ",
    "<finalized>.png",
    'finalized\".png',
  ])("rejects unsafe finalized filename %j before mutating Picture", async (filename) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    ankiConnectMock.storeMediaFile.mockResolvedValue(filename);

    await expect(
      generateAndSaveImage(42, "cat", "The cat sleeps.")
    ).rejects.toThrow(/unsafe|filename|final/i);
    expect(ankiConnectMock.updateNoteFields).not.toHaveBeenCalled();
  });
});

describe("gpt-image-2 generation contract", () => {
  it("uses the exact Image API endpoint, authentication, and output defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    await generateImage("cat", "The cat sleeps on the mat.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer sk-test-openai"
    );
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-image-2",
      prompt: expect.any(String),
      n: 1,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
    });
  });

  it("preserves the literal child-friendly, uncluttered, text-free prompt intent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    await generateImage("cat", "The cat sleeps on the mat.");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    const prompt =
      body.prompt ?? body.contents?.[0]?.parts?.[0]?.text ?? "";
    expect(prompt).toContain('"The cat sleeps on the mat."');
    expect(prompt).toContain('"cat"');
    expect(prompt).toMatch(/simple and uncluttered/i);
    expect(prompt).toMatch(/do not literally put the sentence nor the word/i);
    expect(prompt).toMatch(/no text|do not include any text/i);
    expect(prompt).toMatch(/10-year-old/i);
  });

  it("returns only a validated PNG/base64 result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));

    await expect(generateImage("cat", "The cat sleeps.")).resolves.toEqual({
      base64: PNG_BASE64,
      mimeType: "image/png",
    });
  });

  it("fails before fetch when the OpenAI API key is not configured", async () => {
    getConfigMock.mockReturnValue("");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
      /OpenAI API Key.*not configured/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("bounded image retry policy", () => {
  it("honors Retry-After on 429 before its one retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "2"))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({
      base64: PNG_BASE64,
      mimeType: "image/png",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors an HTTP-date Retry-After value", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T09:00:00.000Z"));
    const retryAt = new Date("2026-07-12T09:00:02.000Z").toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, retryAt))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback delay for an invalid numeric Retry-After value", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "-1"))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback delay for an HTTP-date beyond the timer range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T09:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(429, new Date("2099-07-12T09:00:00.000Z").toUTCString())
      )
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([408, 409, 500, 503])(
    "retries transient HTTP %i exactly once",
    async (status) => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(errorResponse(status))
        .mockResolvedValueOnce(successResponse());
      vi.stubGlobal("fetch", fetchMock);

      const result = generateImage("cat", "The cat sleeps.");
      await vi.runAllTimersAsync();

      await expect(result).resolves.toMatchObject({ mimeType: "image/png" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );

  it("retries a network failure exactly once", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out each stalled request after 120 seconds and retries once", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) throw new Error("missing request timeout signal");
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("request timed out", "AbortError")),
          { once: true }
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    const rejection = result.then(
      () => new Error("expected the stalled request to fail"),
      (error) => error
    );

    await vi.advanceTimersByTimeAsync(119_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/network|timed? out/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the 120-second timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) throw new Error("missing request timeout signal");
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("response body timed out", "AbortError")),
              { once: true }
            );
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    const rejection = result.then(
      () => new Error("expected the stalled response body to fail"),
      (error) => error
    );

    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/network|timed? out/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 422])(
    "does not retry permanent HTTP %i",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(errorResponse(status));
      vi.stubGlobal("fetch", fetchMock);

      await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
        new RegExp(String(status))
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("throws the final named error after two transient failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const result = generateImage("cat", "The cat sleeps.");
    const assertion = expect(result).rejects.toThrow(/503/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("invalid provider output", () => {
  it.each([
    ["empty data", { data: [] }],
    ["missing b64_json", { data: [{}] }],
    ["empty b64_json", { data: [{ b64_json: "" }] }],
  ])("rejects %s immediately without retry", async (_name, payload) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
      /image/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects decoded non-PNG bytes immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successResponse(Buffer.from("not a png").toString("base64")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
      /PNG/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a PNG payload with invalid base64 characters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successResponse(`${PNG_BASE64}!!!`));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
      /base64|PNG/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["surrounding whitespace", ` ${PNG_BASE64}`],
    ["a truncated PNG", Buffer.from(PNG_BASE64, "base64").subarray(0, 33).toString("base64")],
    [
      "a high-bit PNG chunk type",
      (() => {
        const bytes = Buffer.from(PNG_BASE64, "base64");
        bytes[12] |= 0x80;
        return bytes.toString("base64");
      })(),
    ],
    ["nonzero base64 padding bits", `${PNG_BASE64.slice(0, -2)}J=`],
  ])("rejects %s", async (_name, base64) => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse(base64));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
      /base64|PNG/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "a legacy inline-data-only payload",
      { candidates: [{ content: { parts: [{ inlineData: { data: PNG_BASE64 } }] } }] },
    ],
    ["a URL-only payload", { data: [{ url: "https://example.invalid/image.png" }] }],
  ])("rejects %s without using an alternate image path", async (_name, payload) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("cat", "The cat sleeps.")).rejects.toThrow(
      /image/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
