import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock("fs", () => fsMocks);

const retiredKey = ["NANO", "BANANA", "API", "KEY"].join("_");

beforeEach(() => {
  vi.resetModules();
  fsMocks.readFileSync.mockReset();
  fsMocks.writeFileSync.mockReset();
  fsMocks.mkdirSync.mockReset();
  fsMocks.existsSync.mockReset();
  fsMocks.chmodSync.mockReset();
  fsMocks.existsSync.mockReturnValue(true);
  fsMocks.readFileSync.mockReturnValue(
    JSON.stringify({
      OPENAI_API_KEY: "sk-project-abcdefghijklmnop",
      [retiredKey]: "retired-secret",
    })
  );
});

describe("OpenAI image configuration", () => {
  it("registers a file-only masked secret and removes the retired provider", async () => {
    const settings = await import("@/lib/settings");
    const status = settings.getAllConfigStatus() as Record<
      string,
      {
        configured: boolean;
        source: string;
        maskedValue: string | null;
        secret: boolean;
      }
    >;

    expect(status.OPENAI_API_KEY).toMatchObject({
      configured: true,
      source: "file",
      secret: true,
      maskedValue: "sk-p...mnop",
    });
    expect(status[retiredKey]).toBeUndefined();

    settings.saveSettings({ AZURE_TTS_REGION: "eastus" });
    const persisted = JSON.parse(
      String(fsMocks.writeFileSync.mock.calls.at(-1)?.[1])
    );
    expect(persisted.OPENAI_API_KEY).toBe("sk-project-abcdefghijklmnop");
    expect(persisted[retiredKey]).toBeUndefined();
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { encoding: "utf-8", mode: 0o600 }
    );
  });

  it("rejects an unknown or retired key through the runtime Settings API", async () => {
    const { POST } = await import("@/app/api/settings/route");
    const request = new NextRequest("http://localhost/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { [retiredKey]: "do-not-store" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("does not fall back to an OPENAI_API_KEY environment variable", async () => {
    fsMocks.readFileSync.mockReturnValue("{}");
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "must-not-be-read";

    try {
      const settings = await import("@/lib/settings");
      const getConfig = settings.getConfig as (key: string) => string;
      const status = settings.getAllConfigStatus() as Record<
        string,
        { configured: boolean; source: string }
      >;

      expect(getConfig("OPENAI_API_KEY")).toBe("");
      expect(status.OPENAI_API_KEY).toMatchObject({
        configured: false,
        source: "none",
      });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });
});
