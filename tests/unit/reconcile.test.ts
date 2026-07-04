import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const getTargetsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/settings")>();
  return { ...orig, getDistributionTargets: getTargetsMock };
});

import { compareLibraries } from "@/lib/reconcile";
import { GET as reconcileRoute } from "@/app/api/anki/reconcile/route";
import { NextRequest } from "next/server";

/**
 * Reconciliation report (spec 2026-07-04-reconciliation-report, criteria A/B).
 * Read-only diff of each target vs the source, keyed by "Note ID" UUID.
 */

describe("compareLibraries (criteria A)", () => {
  it("A1: reports missing, extra, word mismatches, and duplicate UUIDs", () => {
    const source = [
      { uuid: "u1", word: "apple" },
      { uuid: "u2", word: "banana" },
      { uuid: "u3", word: "cherry" },
      { uuid: "u4", word: "dup" },
      { uuid: "u4", word: "dup" }, // duplicate on source
    ];
    const target = [
      { uuid: "u1", word: "apple" },
      { uuid: "u2", word: "BANANA-EDITED" }, // word mismatch
      { uuid: "u9", word: "orphan" }, // extra on target
      { uuid: "u5", word: "tdup" },
      { uuid: "u5", word: "tdup" }, // duplicate on target
    ];

    const diff = compareLibraries(source, target);

    expect(diff.missingOnTarget.map((n) => n.uuid).sort()).toEqual(["u3", "u4"]);
    expect(diff.extraOnTarget.map((n) => n.uuid).sort()).toEqual(["u5", "u9"]);
    expect(diff.wordMismatches).toEqual([
      { uuid: "u2", sourceWord: "banana", targetWord: "BANANA-EDITED" },
    ]);
    expect(diff.duplicateUuidsOnSource).toEqual([{ uuid: "u4", count: 2, word: "dup" }]);
    expect(diff.duplicateUuidsOnTarget).toEqual([{ uuid: "u5", count: 2, word: "tdup" }]);
  });

  it("A1: identical libraries produce an empty diff", () => {
    const notes = [
      { uuid: "u1", word: "apple" },
      { uuid: "u2", word: "banana" },
    ];
    const diff = compareLibraries(notes, [...notes]);
    expect(diff.missingOnTarget).toEqual([]);
    expect(diff.extraOnTarget).toEqual([]);
    expect(diff.wordMismatches).toEqual([]);
    expect(diff.duplicateUuidsOnSource).toEqual([]);
    expect(diff.duplicateUuidsOnTarget).toEqual([]);
  });

  it("A2: notes with empty UUID are ignored", () => {
    const diff = compareLibraries(
      [{ uuid: "", word: "no-uuid" }, { uuid: "u1", word: "a" }],
      [{ uuid: "u1", word: "a" }]
    );
    expect(diff.missingOnTarget).toEqual([]);
    expect(diff.duplicateUuidsOnSource).toEqual([]);
  });
});

// ─── Route (criteria B) ───

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
          json: async () => ({ result: null, error: `Unexpected call: ${u} ${body.action}` }),
        };
      }
      return {
        ok: true,
        json: async () => ({ result: handler(body.params ?? {}), error: null }),
      };
    })
  );
  return calls;
}

function noteInfo(id: number, uuid: string, word: string) {
  return {
    noteId: id,
    modelName: "school Chinese spelling",
    tags: [],
    fields: {
      Word: { value: word, order: 0 },
      "Note ID": { value: uuid, order: 1 },
    },
    cards: [id],
  };
}

const TARGET = { name: "Gao Yi", url: "http://localhost:8771" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getTargetsMock.mockReset();
});
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/anki/reconcile (criteria B)", () => {
  it("B1+B2: per-target per-deck diff, read-only", async () => {
    getTargetsMock.mockReturnValue([TARGET]);
    const calls = mockAnki({
      "*": {
        // source: English deck empty, Chinese deck has u1,u2
        findNotes: (p) =>
          String(p.query).includes("Gao Chinese") ? [1, 2] : [],
        notesInfo: (p) =>
          (p.notes as number[]).map((id) =>
            noteInfo(id, `u${id}`, `word${id}`)
          ),
      },
      "http://localhost:8771": {
        // target: Chinese deck has u1 only
        findNotes: (p) =>
          String(p.query).includes("Gao Chinese") ? [11] : [],
        notesInfo: (p) =>
          (p.notes as number[]).map((id) => noteInfo(id, "u1", "word1")),
      },
    });

    const req = new NextRequest("http://localhost/api/anki/reconcile");
    const res = await reconcileRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.targets).toHaveLength(1);
    expect(data.targets[0].profile).toBe("Gao Yi");
    const chinese = data.targets[0].decks.find(
      (d: { deck: string }) => d.deck === "Gao Chinese"
    );
    expect(chinese.sourceCount).toBe(2);
    expect(chinese.targetCount).toBe(1);
    expect(chinese.missingOnTarget).toEqual([{ uuid: "u2", word: "word2" }]);
    expect(chinese.extraOnTarget).toEqual([]);

    // read-only: no write actions issued anywhere
    const writeActions = ["addNote", "updateNoteFields", "deleteNotes", "createDeck", "createModel", "changeDeck", "storeMediaFile", "sync"];
    expect(calls.filter((c) => writeActions.includes(c.action))).toEqual([]);
  });

  it("B1: ?target= filters to one configured target", async () => {
    getTargetsMock.mockReturnValue([
      TARGET,
      { name: "Gao Tian", url: "http://localhost:8772" },
    ]);
    mockAnki({
      "*": { findNotes: () => [], notesInfo: () => [] },
      "http://localhost:8771": { findNotes: () => [], notesInfo: () => [] },
    });

    const req = new NextRequest(
      "http://localhost/api/anki/reconcile?target=Gao%20Yi"
    );
    const res = await reconcileRoute(req);
    const data = await res.json();

    expect(data.targets).toHaveLength(1);
    expect(data.targets[0].profile).toBe("Gao Yi");
  });

  it("B3: 400 when no matching targets", async () => {
    getTargetsMock.mockReturnValue([]);
    const req = new NextRequest("http://localhost/api/anki/reconcile");
    const res = await reconcileRoute(req);
    expect(res.status).toBe(400);
  });
});
