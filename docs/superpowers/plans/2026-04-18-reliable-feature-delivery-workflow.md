# Reliable Feature Delivery Workflow — Phase A (Infrastructure)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the executable test infrastructure (Vitest + Playwright + canned AI backend + test Anki profile helpers) with one proof-of-harness test per layer, so the project is ready to pilot the new workflow on a real feature.

**Architecture:** Two test layers at stable boundaries: Vitest for unit/boundary tests (`src/lib/*`), Playwright for page-level journey tests. A third `canned` AI backend joins the existing `sdk`/`cli` options and returns deterministic responses keyed by input word when `TEST_MODE=true`. Tests run against a dedicated Anki `Test` profile; all test notes use `__test_` prefix for cleanup.

**Tech Stack:** Vitest 2.x, Playwright 1.48+, TypeScript 5.8, Next.js 15 (App Router), existing AnkiConnect wrapper, existing `@anthropic-ai/sdk`.

**Scope note:** This plan covers **Phase A only** (infrastructure + proof-of-harness tests). **Phase B** (piloting the workflow on one real feature) is a separate cycle with its own spec + plan — the pilot feature gets picked and brainstormed after Phase A lands. See Task 13 for the handoff.

---

## File Structure

**New files:**
- `vitest.config.ts` — Vitest config
- `playwright.config.ts` — Playwright config
- `tests/unit/card-completeness.test.ts` — first Vitest boundary test
- `tests/e2e/quick-add.spec.ts` — first Playwright journey test
- `tests/fixtures/make-test-card.ts` — `makeTestCard({ overrides })` factory
- `tests/fixtures/canned-enrichment.ts` — canned AI responses keyed by word
- `tests/setup/anki-test-helpers.ts` — `cleanTestNotes()`, `findTestNotes()`
- `tests/setup/playwright-globals.ts` — Playwright global before/after hooks
- `src/lib/canned-ai.ts` — `runCannedAI*` implementations for the canned backend

**Modified files:**
- `package.json` — add devDeps + test scripts
- `src/lib/settings.ts` — extend `getAIBackend()` to return `"canned"` when `TEST_MODE=true`
- `src/lib/ai.ts` — route to canned implementations when backend is `canned`
- `src/app/quick-add/page.tsx` — add `data-testid` attributes for Playwright
- `CLAUDE.md` — encode the three hard rules + scenario table
- `tests/ui-test-plan.md` — rewrite intro to position as edge-case-only supplement

---

## Task 1: Install and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1.1: Install Vitest and supporting dev deps**

Run:
```bash
npm install -D vitest@^2.1.5 @vitest/ui@^2.1.5
```

Expected: deps added to `devDependencies` in `package.json`; lockfile updated. No other output errors.

- [ ] **Step 1.2: Create `vitest.config.ts`**

Create `vitest.config.ts` at repo root:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: "default",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 1.3: Add `test:unit` script to `package.json`**

In `package.json`, edit the `scripts` block to add:
```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

After this step the full `scripts` block reads:
```json
"scripts": {
  "dev": "node scripts/dev-startup.mjs",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest"
}
```

- [ ] **Step 1.4: Verify Vitest runs (zero tests yet)**

Run: `npm run test:unit`
Expected: Vitest starts, reports "No test files found" (or similar) and exits cleanly with a success code. This proves the config loads.

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: install and configure Vitest for unit tests"
```

---

## Task 2: Install and configure Playwright

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`

- [ ] **Step 2.1: Install Playwright**

Run:
```bash
npm install -D @playwright/test@^1.48.2
npx playwright install chromium
```

Expected: dep added; `chromium` browser downloaded to Playwright's cache.

- [ ] **Step 2.2: Create `playwright.config.ts`**

Create `playwright.config.ts` at repo root:
```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3001;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  globalSetup: "./tests/setup/playwright-globals.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "TEST_MODE=true npm run dev",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { TEST_MODE: "true" },
  },
});
```

- [ ] **Step 2.3: Add `test:e2e` + combined `test` scripts**

Edit `package.json` scripts to add:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test": "npm run test:unit && npm run test:e2e"
```

