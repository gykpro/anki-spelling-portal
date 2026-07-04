import { describe, it, expect, vi, afterEach } from "vitest";
import { createAnkiClient, ankiConnect } from "@/lib/anki-connect";

/**
 * Client factory (plan 2026-07-04, Task 2).
 * createAnkiClient(url) binds every AnkiConnect request to that URL;
 * the default `ankiConnect` client keeps following ANKI_CONNECT_URL.
 */

type Call = { url: string; action: string; params?: Record<string, unknown> };

function mockFetch(result: unknown = []) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}");
      calls.push({ url: String(url), action: body.action, params: body.params });
      return { ok: true, json: async () => ({ result, error: null }) };
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("createAnkiClient", () => {
  it("binds every request to the given URL", async () => {
    const calls = mockFetch(["Default"]);
    const client = createAnkiClient("http://localhost:8771");
    await client.deckNames();
    expect(calls).toEqual([
      { url: "http://localhost:8771", action: "deckNames", params: undefined },
    ]);
  });

  it("default client follows ANKI_CONNECT_URL config", async () => {
    const calls = mockFetch(6);
    await ankiConnect.version();
    expect(calls[0].url).toMatch(/^http/);
    expect(calls[0].action).toBe("version");
  });

  it("exposes provisioning methods with correct wire format", async () => {
    const calls = mockFetch(null);
    const client = createAnkiClient("http://localhost:8771");
    await client.createModel({
      modelName: "__test_m",
      inOrderFields: ["A", "B"],
      css: ".card{}",
      isCloze: false,
      cardTemplates: [{ Name: "Card 1", Front: "{{A}}", Back: "{{B}}" }],
    });
    await client.modelTemplates("__test_m");
    await client.modelStyling("__test_m");
    await client.findModelsByName(["__test_m"]);

    expect(calls.map((c) => c.action)).toEqual([
      "createModel",
      "modelTemplates",
      "modelStyling",
      "findModelsByName",
    ]);
    expect(calls[0].params).toEqual({
      modelName: "__test_m",
      inOrderFields: ["A", "B"],
      css: ".card{}",
      isCloze: false,
      cardTemplates: [{ Name: "Card 1", Front: "{{A}}", Back: "{{B}}" }],
    });
    expect(calls[1].params).toEqual({ modelName: "__test_m" });
    expect(calls[3].params).toEqual({ modelNames: ["__test_m"] });
    expect(calls.every((c) => c.url === "http://localhost:8771")).toBe(true);
  });

  it("deck placement guard works on non-default clients too", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}");
        calls.push({ url: String(url), action: body.action, params: body.params });
        const results: Record<string, unknown> = {
          addNote: 42,
          findCards: [7],
          changeDeck: null,
        };
        return { ok: true, json: async () => ({ result: results[body.action], error: null }) };
      })
    );

    const client = createAnkiClient("http://localhost:8771");
    await client.addNote({
      deckName: "Gao Chinese",
      modelName: "school Chinese spelling",
      fields: { Word: "__test" },
      tags: [],
    });

    const move = calls.find((c) => c.action === "changeDeck");
    expect(move?.params).toEqual({ cards: [7], deck: "Gao Chinese" });
    expect(move?.url).toBe("http://localhost:8771");
  });
});
