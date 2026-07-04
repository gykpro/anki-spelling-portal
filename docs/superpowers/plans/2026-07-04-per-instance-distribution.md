# Per-Instance Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace profile-switching distribution with direct connections to dedicated per-profile Anki instances, auto-provisioning deck/notetype on receivers, and remove the profile-switching machinery and delete propagation.

**Architecture:** `createAnkiClient(url)` factory gives each Anki instance its own client with the same API as today's `ankiConnect` (which stays as the default client bound to `ANKI_CONNECT_URL`, the source). A new `src/lib/distribution.ts` module owns the shared distribution flow (provision → media → upsert → sync) used by both the Telegram pipeline and the `/api/anki/distribute` route. All `loadProfile`/`ProfileLock`/`ACTIVE_PROFILE` machinery is deleted.

**Tech Stack:** Next.js 15 / TypeScript, AnkiConnect HTTP API, Vitest (mocked `global.fetch` keyed by URL+action), real-container integration test against Podman instances (source 8770 → target 8771).

**Spec:** `docs/superpowers/specs/2026-07-04-per-instance-distribution-design.md`

## Global Constraints

- `DISTRIBUTION_TARGETS` format: comma-separated `Name=URL` pairs, e.g. `Gao Tian=http://localhost:8770, Gao Yi=http://localhost:8771`. Malformed entries are skipped with `console.warn`.
- `DistributeResult.profile` carries the **target name** (type field name unchanged — UI depends on it).
- Per-target error isolation: one failing target never aborts the others.
- Target `sync()` after distribution is best-effort (warn + continue).
- The deck placement guard (`ensureCardsInDeck`) must work on every client, not just the default.
- Test data uses `__test_` prefix; integration test auto-skips when containers unreachable.
- Every task: failing test → red run → implement → green → mutation spot-check → commit (test + behavior same commit, matrix in body).
- Intermediate tasks must keep `npm test` green and `npx tsc --noEmit` clean — old machinery is removed only in Task 6, after all consumers moved off it.

---

### Task 1: `DISTRIBUTION_TARGETS` config + parser

**Files:**
- Modify: `src/lib/settings.ts` (CONFIG_KEYS block ~line 10-20; new exported function at end)
- Test: `tests/unit/settings-distribution-targets.test.ts` (create)

**Interfaces:**
- Produces: `getDistributionTargets(): { name: string; url: string }[]` and new config key `DISTRIBUTION_TARGETS`. Task 4 and Task 5 consume this.
- Old keys `ACTIVE_PROFILE` / `DISTRIBUTION_PROFILES` are NOT removed here (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/settings-distribution-targets.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

const getConfigMock = vi.hoisted(() => vi.fn());

// Mock only getConfig reads for DISTRIBUTION_TARGETS; keep the rest real.
vi.mock("@/lib/settings", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/settings")>();
  return { ...orig, getConfig: getConfigMock };
});

import { getDistributionTargets } from "@/lib/settings";

afterEach(() => vi.clearAllMocks());

