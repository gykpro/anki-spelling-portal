import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ankiConnect } from "@/lib/anki-connect";

/**
 * Deck placement guard (spec 2026-07-03, criteria A1–A5).
 *
 * AnkiConnect can intermittently drop the requested deck and place new cards
 * in "Default" (dangling notetype `did` + in-memory cache invalidation).
 * After adding, the wrapper must verify card placement and move misplaced
 * cards back to the requested deck.
 *
 * The AnkiConnect HTTP boundary is mocked at global.fetch; each test dispatches
 * on the AnkiConnect `action` name.
 */

type AnkiCall = { action: string; params?: Record<string, unknown> };

function mockAnkiConnect(handlers: Record<string, (params: Record<string, unknown>) => unknown>) {
  const calls: AnkiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as AnkiCall;
      calls.push(body);
      const handler = handlers[body.action];
      if (!handler) throw new Error(`Unexpected AnkiConnect action: ${body.action}`);
      let result: unknown;
      try {
        result = handler(body.params ?? {});
      } catch (err) {
        return {
          ok: true,
          json: async () => ({ result: null, error: err instanceof Error ? err.message : String(err) }),
        };
      }
      return { ok: true, json: async () => ({ result, error: null }) };
    })
  );
  return calls;
}

const NOTE = {
  deckName: "Gao Chinese",
  modelName: "school Chinese spelling",
  fields: { Word: "__test_word" },
  tags: ["telegram"],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("addNote deck placement guard", () => {
  it("A1: moves misplaced cards back to the requested deck", async () => {
    const calls = mockAnkiConnect({
      addNote: () => 12345,
      findCards: () => [111, 222],
      changeDeck: () => null,
    });

    const noteId = await ankiConnect.addNote(NOTE);

    expect(noteId).toBe(12345);
    const findCall = calls.find((c) => c.action === "findCards");
    expect(findCall?.params).toEqual({ query: 'nid:12345 -deck:"Gao Chinese"' });
    const moveCall = calls.find((c) => c.action === "changeDeck");
    expect(moveCall?.params).toEqual({ cards: [111, 222], deck: "Gao Chinese" });
  });

  it("A2: does not call changeDeck when cards landed in the right deck", async () => {
    const calls = mockAnkiConnect({
      addNote: () => 12345,
      findCards: () => [],
      changeDeck: () => null,
    });

    await ankiConnect.addNote(NOTE);

    expect(calls.some((c) => c.action === "changeDeck")).toBe(false);
  });

  it("A5: guard failure is logged but does not fail the add", async () => {
    mockAnkiConnect({
      addNote: () => 12345,
      findCards: () => {
        throw new Error("collection busy");
      },
      changeDeck: () => null,
    });

    await expect(ankiConnect.addNote(NOTE)).resolves.toBe(12345);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("addNotes deck placement guard", () => {
  it("A3: verifies the whole batch with one query and moves misplaced cards", async () => {
    const calls = mockAnkiConnect({
      addNotes: () => [1, null, 3],
      findCards: () => [901],
      changeDeck: () => null,
    });

    const ids = await ankiConnect.addNotes([NOTE, NOTE, NOTE]);

    expect(ids).toEqual([1, null, 3]);
    const findCall = calls.find((c) => c.action === "findCards");
    expect(findCall?.params).toEqual({ query: 'nid:1,3 -deck:"Gao Chinese"' });
    const moveCall = calls.find((c) => c.action === "changeDeck");
    expect(moveCall?.params).toEqual({ cards: [901], deck: "Gao Chinese" });
  });

  it("A4: skips the guard when no notes were created", async () => {
    const calls = mockAnkiConnect({
      addNotes: () => [null, null],
      findCards: () => [],
      changeDeck: () => null,
    });

    await ankiConnect.addNotes([NOTE, NOTE]);

    expect(calls.some((c) => c.action === "findCards")).toBe(false);
    expect(calls.some((c) => c.action === "changeDeck")).toBe(false);
  });
});