Final `scripts` block:
```json
"scripts": {
  "dev": "node scripts/dev-startup.mjs",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test": "npm run test:unit && npm run test:e2e"
}
```

- [ ] **Step 2.4: Create placeholder global setup (real implementation later in Task 8)**

Create `tests/setup/playwright-globals.ts`:
```ts
/**
 * Playwright global setup.
 * Real implementation added in Task 8 (Anki test cleanup helper).
 */
export default async function globalSetup() {
  // Placeholder — Task 8 replaces this with Anki cleanup.
}
```

- [ ] **Step 2.5: Verify Playwright runs (zero specs yet)**

Run: `npm run test:e2e`
Expected: Playwright reports "No tests found" and exits 0. This proves the config loads (the dev server may or may not start depending on Playwright version; either is fine).

- [ ] **Step 2.6: Add Playwright artifacts to `.gitignore`**

Append to `.gitignore`:
```
# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 2.7: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/setup/playwright-globals.ts .gitignore
git commit -m "test: install and configure Playwright for e2e journey tests"
```

---

## Task 3: Create test fixtures — `makeTestCard` factory

**Files:**
- Create: `tests/fixtures/make-test-card.ts`

- [ ] **Step 3.1: Create the factory**

Create `tests/fixtures/make-test-card.ts`:
```ts
/**
 * Factory for test Anki note field records.
 * All test notes use __test_ prefix for cleanup.
 *
 * Usage:
 *   const card = makeTestCard({ Word: "__test_apple", "Main Sentence": "I ate an apple." });
 */

export type TestFields = Record<string, { value: string; order?: number }>;

export interface MakeTestCardOptions {
  /** Override any fields. Missing fields default to empty strings. */
  [fieldName: string]: string | undefined;
}

const DEFAULT_ENGLISH_FIELDS = [
  "Word",
  "Main Sentence",
  "Cloze",
  "Phonetic symbol",
  "Audio",
  "Main Sentence Audio",
  "Definition",
  "Extra information",
  "Picture",
  "Synonyms",
  "Note ID",
  "is_dictation_mem",
] as const;

export function makeTestCard(overrides: MakeTestCardOptions = {}): TestFields {
  const fields: TestFields = {};
  for (const name of DEFAULT_ENGLISH_FIELDS) {
    fields[name] = { value: overrides[name] ?? "" };
  }
  // Allow extra fields not in defaults (e.g. Chinese-only fields)
  for (const [name, value] of Object.entries(overrides)) {
    if (!(name in fields) && value !== undefined) {
      fields[name] = { value };
    }
  }
  // Always ensure the Word has the __test_ prefix unless caller already set it.
  const current = fields["Word"]?.value ?? "";
  if (current && !current.startsWith("__test_")) {
    fields["Word"] = { value: `__test_${current}` };
  }
  return fields;
}
```

- [ ] **Step 3.2: Commit**

```bash
git add tests/fixtures/make-test-card.ts
git commit -m "test: add makeTestCard factory for test note fixtures"
```

---

## Task 4: First Vitest boundary test — `card-completeness.test.ts`

**Files:**
- Create: `tests/unit/card-completeness.test.ts`
- Test: `tests/unit/card-completeness.test.ts` (this test IS the test file)

**Purpose:** Proves the Vitest harness wires correctly and establishes the pattern for future boundary tests. Tests existing code (`src/lib/card-completeness.ts`) — not strict TDD, but a harness verification. Later boundary tests added for new behavior will start red.

- [ ] **Step 4.1: Write the first three assertions**