describe("getDistributionTargets", () => {
  it("parses Name=URL pairs and trims whitespace", () => {
    getConfigMock.mockReturnValue(
      " Gao Tian = http://localhost:8770 , Gao Yi=http://localhost:8771 "
    );
    expect(getDistributionTargets()).toEqual([
      { name: "Gao Tian", url: "http://localhost:8770" },
      { name: "Gao Yi", url: "http://localhost:8771" },
    ]);
  });

  it("returns empty list when unset", () => {
    getConfigMock.mockReturnValue("");
    expect(getDistributionTargets()).toEqual([]);
  });

  it("skips malformed entries (no '=', empty name or URL) with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getConfigMock.mockReturnValue("just-a-name, =http://x, Valid=http://ok, Name=");
    expect(getDistributionTargets()).toEqual([{ name: "Valid", url: "http://ok" }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

> ⚠️ `vi.mock` of the module under test only works if `getDistributionTargets` calls the module-local `getConfig` through the mocked binding. Simplest robust implementation: have `getDistributionTargets` accept an optional raw string param defaulting to `getConfig("DISTRIBUTION_TARGETS")`, and test the parser through the param instead of mocking. **Prefer that if the mock proves brittle** — rewrite the tests to pass the raw string directly (same cases).

- [ ] **Step 2: Run test — expect FAIL** (`getDistributionTargets` not exported)

Run: `npx vitest run tests/unit/settings-distribution-targets.test.ts`

- [ ] **Step 3: Implement**

In `src/lib/settings.ts` CONFIG_KEYS, add after `DISTRIBUTION_PROFILES`:

```ts
  DISTRIBUTION_TARGETS: { secret: false, envAllowed: false, description: "Distribution targets as Name=URL pairs, comma-separated (e.g. Gao Tian=http://localhost:8770)" },
```

At the end of the file:

```ts
/** Parse DISTRIBUTION_TARGETS ("Name=URL, Name2=URL2") into typed targets. */
export function getDistributionTargets(
  raw: string = getConfig("DISTRIBUTION_TARGETS")
): { name: string; url: string }[] {
  if (!raw) return [];
  const targets: { name: string; url: string }[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const name = eq > 0 ? trimmed.slice(0, eq).trim() : "";
    const url = eq > 0 ? trimmed.slice(eq + 1).trim() : "";
    if (!name || !url) {
      console.warn(`[Settings] Skipping malformed DISTRIBUTION_TARGETS entry: "${trimmed}"`);
      continue;
    }
    targets.push({ name, url });
  }
  return targets;
}
```

- [ ] **Step 4: Run test — expect PASS.** Also run `npx tsc --noEmit`.
- [ ] **Step 5: Mutation spot-check** — temporarily change `eq > 0` to `eq >= 0`; expect the malformed-entries test to fail (entry `=http://x` would pass). Revert via the same edit (never `git checkout`).
- [ ] **Step 6: Commit** `feat(settings): DISTRIBUTION_TARGETS key + parser`

---

### Task 2: `createAnkiClient(url)` factory + provisioning API methods

**Files:**
- Modify: `src/lib/anki-connect.ts` (wrap the existing object literal in a factory; keep `withProfileLock` and profile methods for now)
- Test: `tests/unit/anki-connect-client-factory.test.ts` (create)

**Interfaces:**
- Produces:
  - `createAnkiClient(url?: string): AnkiClient` — same surface as today's `ankiConnect`, every request bound to `url` (or dynamically to `getConfig("ANKI_CONNECT_URL")` when omitted).
  - `export type AnkiClient = ReturnType<typeof createAnkiClient>`
  - `export const ankiConnect = createAnkiClient()` (unchanged behavior for all existing callers).
  - New methods on every client (used by Task 3):
    - `findModelsByName(modelNames: string[]): Promise<Array<{ id: number; type: number } & Record<string, unknown>>>`
    - `modelTemplates(modelName: string): Promise<Record<string, { Front: string; Back: string }>>`
    - `modelStyling(modelName: string): Promise<{ css: string }>`
    - `createModel(params: { modelName: string; inOrderFields: string[]; css: string; isCloze: boolean; cardTemplates: { Name: string; Front: string; Back: string }[] }): Promise<unknown>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/anki-connect-client-factory.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createAnkiClient, ankiConnect } from "@/lib/anki-connect";

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
    // getConfig default is http://localhost:8765 unless overridden in data/secrets.json
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
    expect(calls[0].action).toBe("createModel");
    expect(calls[0].params).toEqual({
      modelName: "__test_m",
      inOrderFields: ["A", "B"],
      css: ".card{}",
      isCloze: false,
      cardTemplates: [{ Name: "Card 1", Front: "{{A}}", Back: "{{B}}" }],
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`createAnkiClient` not exported).
- [ ] **Step 3: Implement.** In `anki-connect.ts`:
  1. Rename the module-level `invoke` into a factory-local closure:

```ts
export function createAnkiClient(urlOverride?: string) {
  const resolveUrl = () => urlOverride ?? getConfig("ANKI_CONNECT_URL");

  async function invoke<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<T> {
    const body: AnkiConnectRequest = { action, version: 6, params };
    const res = await fetch(resolveUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`AnkiConnect HTTP error: ${res.status}`);
    const data: AnkiConnectResponse<T> = await res.json();
    if (data.error) throw new Error(`AnkiConnect error: ${data.error}`);
    return data.result;
  }

  async function ensureCardsInDeck(noteIds: number[], deckName: string): Promise<void> {
    /* move existing implementation here unchanged */
  }

  return {
    /* move the entire existing ankiConnect object literal here unchanged,
       plus the four new methods: */
    async findModelsByName(modelNames: string[]) {
      return invoke<Array<{ id: number; type: number } & Record<string, unknown>>>(
        "findModelsByName", { modelNames });
    },
    async modelTemplates(modelName: string) {
      return invoke<Record<string, { Front: string; Back: string }>>(
        "modelTemplates", { modelName });
    },
    async modelStyling(modelName: string) {
      return invoke<{ css: string }>("modelStyling", { modelName });
    },
    async createModel(params: {
      modelName: string; inOrderFields: string[]; css: string;
      isCloze: boolean; cardTemplates: { Name: string; Front: string; Back: string }[];
    }) {
      return invoke("createModel", { ...params });
    },
  };
}

export type AnkiClient = ReturnType<typeof createAnkiClient>;
export const ankiConnect = createAnkiClient();
```

  2. `withProfileLock` and the profile methods stay untouched in this task.

- [ ] **Step 4: Run new test + existing `tests/unit/anki-connect-deck-guard.test.ts` — expect ALL PASS** (deck-guard tests exercise the default client through the same factory). `npx tsc --noEmit` clean.
- [ ] **Step 5: Mutation spot-check** — make `resolveUrl` ignore `urlOverride` (always `getConfig`); expect "binds every request" test to fail. Revert by re-applying the correct line.
- [ ] **Step 6: Commit** `refactor(anki): createAnkiClient factory + provisioning methods`

---

### Task 3: `src/lib/distribution.ts` — shared flow with auto-provisioning

**Files:**
- Create: `src/lib/distribution.ts`
- Test: `tests/unit/distribution.test.ts` (create)

**Interfaces:**
- Consumes: `createAnkiClient`, `ankiConnect`, `AnkiClient` (Task 2); `getLanguageByNoteType`, `getLanguageById` (existing); `DistributeResult` from `@/types/anki`.
- Produces:
  - `type DistributionTarget = { name: string; url: string }`
  - `type DistributionProgress = { update(msg: string): Promise<void> }`
  - `distributeToTargets(noteIds: number[], targets: DistributionTarget[], mediaCache?: Map<string, string>, progress?: DistributionProgress): Promise<DistributeResult[]>`

- [ ] **Step 1: Write the failing tests** — mock `global.fetch` dispatching on **URL + action**:

```ts
// tests/unit/distribution.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { distributeToTargets } from "@/lib/distribution";

const SOURCE = "http://localhost:8765"; // getConfig default; adjust via handler match below
type Call = { url: string; action: string; params: Record<string, unknown> };

/** handlers: { [urlPrefix]: { [action]: (params) => result } } */
function mockAnki(handlers: Record<string, Record<string, (p: Record<string, unknown>) => unknown>>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const u = String(url);
      const body = JSON.parse(init?.body ?? "{}");
      calls.push({ url: u, action: body.action, params: body.params });
      const host = Object.keys(handlers).find((h) => u.startsWith(h));
      const handler = host && handlers[host][body.action];
      if (!handler) throw new Error(`Unexpected call: ${u} ${body.action}`);
      try {
        return { ok: true, json: async () => ({ result: handler(body.params ?? {}), error: null }) };
      } catch (err) {
        return { ok: true, json: async () => ({ result: null, error: String(err) }) };
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

// Shared source handlers: notesInfo + model definition endpoints
const sourceHandlers = (extra: Record<string, (p: Record<string, unknown>) => unknown> = {}) => ({
  notesInfo: () => [SOURCE_NOTE],
  modelFieldNames: () => ["Word", "Note ID"],
  modelTemplates: () => ({ "Card 1": { Front: "{{Word}}", Back: "{{Word}}" } }),
  modelStyling: () => ({ css: ".card {}" }),
  findModelsByName: () => [{ id: 1, type: 0 }],
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));

const TARGET = { name: "Gao Yi", url: "http://localhost:8771" };

describe("distributeToTargets", () => {
  it("provisions missing notetype and deck on the target, then adds the note", async () => {
    const calls = mockAnki({
      "http://localhost:8765": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["Basic"],           // missing → provision
        createModel: () => null,
        deckNames: () => ["Default"],          // missing → create
        createDeck: () => 1,
        findNotes: () => [],                   // no existing → add
        addNote: () => 999,
        findCards: () => [],                   // deck guard: nothing misplaced
        sync: () => null,
      },
    });

    const results = await distributeToTargets([111], [TARGET]);

    expect(results).toEqual([{ profile: "Gao Yi", success: true, notesDistributed: 1 }]);
    const t = (a: string) => calls.filter((c) => c.url.startsWith("http://localhost:8771") && c.action === a);
    expect(t("createModel")).toHaveLength(1);
    expect(t("createDeck")).toHaveLength(1);
    expect(t("addNote")).toHaveLength(1);
    expect(t("sync")).toHaveLength(1);
  });

  it("does not provision when notetype and deck already exist; updates existing note by UUID", async () => {
    const calls = mockAnki({
      "http://localhost:8765": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [555],
        updateNoteFields: () => null,
        sync: () => null,
      },
    });

    const results = await distributeToTargets([111], [TARGET]);

    expect(results[0]).toEqual({ profile: "Gao Yi", success: true, notesDistributed: 1 });
    const actions = calls.filter((c) => c.url.startsWith("http://localhost:8771")).map((c) => c.action);
    expect(actions).not.toContain("createModel");
    expect(actions).not.toContain("createDeck");
    expect(actions).not.toContain("addNote");
    expect(actions).toContain("updateNoteFields");
  });

  it("stores media files on the target before writing notes", async () => {
    const calls = mockAnki({
      "http://localhost:8765": sourceHandlers(),
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

    const targetActions = calls.filter((c) => c.url.startsWith("http://localhost:8771")).map((c) => c.action);
    expect(targetActions.indexOf("storeMediaFile")).toBeGreaterThan(-1);
    expect(targetActions.indexOf("storeMediaFile")).toBeLessThan(targetActions.indexOf("addNote"));
  });

  it("isolates per-target failures: second target still distributed", async () => {
    const bad = { name: "Broken", url: "http://localhost:9999" };
    const calls = mockAnki({
      "http://localhost:8765": sourceHandlers(),
      "http://localhost:9999": {
        modelNames: () => { throw new Error("connection refused"); },
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
    expect(results[1]).toEqual({ profile: "Gao Yi", success: true, notesDistributed: 1 });
  });

  it("sync failure on target is best-effort: result still success", async () => {
    mockAnki({
      "http://localhost:8765": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [],
        addNote: () => 999,
        findCards: () => [],
        sync: () => { throw new Error("auth not configured"); },
      },
    });

    const results = await distributeToTargets([111], [TARGET]);
    expect(results[0].success).toBe(true);
  });

  it("returns [] for empty noteIds or targets without any network call", async () => {
    const calls = mockAnki({});
    expect(await distributeToTargets([], [TARGET])).toEqual([]);
    expect(await distributeToTargets([111], [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
```

> Note: the source-URL prefix in the mock must match the executor's actual `getConfig("ANKI_CONNECT_URL")` (default `http://localhost:8765`; local `data/secrets.json` may override). If the executor's env differs, key the source handler by that URL — or more robustly, treat "any URL that is not a target URL" as source in the mock dispatcher.

- [ ] **Step 2: Run — expect FAIL** (module doesn't exist).
- [ ] **Step 3: Implement `src/lib/distribution.ts`:**

```ts
import { ankiConnect, createAnkiClient, type AnkiClient } from "@/lib/anki-connect";
import { getLanguageByNoteType, getLanguageById } from "@/lib/languages";
import type { AnkiNote, DistributeResult } from "@/types/anki";

export type DistributionTarget = { name: string; url: string };
export type DistributionProgress = { update(msg: string): Promise<void> };

/**
 * Distribute source notes to dedicated per-profile Anki instances.
 * Sequential across targets; each target's failure is isolated.
 */
export async function distributeToTargets(
  noteIds: number[],
  targets: DistributionTarget[],
  mediaCache?: Map<string, string>,
  progress?: DistributionProgress
): Promise<DistributeResult[]> {
  if (noteIds.length === 0 || targets.length === 0) return [];

  const sourceNotes = await ankiConnect.notesInfo(noteIds);
  if (sourceNotes.length === 0) return [];

  const lang = getLanguageByNoteType(sourceNotes[0].modelName);
  const deckName = lang?.deck ?? getLanguageById("english").deck;
  const modelName = lang?.noteType ?? getLanguageById("english").noteType;

  const results: DistributeResult[] = [];
  for (const target of targets) {
    if (progress) await progress.update(`Distributing to ${target.name}...`);
    results.push(
      await distributeToTarget(target, sourceNotes, deckName, modelName, mediaCache)
    );
  }
  return results;
}

async function distributeToTarget(
  target: DistributionTarget,
  sourceNotes: AnkiNote[],
  deckName: string,
  modelName: string,
  mediaCache?: Map<string, string>
): Promise<DistributeResult> {
  try {
    const client = createAnkiClient(target.url);

    await ensureModel(client, modelName, target.name);
    await ensureDeck(client, deckName, target.name);

    if (mediaCache && mediaCache.size > 0) {
      for (const [filename, data] of mediaCache) {
        try {
          await client.storeMediaFile(filename, data);
        } catch (err) {
          console.warn(`[Distribution] Failed to store media "${filename}" on "${target.name}":`, err);
        }
      }
    }

    let distributed = 0;
    for (const note of sourceNotes) {
      const fields: Record<string, string> = {};
      for (const [key, val] of Object.entries(note.fields)) {
        fields[key] = val.value;
      }
      const uuid = fields["Note ID"];
      if (!uuid) continue;

      const existing = await client.findNotes(`deck:"${deckName}" "${uuid}"`);
      if (existing.length > 0) {
        await client.updateNoteFields({ id: existing[0], fields });
      } else {
        try {
          await client.addNote({ deckName, modelName, fields, tags: note.tags });
        } catch {
          continue;
        }
      }
      distributed++;
    }

    try {
      await client.sync();
    } catch (err) {
      console.warn(`[Distribution] Sync on "${target.name}" failed (continuing):`, err);
    }

    return { profile: target.name, success: true, notesDistributed: distributed };
  } catch (err) {
    console.error(`[Distribution] Error distributing to "${target.name}":`, err);
    return {
      profile: target.name,
      success: false,
      error: err instanceof Error ? err.message : "Distribution failed",
      notesDistributed: 0,
    };
  }
}

/** Create the notetype on the target from the source's full definition. */
async function ensureModel(client: AnkiClient, modelName: string, targetName: string): Promise<void> {
  const models = await client.modelNames();
  if (models.includes(modelName)) return;

  console.log(`[Distribution] Provisioning notetype "${modelName}" on "${targetName}"`);
  const [srcModel] = await ankiConnect.findModelsByName([modelName]);
  const inOrderFields = await ankiConnect.modelFieldNames(modelName);
  const templates = await ankiConnect.modelTemplates(modelName);
  const styling = await ankiConnect.modelStyling(modelName);

  await client.createModel({
    modelName,
    inOrderFields,
    css: styling.css,
    isCloze: srcModel?.type === 1,
    cardTemplates: Object.entries(templates).map(([Name, t]) => ({
      Name,
      Front: t.Front,
      Back: t.Back,
    })),
  });
}

/** Create the deck on the target if missing. */
async function ensureDeck(client: AnkiClient, deckName: string, targetName: string): Promise<void> {
  const decks = await client.deckNames();
  if (decks.includes(deckName)) return;
  console.log(`[Distribution] Provisioning deck "${deckName}" on "${targetName}"`);
  await client.createDeck(deckName);
}
```

(If `AnkiNote` in `@/types/anki` lacks needed fields, use the existing type as-is — `notesInfo` already returns it elsewhere.)

- [ ] **Step 4: Run — expect ALL PASS.** `npx tsc --noEmit` clean.
- [ ] **Step 5: Mutation spot-checks** (revert each by re-applying the correct code):
  - Invert `models.includes(modelName)` in `ensureModel` → provisioning tests fail both ways.
  - Remove the `try/catch` around `client.sync()` (rethrow) → best-effort sync test fails.
- [ ] **Step 6: Commit** `feat(distribution): shared per-instance distribution with auto-provisioning`

---

### Task 4: Switch pipeline + distribute route to the shared flow

**Files:**
- Modify: `src/lib/enrichment-pipeline.ts` (`distributeNotes`, ~line 1001-1113: replace body; delete the old profile-switch loop)
- Modify: `src/app/api/anki/distribute/route.ts` (replace the profile loop with `distributeToTargets`)
- Test: `tests/unit/distribution.test.ts` (extend with a `distributeNotes` wiring test)

**Interfaces:**
- Consumes: `distributeToTargets` (Task 3), `getDistributionTargets` (Task 1).
- Produces: `distributeNotes(noteIds, progress?, mediaCache?)` keeps its existing signature (caller `runPipeline` unchanged). `/api/anki/distribute` request body keeps `{ noteIds, targetProfiles: string[], mediaFiles? }` — `targetProfiles` now carries **target names** filtered against `getDistributionTargets()`.

- [ ] **Step 1: Write the failing test** (append to `tests/unit/distribution.test.ts`):

```ts
import { distributeNotes } from "@/lib/enrichment-pipeline";
import * as settings from "@/lib/settings";

describe("distributeNotes wiring", () => {
  it("reads DISTRIBUTION_TARGETS and distributes to each", async () => {
    vi.spyOn(settings, "getDistributionTargets").mockReturnValue([
      { name: "Gao Yi", url: "http://localhost:8771" },
    ]);
    mockAnki({
      "http://localhost:8765": sourceHandlers(),
      "http://localhost:8771": {
        modelNames: () => ["school Chinese spelling"],
        deckNames: () => ["Gao Chinese"],
        findNotes: () => [],
        addNote: () => 999,
        findCards: () => [],
        sync: () => null,
      },
    });

    const results = await distributeNotes([111]);
    expect(results).toEqual([{ profile: "Gao Yi", success: true, notesDistributed: 1 }]);
  });

  it("returns [] when no targets configured", async () => {
    vi.spyOn(settings, "getDistributionTargets").mockReturnValue([]);
    const calls = mockAnki({});
    expect(await distributeNotes([111])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
```

> If `vi.spyOn` on the settings module namespace fails under the bundler ("cannot redefine property"), switch to `vi.mock("@/lib/settings", ...)` with `importOriginal` and a `getDistributionTargets` mock — same assertions.

- [ ] **Step 2: Run — expect FAIL** (old `distributeNotes` reads `DISTRIBUTION_PROFILES` and calls `loadProfileAndWait`, so the mock throws `Unexpected call`).
- [ ] **Step 3: Implement.**
  1. `enrichment-pipeline.ts`: replace the entire `distributeNotes` body (and delete the old per-profile loop, `withProfileLock` import if now unused, `syncBeforeWrite` pre-step stays **removed** — receivers sync themselves post-write):

```ts
/** Distribute notes to configured target instances (server-side). */
export async function distributeNotes(
  noteIds: number[],
  progress?: PipelineProgress,
  mediaCache?: Map<string, string>
): Promise<DistributeResult[]> {
  const targets = getDistributionTargets();
  if (targets.length === 0) return [];
  return distributeToTargets(noteIds, targets, mediaCache, progress);
}
```

  Add imports: `import { distributeToTargets } from "@/lib/distribution";` and `getDistributionTargets` from `./settings`.

  2. `/api/anki/distribute/route.ts`: replace the whole handler body's distribution logic:

```ts
import { NextRequest, NextResponse } from "next/server";
import { writeQueue } from "@/lib/write-queue";
import { getDistributionTargets } from "@/lib/settings";
import { distributeToTargets } from "@/lib/distribution";

/** POST: Distribute notes from the source instance to target instances */
export async function POST(request: NextRequest) {
  try {
    const { noteIds, targetProfiles, mediaFiles } = await request.json();

    if (!noteIds?.length || !targetProfiles?.length) {
      return NextResponse.json(
        { error: "noteIds and targetProfiles are required" },
        { status: 400 }
      );
    }

    const mediaCache = new Map<string, string>();
    if (Array.isArray(mediaFiles)) {
      for (const mf of mediaFiles) {
        if (mf.filename && mf.data) mediaCache.set(mf.filename, mf.data);
      }
    }

    const configured = getDistributionTargets();
    const targets = configured.filter((t) => targetProfiles.includes(t.name));
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No matching distribution targets configured" },
        { status: 400 }
      );
    }

    const results = await writeQueue.enqueue(() =>
      distributeToTargets(noteIds, targets, mediaCache.size > 0 ? mediaCache : undefined)
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Distribute error:", error);
    const msg = error instanceof Error ? error.message : "Distribution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run full unit suite — expect ALL PASS.** `npx tsc --noEmit` clean.
- [ ] **Step 5: Mutation spot-check** — in `distributeNotes`, hardcode `targets` to `[]`; wiring test fails. Revert.
- [ ] **Step 6: Commit** `feat(distribution): pipeline + distribute route use per-instance targets`

---

### Task 5: Delete propagation removal

**Files:**
- Modify: `src/app/api/anki/notes/route.ts` (DELETE handler: remove the cross-profile block, lines ~82-150)
- Modify: any UI reading `profileResults` from the DELETE response (grep first — expected none outside the route)
- Test: `tests/unit/notes-delete-local-only.test.ts` (create)

**Interfaces:**
- Produces: DELETE `/api/anki/notes` deletes on the source instance only; response shape `{ homeDeleted: number }`.

- [ ] **Step 1: Write the failing test** — import the route handler directly (Next.js route handlers are plain functions):

```ts
// tests/unit/notes-delete-local-only.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { DELETE } from "@/app/api/anki/notes/route";
import { NextRequest } from "next/server";

afterEach(() => vi.unstubAllGlobals());

it("deletes only on the source instance and issues no profile switches", async () => {
  const actions: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}");
      actions.push(body.action);
      const results: Record<string, unknown> = {
        notesInfo: [
          {
            noteId: 111,
            modelName: "school Chinese spelling",
            tags: [],
            fields: { "Note ID": { value: "uuid-abc", order: 0 } },
            cards: [1],
          },
        ],
        deleteNotes: null,
        sync: null,
      };
      if (!(body.action in results)) throw new Error(`Unexpected action: ${body.action}`);
      return { ok: true, json: async () => ({ result: results[body.action], error: null }) };
    })
  );

  const req = new NextRequest("http://localhost/api/anki/notes", {
    method: "DELETE",
    body: JSON.stringify({ noteIds: [111] }),
  });
  const res = await DELETE(req);
  const data = await res.json();

  expect(data.homeDeleted).toBe(1);
  expect(data.profileResults).toBeUndefined();
  expect(actions).not.toContain("loadProfile");
  expect(actions).not.toContain("findNotes"); // no UUID-based target search
});
```

> Adjust the mocked `results` map to whatever actions the DELETE handler actually performs after the edit (e.g. `syncBeforeWrite` → `sync`). Executor: read the current handler first; the assertion that matters is **no `loadProfile` and no propagation search**, plus response shape.

- [ ] **Step 2: Run — expect FAIL** (current handler calls `loadProfile`/`findNotes` → mock throws, and `profileResults` exists).
- [ ] **Step 3: Implement** — in the DELETE handler keep: parse body → `writeQueue.enqueue` → optional `syncBeforeWrite` → `notesInfo` (only if still needed for anything; if not, delete it and the UUID collection block entirely) → `deleteNotes(noteIds)` → return `{ homeDeleted: noteIds.length }`. Remove: UUID collection, `ACTIVE_PROFILE`/`DISTRIBUTION_PROFILES` reads, the whole `withProfileLock` loop, `profileResults`. Remove now-unused imports.
- [ ] **Step 4: Run — expect PASS.** Grep `profileResults` in `src/` — only in git history, not in code. `npx tsc --noEmit` clean.
- [ ] **Step 5: Mutation spot-check** — return `{ homeDeleted: 0 }` hardcoded; test fails on `homeDeleted`. Revert.
- [ ] **Step 6: Commit** `feat(notes): deletes act on the source instance only (remove propagation)`

---

### Task 6: Remove profile-switching machinery + UI updates

**Files:**
- Modify: `src/lib/anki-connect.ts` — delete `getProfiles`, `loadProfile`, `loadProfileAndWait`, `withProfileLock` and the `profileLock` variable.
- Delete: `src/app/api/anki/profiles/route.ts`
- Delete: `src/components/shared/ProfileIndicator.tsx`; remove its import/usage from `src/app/layout.tsx`
- Modify: `src/components/shared/DistributionTargets.tsx` — fetch target **names** from `DISTRIBUTION_TARGETS` setting instead of `/api/anki/profiles` + `DISTRIBUTION_PROFILES`:

```ts
useEffect(() => {
  if (propProfiles) return;
  fetch("/api/settings")
    .then((r) => r.json())
    .then((settings) => {
      const raw = settings.settings?.DISTRIBUTION_TARGETS?.maskedValue || "";
      const names = raw
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((entry: string) => entry.split("=")[0]?.trim())
        .filter(Boolean);
      if (names.length > 0) {
        setProfiles(names);
        onChange(names);
      }
    })
    .catch(() => {});
}, [propProfiles]);
```

  (Drop the now-unused `activeProfile` state.)
- Modify: `src/app/settings/page.tsx` — remove the profile-switcher section (any UI calling `/api/anki/profiles`); `DISTRIBUTION_TARGETS` renders through the existing generic settings mechanism. Executor: read the page first; remove exactly the profile block, nothing else.
- Modify: `src/lib/settings.ts` — delete `ACTIVE_PROFILE` and `DISTRIBUTION_PROFILES` from CONFIG_KEYS.
- Check: `grep -rn "ACTIVE_PROFILE\|DISTRIBUTION_PROFILES\|withProfileLock\|loadProfile\|getProfiles\|ProfileIndicator\|/api/anki/profiles" src tests` — must return zero code references after this task. Also check `.env.docker` and `docker-compose.yml` for the removed keys and update comments if present.
- Test: no new tests; the compile + existing suite is the check. Update/delete any test referencing removed APIs.

- [ ] **Step 1: Make all removals listed above.**
- [ ] **Step 2: Run `npx tsc --noEmit` — fix every dangling reference the grep/compiler finds.**
- [ ] **Step 3: Run full `npm test` — expect ALL PASS** (Playwright quick-add spec must stay green; it doesn't use profiles).
- [ ] **Step 4: Commit** `refactor(anki): remove profile-switching machinery (per-instance architecture)`

---

### Task 7: Integration test against real containers (8770 → 8771)

**Files:**
- Create: `tests/integration/distribution.int.test.ts`
- Modify: `package.json` — add script `"test:integration": "vitest run tests/integration"`. Do **not** add to `npm test` (containers are a local/VPS-only dependency; the test also self-skips).

**Interfaces:**
- Consumes: `distributeToTargets`, `createAnkiClient`.

- [ ] **Step 1: Write the test** (no red phase — this validates already-implemented behavior end-to-end against real AnkiConnect):

```ts
// tests/integration/distribution.int.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnkiClient } from "@/lib/anki-connect";
import { distributeToTargets } from "@/lib/distribution";

const SOURCE_URL = "http://localhost:8770"; // anki-gaotian container
const TARGET_URL = "http://localhost:8771"; // anki-gaoyi container

const source = createAnkiClient(SOURCE_URL);
const target = createAnkiClient(TARGET_URL);

async function reachable(client: ReturnType<typeof createAnkiClient>) {
  try { await client.version(); return true; } catch { return false; }
}

let containersUp = false;

beforeAll(async () => {
  containersUp = (await reachable(source)) && (await reachable(target));
  if (!containersUp) return;
  // The app under test reads ANKI_CONNECT_URL for the source client —
  // point it at the source container for this suite.
  process.env.ANKI_CONNECT_URL = SOURCE_URL;
});

// NOTE: distribution resolves deck/notetype from languages.ts via the source
// note's model name. Use the real Chinese notetype name so getLanguageByNoteType
// resolves; provision it on the SOURCE first if absent (fresh container).
const MODEL = "school Chinese spelling";
const DECK = "Gao Chinese";
const FIELDS = [
  "Word", "Main Sentence", "Cloze", "Phonetic symbol", "Audio",
  "Main Sentence Audio", "Definition", "Extra information", "Picture",
  "Synonyms", "Note ID", "is_dictation_mem", "Main Sentence Pinyin",
  "Stroke Order Anim", "is_dictation", "is_dictation_from_mem",
];

async function ensureSourceModel() {
  const models = await source.modelNames();
  if (models.includes(MODEL)) return;
  await source.createModel({
    modelName: MODEL,
    inOrderFields: FIELDS,
    css: ".card {}",
    isCloze: false,
    cardTemplates: [
      { Name: "Card 1", Front: "{{Word}}", Back: "{{Main Sentence}}" },
      { Name: "Card 2", Front: "{{Main Sentence}}", Back: "{{Word}}" },
    ],
  });
}

const TEST_UUID = `__test_${Date.now()}`;
let sourceNoteId: number | null = null;

afterAll(async () => {
  if (!containersUp) return;
  for (const client of [source, target]) {
    try {
      const notes = await client.findNotes(`"${TEST_UUID}"`);
      if (notes.length > 0) await client.deleteNotes(notes);
    } catch { /* cleanup is best-effort */ }
  }
});

describe("per-instance distribution (real containers)", () => {
  it("distributes a note from 8770 to 8771, auto-provisioning model and deck", async (ctx) => {
    if (!containersUp) return ctx.skip();

    await ensureSourceModel();
    const decks = await source.deckNames();
    if (!decks.includes(DECK)) await source.createDeck(DECK);

    const fields = Object.fromEntries(FIELDS.map((f) => [f, ""]));
    fields["Word"] = "__test_word";
    fields["Main Sentence"] = "__test sentence";
    fields["Note ID"] = TEST_UUID;
    sourceNoteId = await source.addNote({
      deckName: DECK, modelName: MODEL, fields, tags: ["__test"],
    });

    const results = await distributeToTargets(
      [sourceNoteId],
      [{ name: "Gao Yi", url: TARGET_URL }]
    );

    expect(results[0].success).toBe(true);
    expect(results[0].notesDistributed).toBe(1);
    expect(await target.modelNames()).toContain(MODEL);
    expect(await target.deckNames()).toContain(DECK);
    const found = await target.findNotes(`"${TEST_UUID}"`);
    expect(found).toHaveLength(1);

    // Idempotency: distributing again updates, doesn't duplicate
    const again = await distributeToTargets(
      [sourceNoteId],
      [{ name: "Gao Yi", url: TARGET_URL }]
    );
    expect(again[0].success).toBe(true);
    expect(await target.findNotes(`"${TEST_UUID}"`)).toHaveLength(1);
  });
});
```

> The skip mechanism is the `ctx.skip()` call on unreachable containers — the suite exits 0 without them. **Gotcha:** `distributeToTargets` uses the module-level `ankiConnect` (source). Setting `process.env.ANKI_CONNECT_URL` works only if `getConfig` falls through to env (it does — `envAllowed: true` and no file value for this key in `data/secrets.json`; if the local secrets file sets it, the test must fail loudly with a clear message rather than silently distribute from the wrong source — assert `getConfig("ANKI_CONNECT_URL") === SOURCE_URL` after setting the env var, and skip with an explanatory `console.warn` if not).

- [ ] **Step 2: Run with containers up:** `npm run test:integration` — expect PASS (both containers running via `podman machine start` + compose in `~/services/anki/`).
- [ ] **Step 3: Run with containers stopped (or unreachable port): expect SKIP, exit 0.**
- [ ] **Step 4: Commit** `test(distribution): real-container integration test (8770→8771)`

---

### Task 8: Full suite, docs, wrap-up

- [ ] **Step 1: `npm test`** — full Vitest + Playwright green.
- [ ] **Step 2: `npm run build`** — Next.js production build green.
- [ ] **Step 3: Docs** — `docs/todo.md`: move Per-Instance Distribution to Completed with a summary; check `.claude/skills/anki-enrich/SKILL.md` for stale profile-switching mentions; check `docs/nas-setup.md` / `.env.docker` references to removed keys (update text where trivially wrong, flag anything deployment-related for the deployment agent rather than rewriting deployment docs wholesale).
- [ ] **Step 4: Commit** `docs: per-instance distribution wrap-up`
- [ ] **Step 5: Report** — pass/fail matrix, mutation kill summary across tasks, and remind: deployment agent must set `DISTRIBUTION_TARGETS` on the VPS (production URLs) and the local test env config for dev.
