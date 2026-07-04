import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const getTargetsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/settings")>();
  return { ...orig, getDistributionTargets: getTargetsMock };
});

import { distributeToTargets, redistributeAll } from "@/lib/distribution";
import { POST as redistributeRoute } from "@/app/api/anki/redistribute/route";
import { NextRequest } from "next/server";

/**
 * Full re-distribution (spec 2026-07-04-full-redistribution, criteria A/B/C).
 * Same URL-keyed fetch mock as distribution.test.ts; "*" = source instance.
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
          json: async () => ({ result: null, error: `Unexpected call: ${u} ${body.action}` }),
        };
      }
      try {
        return {
          ok: true,
          json: async () => ({ result: handler(body.params ?? {}), error: null }),
        };
      } catch (err) {
        return { ok: true, json: async () => ({ result: null, error: String(err) }) };
      }
    })
  );
  return calls;
}

const TARGET = { name: "Gao Yi", url: "http://localhost:8771" };
const targetCalls = (calls: Call[], action?: string) =>
  calls.filter(
    (c) =>
      c.url.startsWith("http://localhost:8771") &&
      (action === undefined || c.action === action)
  );

function makeNote(noteId: number, opts?: { model?: string; withMedia?: boolean }) {
  return {
    noteId,
    modelName: opts?.model ?? "school Chinese spelling",
    tags: [],
    fields: {
      Word: { value: `word${noteId}`, order: 0 },
      Audio: { value: opts?.withMedia ? "[sound:w.mp3]" : "", order: 1 },
      Picture: { value: opts?.withMedia ? '<img src="pic.png">' : "", order: 2 },
      "Note ID": { value: `uuid-${noteId}`, order: 3 },
    },
    cards: [noteId],
  };
}

const sourceModelHandlers = {
  modelFieldNames: () => ["Word", "Audio", "Picture", "Note ID"],
  modelTemplates: () => ({ "Card 1": { Front: "{{Word}}", Back: "{{Word}}" } }),
  modelStyling: () => ({ css: ".card {}" }),
  findModelsByName: () => [{ id: 1, type: 0 }],
};

const readyTargetHandlers = (
  extra: Record<string, (p: Record<string, unknown>) => unknown> = {}
) => ({
  modelNames: () => ["school Chinese spelling", "school spelling"],
  deckNames: () => ["Gao Chinese", "Gao English Spelling"],
  findNotes: () => [],
  addNote: () => 999,
  findCards: () => [],
  sync: () => null,
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getTargetsMock.mockReset();
});
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("copyMediaOnAdd (criteria A)", () => {
  it("A1: copies referenced media from source to target before adding", async () => {
    const calls = mockAnki({
      "*": {
        notesInfo: () => [makeNote(111, { withMedia: true })],
        retrieveMediaFile: (p) => `base64-of-${p.filename}`,
        ...sourceModelHandlers,
      },
      "http://localhost:8771": readyTargetHandlers({
        storeMediaFile: () => null,
      }),
    });

    const results = await distributeToTargets([111], [TARGET], undefined, undefined, {
      copyMediaOnAdd: true,
    });

    expect(results[0].success).toBe(true);
    const fetched = calls
      .filter((c) => c.action === "retrieveMediaFile")
      .map((c) => c.params.filename)
      .sort();
    expect(fetched).toEqual(["pic.png", "w.mp3"]);
    const stored = targetCalls(calls, "storeMediaFile").map((c) => c.params.filename).sort();
    expect(stored).toEqual(["pic.png", "w.mp3"]);
    // stored with the source's data
    expect(targetCalls(calls, "storeMediaFile")[0].params.data).toMatch(/^base64-of-/);
    // media lands before the note
    const actions = targetCalls(calls).map((c) => c.action);
    expect(actions.indexOf("storeMediaFile")).toBeLessThan(actions.indexOf("addNote"));
  });

  it("A2: update path copies no media", async () => {
    const calls = mockAnki({
      "*": {
        notesInfo: () => [makeNote(111, { withMedia: true })],
        ...sourceModelHandlers,
      },
      "http://localhost:8771": readyTargetHandlers({
        findNotes: () => [555],
        updateNoteFields: () => null,
      }),
    });

    const results = await distributeToTargets([111], [TARGET], undefined, undefined, {
      copyMediaOnAdd: true,
    });

    expect(results[0].success).toBe(true);
    expect(calls.some((c) => c.action === "retrieveMediaFile")).toBe(false);
    expect(targetCalls(calls, "storeMediaFile")).toHaveLength(0);
  });

  it("A3: per-file media failure warns but the note is still added", async () => {
    mockAnki({
      "*": {
        notesInfo: () => [makeNote(111, { withMedia: true })],
        retrieveMediaFile: (p) => {
          if (p.filename === "w.mp3") throw new Error("file not found");
          return "base64-pic";
        },
        ...sourceModelHandlers,
      },
      "http://localhost:8771": readyTargetHandlers({
        storeMediaFile: () => null,
      }),
    });

    const results = await distributeToTargets([111], [TARGET], undefined, undefined, {
      copyMediaOnAdd: true,
    });

    expect(results[0]).toEqual({ profile: "Gao Yi", success: true, notesDistributed: 1 });
    expect(console.warn).toHaveBeenCalled();
  });

  it("without the option, add path copies no media (default unchanged)", async () => {
    const calls = mockAnki({
      "*": {
        notesInfo: () => [makeNote(111, { withMedia: true })],
        ...sourceModelHandlers,
      },
      "http://localhost:8771": readyTargetHandlers(),
    });

    await distributeToTargets([111], [TARGET]);
    expect(calls.some((c) => c.action === "retrieveMediaFile")).toBe(false);
  });
});

describe("redistributeAll (criteria B)", () => {
  it("B1+B2: scans both language decks, batches, aggregates per-target totals", async () => {
    const notesInfoCalls: number[][] = [];
    mockAnki({
      "*": {
        findNotes: (p) => {
          const q = String(p.query);
          if (q.includes("Gao English Spelling")) return [1, 2, 3];
          if (q.includes("Gao Chinese")) return [4];
          return [];
        },
        notesInfo: (p) => {
          const ids = p.notes as number[];
          notesInfoCalls.push(ids);
          return ids.map((id) =>
            makeNote(id, { model: id <= 3 ? "school spelling" : "school Chinese spelling" })
          );
        },
        retrieveMediaFile: () => "base64",
        ...sourceModelHandlers,
      },
      "http://localhost:8771": readyTargetHandlers({
        storeMediaFile: () => null,
      }),
    });

    const summary = await redistributeAll([TARGET], undefined, 2);

    expect(summary.notesScanned).toBe(4);
    expect(summary.results).toEqual([
      { profile: "Gao Yi", success: true, notesDistributed: 4 },
    ]);
    // batchSize=2: english [1,2],[3]; chinese [4] → 3 batches
    expect(notesInfoCalls).toEqual([[1, 2], [3], [4]]);
  });

  it("B3: empty decks return zeros without target writes", async () => {
    const calls = mockAnki({
      "*": { findNotes: () => [] },
      "http://localhost:8771": readyTargetHandlers(),
    });

    const summary = await redistributeAll([TARGET]);

    expect(summary).toEqual({
      notesScanned: 0,
      results: [{ profile: "Gao Yi", success: true, notesDistributed: 0 }],
    });
    expect(targetCalls(calls)).toHaveLength(0);
  });
});

describe("POST /api/anki/redistribute (criteria C)", () => {
  it("C1+C2: defaults to all configured targets and returns the summary", async () => {
    getTargetsMock.mockReturnValue([TARGET]);
    mockAnki({
      "*": {
        findNotes: (p) =>
          String(p.query).includes("Gao Chinese") ? [7] : [],
        notesInfo: (p) => (p.notes as number[]).map((id) => makeNote(id)),
        retrieveMediaFile: () => "base64",
        ...sourceModelHandlers,
      },
      "http://localhost:8771": readyTargetHandlers({ storeMediaFile: () => null }),
    });

    const req = new NextRequest("http://localhost/api/anki/redistribute", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await redistributeRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notesScanned).toBe(1);
    expect(data.results).toEqual([
      { profile: "Gao Yi", success: true, notesDistributed: 1 },
    ]);
  });

  it("C1: filters by targetProfiles names", async () => {
    getTargetsMock.mockReturnValue([
      TARGET,
      { name: "Gao Tian", url: "http://localhost:8772" },
    ]);
    mockAnki({
      "*": {
        findNotes: () => [],
      },
      "http://localhost:8771": readyTargetHandlers(),
    });

    const req = new NextRequest("http://localhost/api/anki/redistribute", {
      method: "POST",
      body: JSON.stringify({ targetProfiles: ["Gao Yi"] }),
    });
    const res = await redistributeRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].profile).toBe("Gao Yi");
  });

  it("C3: 400 when no matching targets configured", async () => {
    getTargetsMock.mockReturnValue([]);
    const req = new NextRequest("http://localhost/api/anki/redistribute", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await redistributeRoute(req);
    expect(res.status).toBe(400);
  });
});