Create `tests/unit/card-completeness.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getCardCompleteness } from "@/lib/card-completeness";
import { LANGUAGES } from "@/lib/languages";
import { makeTestCard } from "../fixtures/make-test-card";

const ENGLISH = LANGUAGES.english;

describe("getCardCompleteness (English)", () => {
  it("reports all enrichable text fields missing for a bare word", () => {
    const fields = makeTestCard({ Word: "apple" });
    const result = getCardCompleteness(fields, ENGLISH);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(["sentence", "definition", "phonetic", "synonyms", "extra_info", "audio"])
    );
  });

  it("does not flag sentence_audio or image when sentence is empty", () => {
    const fields = makeTestCard({ Word: "apple" });
    const result = getCardCompleteness(fields, ENGLISH);
    expect(result.missing).not.toContain("sentence_audio");
    expect(result.missing).not.toContain("image");
  });

  it("flags sentence_audio and image once a sentence is filled", () => {
    const fields = makeTestCard({
      Word: "apple",
      "Main Sentence": "I ate an apple.",
    });
    const result = getCardCompleteness(fields, ENGLISH);
    expect(result.missing).toContain("sentence_audio");
    expect(result.missing).toContain("image");
  });
});
```

- [ ] **Step 4.2: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: 1 file, 3 tests, all PASS. Green exit.

If any test fails, inspect `src/lib/card-completeness.ts` — the test was written against the current behavior of existing code; a failure indicates either a test bug or an undocumented behavior change in the code. Fix the test before proceeding; do not change production code in this task.

- [ ] **Step 4.3: Commit**

```bash
git add tests/unit/card-completeness.test.ts
git commit -m "test: add first Vitest boundary test for card-completeness"
```

---

## Task 5: Add canned AI backend — core module

**Files:**
- Create: `src/lib/canned-ai.ts`
- Create: `tests/fixtures/canned-enrichment.ts`

- [ ] **Step 5.1: Create canned response fixture**

Create `tests/fixtures/canned-enrichment.ts`:
```ts
/**
 * Deterministic AI responses for TEST_MODE.
 * Keyed by the primary English word in the prompt.
 * Extend this file when new tests need new canned data.
 */

export interface CannedEnrichment {
  sentence: string;
  cloze: string;
  definition: string;
  phonetic: string;
  synonyms: string;
  extra_info: string;
}

export const CANNED_BY_WORD: Record<string, CannedEnrichment> = {
  __test_apple: {
    sentence: "I ate a crisp red apple after lunch.",
    cloze: "I ate a crisp red {{c1::apple}} after lunch.",
    definition: "A round fruit with red or green skin.",
    phonetic: "/ˈæp.əl/",
    synonyms: "fruit, pome",
    extra_info: "<ul><li>She picked an apple from the tree.</li></ul>",
  },
  __test_banana: {
    sentence: "He peeled a yellow banana for breakfast.",
    cloze: "He peeled a yellow {{c1::banana}} for breakfast.",
    definition: "A long curved yellow tropical fruit.",
    phonetic: "/bəˈnæn.ə/",
    synonyms: "plantain, fruit",
    extra_info: "<ul><li>Monkeys love bananas.</li></ul>",
  },
};

/** Fallback used when a prompt references a word not in CANNED_BY_WORD. */
export const CANNED_DEFAULT: CannedEnrichment = {
  sentence: "This is a canned test sentence.",
  cloze: "This is a canned {{c1::test}} sentence.",
  definition: "A placeholder canned definition.",
  phonetic: "/kænd/",
  synonyms: "fake, stub",
  extra_info: "<ul><li>Canned example one.</li><li>Canned example two.</li></ul>",
};
```

- [ ] **Step 5.2: Create canned AI implementation**

