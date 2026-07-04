import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { distributeToTargets } from "@/lib/distribution";

/**
 * Shared per-instance distribution flow (plan 2026-07-04, Task 3).
 * global.fetch is mocked with a dispatcher keyed by URL prefix + action.
 * The "*" key handles the source instance (any URL not matching a target),
 * so tests don't depend on the local ANKI_CONNECT_URL value.
 */

type Call = { url: string; action: string; params: Record<string, unknown> };
type Handlers = Record<string, Record<string, (p: Record<string, unknown>) => unknown>>;

function mockAnki(handlers: Handlers) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const u = String(url);
      const body = JSON.parse(init?.body ?? "{}");
      calls.push({ url: u, action: body.action, params: body.params });
      const host =
        Object.keys(handlers).find((h) => h !== "*" && u.startsWith(h)) ?? "*";
      const handler = handlers[host]?.[body.action];
      if (!handler) {
        return {
          ok: true,
          json: async () => ({
            result: null,
            error: `Unexpected call: ${u} ${body.action}`,
          }),
        };
      }
      try {
        return {
          ok: true,
          json: async () => ({ result: handler(body.params ?? {}), error: null }),
        };
      } catch (err) {
        return {
          ok: true,
          json: async () => ({ result: null, error: String(err) }),
        };
      }
    })
  );
  return calls;
}

const SOURCE_NOTE = {
  noteId: 111,
  modelName: "school Chinese spelling",
  tags: ["telegram"],
  fields: {
    Word: { value: "元旦", order: 0 },
    "Note ID": { value: "uuid-abc", order: 1 },
  },
  cards: [1, 2],
};

const sourceHandlers = (
  extra: Record<string, (p: Record<string, unknown>) => unknown> = {}
) => ({
  notesInfo: () => [SOURCE_NOTE],
  modelFieldNames: () => ["Word", "Note ID"],
  modelTemplates: () => ({ "Card 1": { Front: "{{Word}}", Back: "{{Word}}" } }),
  modelStyling: () => ({ css: ".card {}" }),
  findModelsByName: () => [{ id: 1, type: 0 }],
  ...extra,
});

const TARGET = { name: "Gao Yi", url: "http://localhost:8771" };
const targetCalls = (calls: Call[], action?: string) =>
  calls.filter(
    (c) =>
      c.url.startsWith("http://localhost:8771") &&
      (action === undefined || c.action === action)
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("distributeToTargets", () => {
  it("provisions missing notetype and deck on the target, then adds the note", async () => {
    const calls = mockAnki({
      "*": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["Basic"], // notetype missing → provision
        createModel: () => null,
        deckNames: () => ["Default"], // deck missing → create
        createDeck: () => 1,
        findNotes: () => [], // no existing note → add
        addNote: () => 999,
        findCards: () => [], // deck guard: nothing misplaced
        sync: () => null,
      },
    });

    const results = await distributeToTargets([111], [TARGET]);

    expect(results).toEqual([
      { profile: "Gao Yi", success: true, notesDistributed: 1 },
    ]);
    expect(targetCalls(calls, "createModel")).toHaveLength(1);
    expect(targetCalls(calls, "createDeck")).toHaveLength(1);
    expect(targetCalls(calls, "addNote")).toHaveLength(1);
    expect(targetCalls(calls, "sync")).toHaveLength(1);

    // createModel carries the source's full definition
    const created = targetCalls(calls, "createModel")[0].params;
    expect(created).toMatchObject({
      modelName: "school Chinese spelling",
      inOrderFields: ["Word", "Note ID"],
      css: ".card {}",
      isCloze: false,
      cardTemplates: [{ Name: "Card 1", Front: "{{Word}}", Back: "{{Word}}" }],
    });
  });

  it("does not provision when notetype and deck exist; updates existing note by UUID", async () => {
    const calls = mockAnki({
      "*": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [555],
        updateNoteFields: () => null,
        sync: () => null,
      },
    });

    const results = await distributeToTargets([111], [TARGET]);

    expect(results[0]).toEqual({
      profile: "Gao Yi",
      success: true,
      notesDistributed: 1,
    });
    const actions = targetCalls(calls).map((c) => c.action);
    expect(actions).not.toContain("createModel");
    expect(actions).not.toContain("createDeck");
    expect(actions).not.toContain("addNote");
    expect(actions).toContain("updateNoteFields");
  });

  it("stores media files on the target before writing notes", async () => {
    const calls = mockAnki({
      "*": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        storeMediaFile: () => null,
        findNotes: () => [],
        addNote: () => 999,
        findCards: () => [],
        sync: () => null,
      },
    });

    const media = new Map([["w.mp3", "base64data"]]);
    await distributeToTargets([111], [TARGET], media);

    const actions = targetCalls(calls).map((c) => c.action);
    expect(actions.indexOf("storeMediaFile")).toBeGreaterThan(-1);
    expect(actions.indexOf("storeMediaFile")).toBeLessThan(
      actions.indexOf("addNote")
    );
  });

  it("isolates per-target failures: second target still distributed", async () => {
    const bad = { name: "Broken", url: "http://localhost:9999" };
    const calls = mockAnki({
      "*": sourceHandlers(),
      "http://localhost:9999": {
        // modelNames missing → dispatcher returns AnkiConnect error → throw
      },
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [],
        addNote: () => 999,
        findCards: () => [],
        sync: () => null,
      },
    });

    const results = await distributeToTargets([111], [bad, TARGET]);

    expect(results[0].success).toBe(false);
    expect(results[0].profile).toBe("Broken");
    expect(results[1]).toEqual({
      profile: "Gao Yi",
      success: true,
      notesDistributed: 1,
    });
    expect(targetCalls(calls, "addNote")).toHaveLength(1);
  });

  it("sync failure on target is best-effort: result still success", async () => {
    mockAnki({
      "*": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [],
        addNote: () => 999,
        findCards: () => [],
        sync: () => {
          throw new Error("auth not configured");
        },
      },
    });

    const results = await distributeToTargets([111], [TARGET]);
    expect(results[0].success).toBe(true);
    expect(results[0].notesDistributed).toBe(1);
  });

  it("reports progress per target", async () => {
    mockAnki({
      "*": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [],
        addNote: () => 999,
        findCards: () => [],
        sync: () => null,
      },
    });

    const updates: string[] = [];
    await distributeToTargets([111], [TARGET], undefined, {
      update: async (msg) => {
        updates.push(msg);
      },
    });
    expect(updates).toEqual(["Distributing to Gao Yi..."]);
  });

  it("returns [] for empty noteIds or targets without any network call", async () => {
    const calls = mockAnki({});
    expect(await distributeToTargets([], [TARGET])).toEqual([]);
    expect(await distributeToTargets([111], [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