Create `src/lib/canned-ai.ts`:
```ts
import { CANNED_BY_WORD, CANNED_DEFAULT } from "../../tests/fixtures/canned-enrichment";
import type { ImageInput } from "./ai";

/**
 * Return canned AI output for TEST_MODE.
 * Looks up prompt by finding a __test_* word inside it; falls back to CANNED_DEFAULT.
 */
function findCannedForPrompt(prompt: string) {
  const match = prompt.match(/__test_[a-zA-Z0-9_\u4e00-\u9fff]+/);
  if (match && CANNED_BY_WORD[match[0]]) {
    return CANNED_BY_WORD[match[0]];
  }
  return CANNED_DEFAULT;
}

/** Canned text response — returns the canned enrichment as JSON string. */
export async function runCannedAI(prompt: string): Promise<string> {
  const canned = findCannedForPrompt(prompt);
  return JSON.stringify(canned);
}

/** Canned JSON response — returns the canned enrichment as a typed object. */
export async function runCannedAIJSON<T = unknown>(prompt: string): Promise<T> {
  const canned = findCannedForPrompt(prompt);
  return canned as unknown as T;
}

/** Canned vision response — ignores images, returns a stubbed extraction result. */
export async function runCannedAIVision<T = unknown>(
  _prompt: string,
  _images: ImageInput[]
): Promise<T> {
  return {
    pages: [
      {
        term: "Test",
        week: "1",
        topic: "Canned",
        sentences: [
          { number: 1, word: "__test_canned", sentence: "This is a canned extraction result." },
        ],
      },
    ],
  } as unknown as T;
}
```

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/canned-ai.ts tests/fixtures/canned-enrichment.ts
git commit -m "feat: add canned AI backend module for TEST_MODE"
```

---

## Task 6: Wire canned backend into `ai.ts` + `settings.ts`

**Files:**
- Modify: `src/lib/settings.ts:140-154`
- Modify: `src/lib/ai.ts`

- [ ] **Step 6.1: Extend `getAIBackend()` to return `"canned"` in TEST_MODE**

In `src/lib/settings.ts`, replace the existing `getAIBackend()` function:
```ts
export function getAIBackend(): "sdk" | "cli" | "canned" | "none" {
  if (process.env.TEST_MODE === "true") {
    return "canned";
  }
  const setting = getConfig("AI_BACKEND");

  if (setting === "sdk") {
    return getConfig("ANTHROPIC_API_KEY") ? "sdk" : "none";
  }
  if (setting === "cli") {
    return getConfig("CLAUDE_CODE_OAUTH_TOKEN") ? "cli" : "none";
  }

  // Auto mode: prefer SDK, fallback to CLI
  if (getConfig("ANTHROPIC_API_KEY")) return "sdk";
  if (getConfig("CLAUDE_CODE_OAUTH_TOKEN")) return "cli";
  return "none";
}
```

- [ ] **Step 6.2: Route `runAI*` to canned implementations**

In `src/lib/ai.ts`, replace the file contents with:
```ts
import { getConfig, getAIBackend } from "./settings";
import { runAnthropic, runAnthropicJSON, runAnthropicVision } from "./anthropic";
import { runClaude, runClaudeJSON, runClaudeVision } from "./claude-cli";
import { runCannedAI, runCannedAIJSON, runCannedAIVision } from "./canned-ai";

export type ImageInput = {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";
};

function ensureBackend(): "sdk" | "cli" | "canned" {
  const backend = getAIBackend();
  if (backend === "none") {
    throw new Error(
      "No AI backend configured. Go to Settings to add an Anthropic API key (SDK mode) or Claude OAuth token (CLI mode)."
    );
  }
  return backend;
}

/** Run a text prompt via the configured AI backend. Returns raw text. */
export async function runAI(prompt: string): Promise<string> {
  const backend = ensureBackend();
  if (backend === "canned") return runCannedAI(prompt);
  if (backend === "sdk") return runAnthropic(prompt);
  return runClaude(prompt);
}

/** Run a text prompt and parse result as JSON. */
export async function runAIJSON<T = unknown>(prompt: string): Promise<T> {
  const backend = ensureBackend();
  if (backend === "canned") return runCannedAIJSON<T>(prompt);
  if (backend === "sdk") return runAnthropicJSON<T>(prompt);
  return runClaudeJSON<T>(prompt);
}

/** Run a multimodal vision prompt. */
export async function runAIVision<T = unknown>(
  prompt: string,
  images: ImageInput[]
): Promise<T> {
  const backend = ensureBackend();
  if (backend === "canned") return runCannedAIVision<T>(prompt, images);
  if (backend === "cli") {
    if (getConfig("ANTHROPIC_API_KEY")) {
      return runAnthropicVision<T>(prompt, images);
    }
    return runClaudeVision<T>(prompt, images);
  }
  return runAnthropicVision<T>(prompt, images);
}
```

- [ ] **Step 6.3: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: No errors. (If unrelated existing errors surface, flag them to the user — do not fix unrelated errors in this task.)

- [ ] **Step 6.4: Commit**

```bash
git add src/lib/ai.ts src/lib/settings.ts
git commit -m "feat: route runAI* to canned backend when TEST_MODE is set"
```

---

## Task 7: Anki test cleanup helper

**Files:**
- Create: `tests/setup/anki-test-helpers.ts`
- Modify: `tests/setup/playwright-globals.ts`

- [ ] **Step 7.1: Create the helper module**

Create `tests/setup/anki-test-helpers.ts`:
```ts
/**
 * Helpers for cleaning up __test_* notes from Anki between test runs.
 * Assumes Anki is running on ANKI_CONNECT_URL (default http://localhost:8765)
 * on a profile that has both Gao English Spelling and Gao Chinese decks.
 */

const ANKI_URL = process.env.ANKI_CONNECT_URL || "http://localhost:8765";

async function ankiConnect<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  if (!res.ok) {
    throw new Error(`AnkiConnect request failed: ${res.status}`);
  }
  const data = (await res.json()) as { result: T; error: string | null };
  if (data.error) {
    throw new Error(`AnkiConnect error (${action}): ${data.error}`);
  }
  return data.result;
}

export async function findTestNotes(): Promise<number[]> {
  const decks = ["Gao English Spelling", "Gao Chinese"];
  const ids = new Set<number>();
  for (const deck of decks) {
    try {
      const found = await ankiConnect<number[]>("findNotes", { query: `deck:"${deck}" __test_*` });
      found.forEach((id) => ids.add(id));
    } catch {
      // Deck may not exist in this profile — skip silently.
    }
  }
  return Array.from(ids);
}

export async function cleanTestNotes(): Promise<number> {
  const ids = await findTestNotes();
  if (ids.length === 0) return 0;
  await ankiConnect("deleteNotes", { notes: ids });
  return ids.length;
}

export async function pingAnki(): Promise<boolean> {
  try {
    await ankiConnect<number>("version");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 7.2: Wire cleanup into Playwright global setup**

Replace `tests/setup/playwright-globals.ts`:
```ts
import { cleanTestNotes, pingAnki } from "./anki-test-helpers";

/**
 * Playwright global setup — runs once before all specs.
 * - Verifies Anki is reachable.
 * - Cleans leftover __test_* notes from previous runs.
 */
export default async function globalSetup() {
  const reachable = await pingAnki();
  if (!reachable) {
    throw new Error(
      "Anki is not reachable via AnkiConnect. Start Anki on the Test profile before running e2e tests."
    );
  }
  const cleaned = await cleanTestNotes();
  if (cleaned > 0) {
    console.log(`[playwright-globals] Cleaned ${cleaned} leftover __test_* notes.`);
  }
}
```

- [ ] **Step 7.3: Commit**

```bash
git add tests/setup/anki-test-helpers.ts tests/setup/playwright-globals.ts
git commit -m "test: add Anki test cleanup helper and wire into Playwright global setup"
```

---

## Task 8: Add `data-testid` attributes to Quick Add page

**Files:**
- Modify: `src/app/quick-add/page.tsx`

**Purpose:** Stable selectors for Playwright. No behavioral change. The exact edits depend on the current file structure; the executing agent must read the file first, then add `data-testid` to the three elements listed below.

- [ ] **Step 8.1: Read current Quick Add page**

Read `src/app/quick-add/page.tsx` in full to identify the three target elements.

- [ ] **Step 8.2: Add `data-testid="quick-add-input"` to the words textarea**

Locate the `<textarea>` users type words into. Add `data-testid="quick-add-input"` to its JSX props. No other change.

- [ ] **Step 8.3: Add `data-testid="quick-add-submit"` to the submit button**

Locate the primary submit button (the one labeled "Add N words to Anki"). Add `data-testid="quick-add-submit"`. No other change.

- [ ] **Step 8.4: Add `data-testid="quick-add-success"` to the success message container**

Locate the element rendered on successful submission (shows "N cards created" and the Enrich/Add More buttons). Add `data-testid="quick-add-success"` to its outer wrapper. No other change.

- [ ] **Step 8.5: Verify build is clean**

Run: `npx tsc --noEmit`
Expected: no new TypeScript errors.

- [ ] **Step 8.6: Commit**

```bash
git add src/app/quick-add/page.tsx
git commit -m "test: add data-testid attributes to Quick Add page for Playwright"
```

---

## Task 9: First Playwright journey test — `quick-add.spec.ts`

**Files:**
- Create: `tests/e2e/quick-add.spec.ts`

**Purpose:** Proof-of-harness e2e test. Creates 3 `__test_*` notes via the UI, verifies they exist via AnkiConnect, then relies on `globalSetup` cleanup for teardown.

- [ ] **Step 9.1: Write the spec**

Create `tests/e2e/quick-add.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { findTestNotes, cleanTestNotes } from "../setup/anki-test-helpers";

test.beforeEach(async () => {
  await cleanTestNotes();
});

test.afterEach(async () => {
  await cleanTestNotes();
});

test("Quick Add creates 3 cards from 3 words", async ({ page }) => {
  await page.goto("/quick-add");

  await page.getByTestId("quick-add-input").fill(
    ["__test_apple", "__test_banana", "__test_cherry"].join("\n")
  );

  await page.getByTestId("quick-add-submit").click();

  await expect(page.getByTestId("quick-add-success")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("quick-add-success")).toContainText("3");

  const ids = await findTestNotes();
  expect(ids.length).toBe(3);
});
```

- [ ] **Step 9.2: Run the test**

**Prerequisites before running:**
1. Anki is running on a profile named `Test` (or any profile with `Gao English Spelling` deck + `school spelling` note type).
2. No other dev server occupies port 3001.
3. There are no existing `__test_*` notes (the test cleans them itself, but verify once up-front).

Run: `npm run test:e2e`

Expected: Playwright launches the dev server with `TEST_MODE=true`, runs the single spec, reports 1 passed. The spec:
- Fills 3 words
- Clicks submit
- Sees the success banner
- Queries AnkiConnect and finds 3 `__test_*` notes
- Cleans them in `afterEach`

If the test fails with "Anki is not reachable", start Anki and re-run. If the dev server fails to start, check for port conflicts.

- [ ] **Step 9.3: Commit**

```bash
git add tests/e2e/quick-add.spec.ts
git commit -m "test: add first Playwright journey test for Quick Add happy path"
```

---

## Task 10: Update `CLAUDE.md` with the three hard rules + scenario table

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 10.1: Read current `CLAUDE.md`**

Read `CLAUDE.md` in full to identify the `## Development Workflow` section and the `## Testing Conventions` section.

- [ ] **Step 10.2: Replace the `## Development Workflow` section**

Replace the existing `## Development Workflow` section (lines containing the 7 numbered steps) with:
```markdown
## Development Workflow

Follow this order for every feature request or change:

1. **Spec first** — write acceptance criteria in the design doc (`docs/superpowers/specs/YYYY-MM-DD-*.md`). These become the test seeds.
2. **Failing test first** — write Vitest or Playwright tests asserting the new behavior (or reproducing the bug) before touching production code.
3. **Test review gate** — present the test diffs + a plain-English summary of each test to the user. Wait for approval before writing any production code. This gate is non-negotiable; even tiny changes require it.
4. **Implement** — write the minimal production code to turn the approved failing tests green.
5. **`npm test`** — run the full suite. All green before committing.
6. **Update Skill** — check if the skill document (`.claude/skills/anki-enrich/SKILL.md`) needs updating for user-facing changes.
7. **Commit** — test change and behavior change ship in the **same commit**. Commit body must include a pass/fail matrix.
8. **CRITICAL — Continue** — NEVER stop after a commit. Either start the next pending item or use `AskUserQuestion` with options.

### The three hard rules

1. **All tests pass before commit.** `npm test` green; agent reports pass/fail matrix in the commit body.
2. **Every user-visible behavior change ships with a test change in the same commit.** New behavior → new test. Changed behavior → updated test. Removed behavior → deleted test.
3. **Test changes are reviewed and approved before implementation begins.** No production code is written against unreviewed tests.

### Scenario playbook

| Scenario | Workflow |
|---|---|
| New feature | Acceptance criteria in spec → failing tests → **user reviews tests** → code → green |
| Bug fix | Failing test that reproduces the bug → **user confirms test reproduces the bug** → fix → green |
| Mid-flight requirement change | Update **spec → tests → user re-reviews → code**, in that order |
| Pure refactor | Zero test changes expected. No review gate needed. |
| Test fails mysteriously | Investigate before skipping. If skipped, add `// TODO(owner, issue)` and flag to user. |
| Test data shape changes | Update the factory (one place), not N fixtures. |
| Test mechanism needs rewrite | Pause — the boundary was probably wrong. |
```

- [ ] **Step 10.3: Replace the `## Testing Conventions` section**

Replace the existing `## Testing Conventions` section with:
```markdown
## Testing Conventions

- **Two executable layers + slim manual plan:**
  - **Vitest** (`tests/unit/`) — boundary tests on `src/lib/*`. Fast, deterministic. Mock AI at the `src/lib/ai.ts` boundary (or rely on the canned backend via `TEST_MODE`).
  - **Playwright** (`tests/e2e/`) — page-level journey tests. Dev server launched with `TEST_MODE=true` so AI is canned.
  - **Manual plan** (`tests/ui-test-plan.md`) — retained for edge cases not worth automating: destructive ops, Telegram races, visual/quality regression of real AI output.
- **Test at behavior, not implementation.** A pure refactor should touch zero tests.
- **Factories over fixtures.** `makeTestCard({ overrides })` in `tests/fixtures/`.
- **Stable selectors.** Playwright uses `data-testid="<feature>-<element>"`. Never CSS paths or text.
- **All test data uses `__test_` prefix.** Cleanup runs before AND after each Playwright spec via `tests/setup/anki-test-helpers.ts`.
- **Run tests on the `Test` Anki profile** to avoid polluting real profiles.
- Edge cases matter — empty states, invalid input, error handling, not just happy paths.
```

- [ ] **Step 10.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with three hard rules and test-review gate"
```

---

## Task 11: Slim `tests/ui-test-plan.md` intro to reflect edge-case-only role

**Files:**
- Modify: `tests/ui-test-plan.md`

- [ ] **Step 11.1: Read the current intro (lines 1–48)**

Read `tests/ui-test-plan.md` lines 1–48 to see the current setup section.

- [ ] **Step 11.2: Prepend a new intro section before line 1**

Prepend the following at the very top of `tests/ui-test-plan.md` (new content, before the existing `# UI Test Plan — Browser Automation` heading):
```markdown
> **Scope note (2026-04-18):** This plan is now a supplement to the executable test suite (`npm test`), not the primary verification mechanism. The executable suite — Vitest in `tests/unit/` and Playwright in `tests/e2e/` — covers the regression-critical happy paths and stable-boundary logic.
>
> This document is retained for:
> - Flows that require a live Telegram bot (timing, multi-message batching, real user interaction).
> - Destructive or timing-sensitive operations that would be brittle to automate (Anki stopped mid-run, profile switch races).
> - Subjective assessment of real-AI output quality.
>
> Most sections below are NOT run on every commit. Use them when manually validating a related change or when investigating a reported bug. For the default definition of "tests pass," see `CLAUDE.md` → `npm test`.

---

```

Do not modify any other content in this file. The existing sections remain valid as a manual reference.

- [ ] **Step 11.3: Commit**

```bash
git add tests/ui-test-plan.md
git commit -m "docs: clarify ui-test-plan.md role as edge-case-only supplement"
```

---

## Task 12: Update `docs/todo.md` to record Phase A completion

**Files:**
- Modify: `docs/todo.md`

- [ ] **Step 12.1: Read current `docs/todo.md`**

Read `docs/todo.md` in full. Locate the `## Recently Completed` section.

- [ ] **Step 12.2: Add entry under `## Recently Completed`**

Insert the following as the first item under `## Recently Completed`:
```markdown
- [x] **Reliable Feature Delivery Workflow — Phase A (Infrastructure)** — Installed Vitest + Playwright. Added `canned` AI backend triggered by `TEST_MODE=true`. Added `makeTestCard` factory, canned enrichment fixtures, Anki `__test_*` cleanup helpers wired to Playwright global setup. Proof-of-harness tests: `card-completeness.test.ts` (Vitest) and `quick-add.spec.ts` (Playwright). CLAUDE.md now encodes the three hard rules (tests pass before commit, test change ships with behavior change, test-review gate before implementation) and the scenario playbook. `tests/ui-test-plan.md` repositioned as edge-case-only supplement. See spec `docs/superpowers/specs/2026-04-18-reliable-feature-delivery-workflow-design.md` and plan `docs/superpowers/plans/2026-04-18-reliable-feature-delivery-workflow.md`. Phase B (pilot feature) is a separate cycle.
```

- [ ] **Step 12.3: Commit**

```bash
git add docs/todo.md
git commit -m "docs: record Phase A completion in todo.md"
```

---

## Task 13: Phase B kickoff (handoff)

**Purpose:** This is not an engineering task but the handoff that ends Phase A. The executing agent should pause here and return control to the user.

- [ ] **Step 13.1: Run the full suite one last time**

Run: `npm test`
Expected: Vitest green (3 tests in `card-completeness.test.ts`), Playwright green (1 spec in `quick-add.spec.ts`).

- [ ] **Step 13.2: Announce Phase A complete and prompt for Phase B**

Present the user with:
```
Phase A complete. The testing infrastructure is live:
- `npm test` runs Vitest (1 file, 3 tests) + Playwright (1 file, 1 test) in < 2 min total
- Canned AI backend active when TEST_MODE=true
- CLAUDE.md encodes the three hard rules and test-review gate

Phase B is the pilot: pick one real feature, run it through the full workflow (spec → failing tests → test-review gate → code → green), deliberately trigger one mid-flight requirement change during it.

What should we pilot with?
```

Use `AskUserQuestion` with three options:
1. **Pick from `docs/todo.md`** — scan the file, list pending items, let user pick.
2. **Propose a new small feature** — user describes it; I enter `superpowers:brainstorming` for it.
3. **Defer Phase B** — stop here; Phase A is valuable on its own.

Once the user picks, invoke `superpowers:brainstorming` for the chosen feature (or stop if option 3). Do NOT write code for the pilot in this session without going through brainstorming → writing-plans first; that is the whole point of the workflow.

---

## Self-review checklist (run after plan is saved)

- [x] **Spec coverage:**
  - Two executable layers (Vitest + Playwright) → Tasks 1, 2, 4, 9
  - Canned AI backend for TEST_MODE → Tasks 5, 6
  - `__test_` prefix cleanup → Task 7
  - Factories over fixtures → Task 3
  - Stable `data-testid` selectors → Task 8
  - Proof-of-harness test per layer → Tasks 4 (Vitest), 9 (Playwright)
  - Three hard rules encoded in `CLAUDE.md` → Task 10
  - `ui-test-plan.md` repositioned → Task 11
  - Phase B kickoff acknowledged, not pre-planned → Task 13

- [x] **No placeholders:** Every code step shows real code. No "TBD" / "TODO" in tasks themselves. (One deliberate TBD for the pilot feature lives in the spec's Open Questions and is resolved via Task 13's `AskUserQuestion`.)

- [x] **Type consistency:** `TestFields`, `CannedEnrichment`, `ImageInput` used consistently. `getAIBackend()` return type extended to include `"canned"` in Task 6 and the `ai.ts` switch matches.

- [x] **Scope:** Phase A only; Phase B deferred to its own cycle as the spec requires.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-reliable-feature-delivery-workflow.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Good for this plan because tasks are independent and each ends in a commit.

2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
