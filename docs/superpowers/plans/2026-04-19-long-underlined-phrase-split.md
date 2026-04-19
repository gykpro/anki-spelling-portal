# Long Underlined Phrase Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split long English underlined phrases (≥5 whitespace tokens) into one card per hard sub-word at worksheet extraction time, and wrap the `{{c1::…}}` cloze directive with `<span class="nodeword">` across all 5 cloze-producing call sites so the Anki card template's `.nodeword` CSS rule actually renders.

**Architecture:** A new pure helper `splitLongPhrasesInPages` is added to `src/lib/enrichment-pipeline.ts` alongside the existing `extractWordsFromSentence`. The `extractFromImages` wrapper (one line today) gains a post-processing step that applies the splitter. The `/api/extract` route is refactored to call `extractFromImages` instead of `runAIVision` directly, so both it and the Telegram bot handlers inherit splitting for free. Separately, all 5 cloze-producing sites (one library function + four inline regexes) are updated to emit the outside-wrap span shape.

**Tech Stack:** TypeScript, Vitest, Next.js 15 App Router, Anthropic SDK Vision, AnkiConnect. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-19-long-underlined-phrase-split-design.md`

**Workflow constraints (from CLAUDE.md):**
- Each behavior-changing task follows TDD: failing test → verify fail → mutation spot-check → **user test-review gate** → implement → green → commit.
- Test change and behavior change ship in the **same commit**.
- Commit body must include pass/fail matrix and mutation kill report.
- After last commit, restart `npm run dev` and update `docs/todo.md`.

---

## File Structure

**Create:**
- `tests/unit/split-long-phrases.test.ts` — Vitest boundary tests for the pure helper (8 tests).

**Modify:**
- `src/lib/enrichment-pipeline.ts` — add exported `splitLongPhrasesInPages`; modify `extractFromImages` to apply it. Add `ExtractedSentence` import.
- `src/app/api/extract/route.ts` — replace direct `runAIVision` call with `extractFromImages`; drop unused `EXTRACTION_PROMPT` / `runAIVision` imports.
- `src/lib/card-builder.ts` — update `buildCloze` to emit outside-wrap span.
- `tests/unit/card-builder.test.ts` — update existing `buildCloze` + `buildSpellingCard` assertions; add two new `buildCloze` tests.
- `src/app/quick-add/page.tsx` — update inline cloze regex replacement (line 39).
- `src/app/enrich/page.tsx` — update inline cloze regex replacement at two sites (lines 586 and 1278).
- `skill/scripts/lib/anki-fields.mjs` — update inline cloze regex replacement (line 28).
- `docs/todo.md` — move feature from Pending to Recently Completed at end.

**Out of scope (flagged in spec):**
- Do **not** refactor inline main-sentence / cloze regexes to share `buildCloze` / `buildMainSentence`. Tracked as separate tech debt in `docs/todo.md`.
- Do **not** remove the dead `<span class="nodeword">` wrapping from `Main Sentence` — it still styles the portal preview UI.
- No Playwright worksheet-upload e2e test (infrastructure task out of scope).
- No Anki template changes (user confirms `.nodeword` CSS rule exists in their template).

---

## Task 1: Refactor `/api/extract/route.ts` to use `extractFromImages`

**Why first:** Pure refactor (no behavior change). Prerequisite for Task 3 — it lets us inject splitting at the `extractFromImages` seam and have both the API route and the Telegram handlers inherit it.

**Files:**
- Modify: `src/app/api/extract/route.ts:1-3, 46`

- [ ] **Step 1: Read current state**

Open `src/app/api/extract/route.ts`. Confirm lines 1–3 import `NextRequest`, `NextResponse`, `runAIVision`, and `EXTRACTION_PROMPT`, and line 46 reads `const pages = await runAIVision(EXTRACTION_PROMPT, images);`. If state differs, stop and reconcile before proceeding.

- [ ] **Step 2: Edit imports**

Replace the top-of-file import block (lines 1–3):

```ts
import { NextRequest, NextResponse } from "next/server";
import { runAIVision } from "@/lib/ai";
import { EXTRACTION_PROMPT } from "@/lib/enrichment-pipeline";
```

with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { extractFromImages } from "@/lib/enrichment-pipeline";
```

- [ ] **Step 3: Edit the Vision call**

Replace line 46 (inside the POST handler):

```ts
    const pages = await runAIVision(EXTRACTION_PROMPT, images);
```

with:

```ts
    const pages = await extractFromImages(images);
```

- [ ] **Step 4: Run the full test suite — expect all green**

Run: `npm test`
Expected: all Vitest + Playwright tests pass. Nothing should have changed behaviorally.

If anything fails, stop and investigate before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/extract/route.ts
git commit -m "$(cat <<'EOF'
refactor: route /api/extract through extractFromImages

Pure refactor. The route was calling runAIVision(EXTRACTION_PROMPT,
images) directly and duplicating the wiring that extractFromImages
already encapsulates. Routing through extractFromImages sets up the
shared seam for an upcoming splitLongPhrasesInPages post-processor
(separate commit) and keeps the Telegram bot handlers and the API
route in sync automatically.

No behavior change. Full npm test green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `splitLongPhrasesInPages` pure helper (TDD)

**Files:**
- Create: `tests/unit/split-long-phrases.test.ts`
- Modify: `src/lib/enrichment-pipeline.ts` (add export; add `ExtractedSentence` to existing type import)

### Step A: Write the failing tests

- [ ] **A.1: Create the test file**

Create `tests/unit/split-long-phrases.test.ts` with this exact content:

```ts
import { describe, it, expect, vi } from "vitest";
import { splitLongPhrasesInPages } from "@/lib/enrichment-pipeline";
import type { ExtractedPage } from "@/types/spelling";
import type { LanguageConfig } from "@/lib/languages";

function makePage(overrides: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    pageNumber: 1,
    termWeek: "Term 1 Week 1",
    topic: "Test Topic",
    sentences: [],
    ...overrides,
  };
}

describe("splitLongPhrasesInPages", () => {
  it("leaves English words below 5-token threshold untouched and does not call the extractor", async () => {
    const extractor = vi.fn<(s: string, l: LanguageConfig) => Promise<string[]>>();
    const input = [
      makePage({
        sentences: [
          { number: 1, sentence: "I ate an apple.", word: "an apple" },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      { number: 1, sentence: "I ate an apple.", word: "an apple" },
    ]);
    expect(extractor).not.toHaveBeenCalled();
  });

  it("splits at exactly 5 tokens (threshold boundary)", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["carefully", "slowly"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "He walks carefully and slowly.",
            word: "walks carefully and slowly over",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences.map((s) => s.word)).toEqual([
      "carefully",
      "slowly",
    ]);
    expect(extractor).toHaveBeenCalledOnce();
  });

  it("splits the motivating 9-token example and preserves sentence context", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["infinitely", "trillions"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence:
              "Outer space is an infinitely huge place with trillions of stars.",
            word: "an infinitely huge place with trillions of stars",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence:
          "Outer space is an infinitely huge place with trillions of stars.",
        word: "infinitely",
      },
      {
        number: 1,
        sentence:
          "Outer space is an infinitely huge place with trillions of stars.",
        word: "trillions",
      },
    ]);
    expect(extractor).toHaveBeenCalledWith(
      "an infinitely huge place with trillions of stars",
      expect.objectContaining({ id: "english" }),
    );
  });

  it("leaves Chinese entries untouched regardless of length and does not call the extractor", async () => {
    const extractor = vi.fn<(s: string, l: LanguageConfig) => Promise<string[]>>();
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "长句子很长。",
            word: "无边无际的宇宙中有数万亿颗星星",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "长句子很长。",
        word: "无边无际的宇宙中有数万亿颗星星",
      },
    ]);
    expect(extractor).not.toHaveBeenCalled();
  });

  it("falls back to the original entry when the extractor resolves to an empty array", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue([]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "A long phrase goes here indeed.",
            word: "a long phrase goes here indeed",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "A long phrase goes here indeed.",
        word: "a long phrase goes here indeed",
      },
    ]);
  });

  it("falls back to the original entry when the extractor rejects and warns to the console", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockRejectedValue(new Error("boom"));
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "A long phrase goes here indeed.",
            word: "a long phrase goes here indeed",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "A long phrase goes here indeed.",
        word: "a long phrase goes here indeed",
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("preserves the parent entry's number and sentence on every emitted sub-word entry", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["alpha", "beta", "gamma"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 7,
            sentence: "The quick brown fox jumps over there.",
            word: "quick brown fox jumps over there",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toHaveLength(3);
    for (const entry of result[0].sentences) {
      expect(entry.number).toBe(7);
      expect(entry.sentence).toBe("The quick brown fox jumps over there.");
    }
  });

  it("dedupes hard words that already appear as words on other entries of the same page (case-insensitive)", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["Infinitely", "TRILLIONS"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence:
              "Outer space is an infinitely huge place with trillions of stars.",
            word: "an infinitely huge place with trillions of stars",
          },
          {
            number: 2,
            sentence: "Trillions everywhere.",
            word: "trillions",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence:
          "Outer space is an infinitely huge place with trillions of stars.",
        word: "Infinitely",
      },
      {
        number: 2,
        sentence: "Trillions everywhere.",
        word: "trillions",
      },
    ]);
  });
});
```

- [ ] **A.2: Run the new tests — expect them to fail**

Run: `npm run test:unit -- tests/unit/split-long-phrases.test.ts`
Expected: all 8 tests fail. Failure message should indicate `splitLongPhrasesInPages` is not exported from `@/lib/enrichment-pipeline` (TypeScript compile error or `undefined is not a function`).

### Step B: Implement the helper

- [ ] **B.1: Add the import for `ExtractedSentence`**

Open `src/lib/enrichment-pipeline.ts`. Find the existing import near the top of the file:

```ts
import type { ExtractedPage, SpellingCard } from "@/types/spelling";
```

Replace it with:

```ts
import type { ExtractedPage, ExtractedSentence, SpellingCard } from "@/types/spelling";
```

- [ ] **B.2: Add `splitLongPhrasesInPages` and its helper `splitPage`**

Insert this code block into `src/lib/enrichment-pipeline.ts` **immediately after** the closing brace of `extractWordsFromSentence` (end of the function defined starting at line 317, which currently ends around line 344):

```ts
/**
 * Post-process extracted pages: for English entries whose `word` is ≥5
 * whitespace-separated tokens, replace the single long-phrase entry with
 * one entry per hard sub-word returned by the extractor. All emitted
 * sub-word entries inherit the parent entry's `number` and `sentence`.
 *
 * - Chinese entries are never split.
 * - Empty extractor response, extractor throw, or all-dedupe → fall back
 *   to the original entry (one bad line never poisons the batch).
 * - Dedup within a page: if a hard word already exists as another entry's
 *   `word` on the same page, it's dropped (case-insensitive).
 *
 * Pure: no external side effects except a console.warn on extractor throw.
 * The extractor is injected for testability; production passes
 * extractWordsFromSentence.
 */
export async function splitLongPhrasesInPages(
  pages: ExtractedPage[],
  extractor: (
    s: string,
    l: LanguageConfig,
  ) => Promise<string[]> = extractWordsFromSentence,
): Promise<ExtractedPage[]> {
  return Promise.all(pages.map((page) => splitPage(page, extractor)));
}

async function splitPage(
  page: ExtractedPage,
  extractor: (s: string, l: LanguageConfig) => Promise<string[]>,
): Promise<ExtractedPage> {
  const existingWords = new Set(
    page.sentences.map((s) => s.word.toLowerCase()),
  );
  const englishLang = getLanguageById("english");

  const results: ExtractedSentence[][] = await Promise.all(
    page.sentences.map(async (entry) => {
      if (detectLanguage(entry.word).id !== "english") return [entry];
      if (entry.word.trim().split(/\s+/).length < 5) return [entry];

      let hardWords: string[];
      try {
        hardWords = await extractor(entry.word, englishLang);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[splitLongPhrasesInPages] extractor threw on "${entry.word}": ${msg}`,
        );
        return [entry];
      }
      if (hardWords.length === 0) return [entry];

      const deduped = hardWords.filter(
        (w) => !existingWords.has(w.toLowerCase()),
      );
      if (deduped.length === 0) return [entry];

      return deduped.map((word) => ({
        number: entry.number,
        sentence: entry.sentence,
        word,
      }));
    }),
  );

  return { ...page, sentences: results.flat() };
}
```

- [ ] **B.3: Run the new tests — expect all 8 to pass**

Run: `npm run test:unit -- tests/unit/split-long-phrases.test.ts`
Expected: all 8 tests pass.

If any fail, debug — do not proceed to the mutation check until green.

- [ ] **B.4: Run the full Vitest suite — expect no regressions**

Run: `npm run test:unit`
Expected: all Vitest tests pass (previous 44 + new 8 = 52).

### Step C: Mutation spot-check (mandatory per CLAUDE.md)

For each mutation below, apply it to production code, run the test file, confirm at least one test fails, then **revert** the mutation. Record the failing test names in the kill report.

- [ ] **C.1: M1 — flip the length threshold**

In `src/lib/enrichment-pipeline.ts :: splitPage`, change:

```ts
      if (entry.word.trim().split(/\s+/).length < 5) return [entry];
```

to:

```ts
      if (entry.word.trim().split(/\s+/).length <= 5) return [entry];
```

Run: `npm run test:unit -- tests/unit/split-long-phrases.test.ts`
Expected: "splits at exactly 5 tokens (threshold boundary)" fails.

Revert the mutation.

- [ ] **C.2: M2 — remove the language gate**

In `src/lib/enrichment-pipeline.ts :: splitPage`, remove (or comment out) this line:

```ts
      if (detectLanguage(entry.word).id !== "english") return [entry];
```

Run: `npm run test:unit -- tests/unit/split-long-phrases.test.ts`
Expected: "leaves Chinese entries untouched regardless of length…" fails (the extractor is now called for Chinese input, and assertion on `extractor.not.toHaveBeenCalled()` fails).

Revert the mutation.

- [ ] **C.3: M3 — remove the empty-response fallback**

In `src/lib/enrichment-pipeline.ts :: splitPage`, change:

```ts
      if (hardWords.length === 0) return [entry];
```

to:

```ts
      // if (hardWords.length === 0) return [entry];
```

Run: `npm run test:unit -- tests/unit/split-long-phrases.test.ts`
Expected: "falls back to the original entry when the extractor resolves to an empty array" fails (the entry disappears from output).

Revert the mutation.

- [ ] **C.4: Record the kill report**

Write down verbatim for inclusion in the commit body and the test-review gate message. Template:

```
Mutation kill report
  M1 (<5 → <=5 threshold):  killed by "splits at exactly 5 tokens (threshold boundary)"
  M2 (remove lang gate):     killed by "leaves Chinese entries untouched regardless of length and does not call the extractor"
  M3 (remove empty fallback): killed by "falls back to the original entry when the extractor resolves to an empty array"
```

### Step D: Test-review gate — present to user and WAIT

- [ ] **D.1: Present the tests + kill report to the user**

Send the user the new test file `tests/unit/split-long-phrases.test.ts`, a plain-English summary of each of the 8 tests, and the mutation kill report from C.4. Ask:

> "Tests + mutation kill report ready for your review before I commit. Approve (go to Step E commit), or request changes?"

Use `AskUserQuestion` with options "Approve and commit" / "Request changes".

- [ ] **D.2: Wait for explicit approval**

**Do not proceed to Step E until the user approves.** If the user requests changes, make them, re-run mutation check, re-present, and loop.

### Step E: Commit

- [ ] **E.1: Commit test + implementation together**

```bash
git add tests/unit/split-long-phrases.test.ts src/lib/enrichment-pipeline.ts
git commit -m "$(cat <<'EOF'
feat: add splitLongPhrasesInPages pure helper (8 tests green)

Post-processor for worksheet extraction. For each English entry whose
word is ≥5 whitespace tokens, replace the long-phrase entry with one
entry per hard sub-word returned by the injected extractor (default:
extractWordsFromSentence). Sub-words inherit the parent entry's number
and sentence. Chinese entries skip the splitter. Empty result,
extractor throw, and all-dedupe each fall back to the original entry.

Helper is pure and testable; wiring into extractFromImages lands in the
next commit.

Pass/fail matrix
  tests/unit/split-long-phrases.test.ts: 8/8 pass
  all other Vitest suites:               44/44 pass (unchanged)
  npm test: green

Mutation kill report
  M1 (<5 → <=5 threshold):    killed by "splits at exactly 5 tokens"
  M2 (remove lang gate):      killed by "leaves Chinese entries untouched"
  M3 (remove empty fallback): killed by "falls back…empty array"

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire splitter into `extractFromImages`

**Files:**
- Modify: `src/lib/enrichment-pipeline.ts:1116-1120`

**Why no new test:** The splitter is independently tested in Task 2. `extractFromImages` becomes a trivial two-line composition (`runAIVision` → `splitLongPhrasesInPages`); test-at-the-seam is the pure helper, not the composition. This matches the spec's testing plan.

- [ ] **Step 1: Edit `extractFromImages`**

In `src/lib/enrichment-pipeline.ts`, replace:

```ts
export async function extractFromImages(
  images: ImageInput[]
): Promise<ExtractedPage[]> {
  return runAIVision<ExtractedPage[]>(EXTRACTION_PROMPT, images);
}
```

with:

```ts
export async function extractFromImages(
  images: ImageInput[]
): Promise<ExtractedPage[]> {
  const pages = await runAIVision<ExtractedPage[]>(EXTRACTION_PROMPT, images);
  return splitLongPhrasesInPages(pages);
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all green. No test changes are expected because the splitter is a no-op on short English words and Chinese words, and no existing tests pass long English phrases through `extractFromImages`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/enrichment-pipeline.ts
git commit -m "$(cat <<'EOF'
feat: wire splitLongPhrasesInPages into extractFromImages

Worksheet photo and document uploads now split long English underlined
phrases into one card per hard sub-word automatically. Both the
/api/extract route (after the Task 1 refactor) and the Telegram bot's
photo/document handlers call extractFromImages, so both inherit the
split with no call-site change.

No additional tests — the splitter is covered at the pure-helper seam
by tests/unit/split-long-phrases.test.ts (8/8 pass).

Pass/fail matrix
  npm test: green (52 Vitest + 1 Playwright)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wrap the cloze directive in `buildCloze` (TDD)

**Files:**
- Modify: `tests/unit/card-builder.test.ts:28-58` (update existing + add two tests)
- Modify: `src/lib/card-builder.ts:24-30` (`buildCloze`)

### Step A: Write/update the failing tests

- [ ] **A.1: Update the two existing `buildCloze` assertions**

In `tests/unit/card-builder.test.ts`, replace the entire `describe("buildCloze", …)` block (currently lines 27–35):

```ts
describe("buildCloze", () => {
  it("replaces the word with {{c1::word}}", () => {
    expect(buildCloze("I ate an apple.", "apple")).toBe("I ate an {{c1::apple}}.");
  });

  it("matches case-insensitively", () => {
    expect(buildCloze("Apple pie is great.", "apple")).toBe("{{c1::Apple}} pie is great.");
  });
});
```

with:

```ts
describe("buildCloze", () => {
  it("wraps the cloze directive with <span class='nodeword'>", () => {
    expect(buildCloze("I ate an apple.", "apple")).toBe(
      'I ate an <span class="nodeword">{{c1::apple}}</span>.',
    );
  });

  it("matches case-insensitively and preserves original case inside the cloze directive", () => {
    expect(buildCloze("Apple pie is great.", "apple")).toBe(
      '<span class="nodeword">{{c1::Apple}}</span> pie is great.',
    );
  });

  it("escapes regex special characters in the word", () => {
    expect(buildCloze("He's at the café.", "he's")).toBe(
      '<span class="nodeword">{{c1::He\'s}}</span> at the café.',
    );
  });
});
```

- [ ] **A.2: Update the existing `buildSpellingCard` assertion**

In `tests/unit/card-builder.test.ts`, find the existing test (currently line 57):

```ts
    expect(card.cloze).toBe("I ate an {{c1::apple}}.");
```

Replace with:

```ts
    expect(card.cloze).toBe('I ate an <span class="nodeword">{{c1::apple}}</span>.');
```

- [ ] **A.3: Run the updated tests — expect buildCloze + buildSpellingCard failures**

Run: `npm run test:unit -- tests/unit/card-builder.test.ts`
Expected: the three `buildCloze` tests and the one `buildSpellingCard` test fail with "received 'I ate an {{c1::apple}}.' / expected 'I ate an `<span class="nodeword">{{c1::apple}}</span>`.'" (or equivalent diffs). Other tests in the file (`buildMainSentence`, `cardToAnkiNote`) still pass.

### Step B: Implement the behavior change

- [ ] **B.1: Edit `buildCloze`**

In `src/lib/card-builder.ts`, replace the function body (currently lines 24–30):

```ts
export function buildCloze(sentence: string, word: string): string {
  const regex = new RegExp(
    `(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "i"
  );
  return sentence.replace(regex, "{{c1::$1}}");
}
```

with:

```ts
export function buildCloze(sentence: string, word: string): string {
  const regex = new RegExp(
    `(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "i"
  );
  return sentence.replace(regex, '<span class="nodeword">{{c1::$1}}</span>');
}
```

- [ ] **B.2: Run the updated tests — expect all pass**

Run: `npm run test:unit -- tests/unit/card-builder.test.ts`
Expected: all tests in `tests/unit/card-builder.test.ts` pass.

- [ ] **B.3: Run the full Vitest suite**

Run: `npm run test:unit`
Expected: all 53 Vitest tests pass (52 after Task 2 + 1 net-new buildCloze test from A.1; the other two are updated in-place).

### Step C: Mutation spot-check

- [ ] **C.1: M4 — drop the span wrapper from `buildCloze`**

In `src/lib/card-builder.ts :: buildCloze`, change the replacement back to:

```ts
  return sentence.replace(regex, "{{c1::$1}}");
```

Run: `npm run test:unit -- tests/unit/card-builder.test.ts`
Expected: the three updated `buildCloze` tests and the updated `buildSpellingCard` test fail.

Revert the mutation.

- [ ] **C.2: M5 — typo the class name**

In `src/lib/card-builder.ts :: buildCloze`, change:

```ts
  return sentence.replace(regex, '<span class="nodeword">{{c1::$1}}</span>');
```

to:

```ts
  return sentence.replace(regex, '<span class="wordnode">{{c1::$1}}</span>');
```

Run: `npm run test:unit -- tests/unit/card-builder.test.ts`
Expected: the three `buildCloze` tests that assert the class name and the `buildSpellingCard` test fail.

Revert the mutation.

- [ ] **C.3: Record the kill report**

```
Mutation kill report
  M4 (drop span wrapper): killed by "wraps the cloze directive with <span class='nodeword'>" and 2 others
  M5 (nodeword → wordnode): killed by "wraps the cloze directive with <span class='nodeword'>" and 2 others
```

### Step D: Test-review gate

- [ ] **D.1: Present to user**

Send the user the diff for `tests/unit/card-builder.test.ts`, a plain-English summary of each test (including the two new ones), and the M4/M5 kill report. Ask:

> "buildCloze test changes + M4/M5 mutation kill report ready for your review. Approve commit, or request changes?"

Use `AskUserQuestion` with options "Approve and commit" / "Request changes".

- [ ] **D.2: Wait for explicit approval.** Do not proceed until approved.

### Step E: Commit

- [ ] **E.1: Commit library change + test change together**

```bash
git add src/lib/card-builder.ts tests/unit/card-builder.test.ts
git commit -m "$(cat <<'EOF'
feat: wrap cloze directive with <span class="nodeword"> in buildCloze

The user's Anki card template uses the Cloze field (not Main Sentence)
for the main display and styles .nodeword from the template CSS. Today's
Main Sentence span was a no-op in Anki. Outside-wrap applies on both the
cloze-hidden front card (spans [...] placeholder) and the cloze-shown
back card (spans the word). Paired with tests/unit/card-builder.test.ts
updates in the same commit per the three hard rules. The four inline
cloze regex sites are updated in the next commit (tracked separately
to keep the test boundary clean).

Pass/fail matrix
  tests/unit/card-builder.test.ts: 13/13 pass (buildCloze: 2 updated
                                                + 1 net-new; 1
                                                buildSpellingCard
                                                assertion updated;
                                                9 other tests unchanged)
  all Vitest suites total:         53/53 pass
  npm test: green

Mutation kill report
  M4 (drop span wrapper):        killed by "wraps the cloze directive…"
  M5 (nodeword → wordnode class): killed by "wraps the cloze directive…"

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update the four inline cloze call sites

**Files:**
- Modify: `src/app/quick-add/page.tsx:39`
- Modify: `src/app/enrich/page.tsx:586, 1278`
- Modify: `skill/scripts/lib/anki-fields.mjs:28`

**Why no new unit tests:** The spec explicitly accepts that the four inline sites mirror `buildCloze` without direct coverage (refactoring them to share `buildCloze` is flagged as separate tech debt). `buildCloze` unit tests + Task 4's mutation check cover the contract; the inline sites are direct mirror edits.

- [ ] **Step 1: Edit `src/app/quick-add/page.tsx`**

Find line 39 (inside `buildQuickAddFields`):

```ts
    cloze = sentence.replace(regex, "{{c1::$1}}");
```

Replace with:

```ts
    cloze = sentence.replace(regex, '<span class="nodeword">{{c1::$1}}</span>');
```

- [ ] **Step 2: Edit `src/app/enrich/page.tsx` (first site)**

Find line 586 (inside the save handler near line 570–595):

```ts
      fields["Cloze"] = sent.replace(regex, "{{c1::$1}}");
```

Replace with:

```ts
      fields["Cloze"] = sent.replace(regex, '<span class="nodeword">{{c1::$1}}</span>');
```

- [ ] **Step 3: Edit `src/app/enrich/page.tsx` (second site)**

Find line 1278 (inside the auto-enrich save loop near line 1265–1290):

```ts
        fields["Cloze"] = item.sentence.replace(regex, "{{c1::$1}}");
```

Replace with:

```ts
        fields["Cloze"] = item.sentence.replace(regex, '<span class="nodeword">{{c1::$1}}</span>');
```

- [ ] **Step 4: Edit `skill/scripts/lib/anki-fields.mjs`**

Find line 28 (inside `mapEnrichResultToAnkiFields`):

```js
    fields["Cloze"] = result.sentence.replace(regex, "{{c1::$1}}");
```

Replace with:

```js
    fields["Cloze"] = result.sentence.replace(regex, '<span class="nodeword">{{c1::$1}}</span>');
```

- [ ] **Step 5: Run the full test suite — expect green**

Run: `npm test`
Expected: all tests pass. `buildCloze` and the Playwright quick-add spec still pass; no test currently asserts cloze markup on the inline sites specifically, so nothing new to verify here.

- [ ] **Step 6: Commit**

```bash
git add src/app/quick-add/page.tsx src/app/enrich/page.tsx skill/scripts/lib/anki-fields.mjs
git commit -m "$(cat <<'EOF'
feat: wrap inline cloze regexes with <span class="nodeword">

Four sites that inline the same regex logic as buildCloze are updated
to emit the new outside-wrap span shape:
- src/app/quick-add/page.tsx (buildQuickAddFields)
- src/app/enrich/page.tsx (manual save handler)
- src/app/enrich/page.tsx (auto-enrich save loop)
- skill/scripts/lib/anki-fields.mjs (skill script)

These mirror the buildCloze contract verified in the previous commit.
Deduplicating them against buildCloze is tracked as separate tech debt
in docs/todo.md.

Pass/fail matrix
  npm test: green (53 Vitest + 1 Playwright)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Restart dev server and smoke-verify

Per CLAUDE.md's Service Restart rule: the Telegram bot and Next.js dev server load code at startup and won't pick up the changes without a restart.

**No commit at this task — verification only.**

- [ ] **Step 1: Stop any running dev server**

The project's dev server listens on port 3001 (Playwright reserves it per resume.md). Also check 3000 in case the user has one running manually.

Run:

```bash
lsof -ti:3001 | xargs -r kill
lsof -ti:3000 | xargs -r kill
```

Expected: no error. If a process was running, it's now stopped.

- [ ] **Step 2: Start the dev server in the background**

Run (in a background shell): `npm run dev`
Wait ~10s for startup.

- [ ] **Step 3: Verify health**

Run:

```bash
curl -sS http://localhost:3001/api/health
```

Expected: a 200 response with JSON body. If not healthy, investigate before proceeding.

- [ ] **Step 4: Manual smoke-test**

Ask the user to upload a worksheet containing at least one line with a long (≥5-token) underlined English phrase, via `/upload` or Telegram. Confirm:

- The review UI shows N sub-word cards (not one long-phrase card) for that line.
- Each sub-word card's `Cloze` field, once saved, contains `<span class="nodeword">{{c1::<word>}}</span>` (inspect via Anki's card browser or the portal's Word Detail Drawer on `/browse`).
- Short-phrase lines (<5 words) still produce one card as before.
- Chinese worksheet uploads, if the user has any, still produce one card per entry.

If the smoke test fails, stop and debug before Task 7.

---

## Task 7: Update `docs/todo.md`

- [ ] **Step 1: Move the feature from Pending to Recently Completed**

Open `docs/todo.md`. Remove the current Pending entry:

```md
- [ ] **Long underlined phrase split + cloze span-wrap (English worksheet)** — …
```

Add (as a new `[x]` entry at the top of the "Recently Completed" section):

```md
- [x] **Long underlined phrase split + cloze span-wrap (English worksheet)** — `splitLongPhrasesInPages` post-processor inside `extractFromImages` splits English worksheet lines whose underlined span is ≥5 whitespace tokens into one card per hard sub-word (each sharing the original sentence). `buildCloze` and four inline cloze sites now emit `<span class="nodeword">{{c1::…}}</span>` so the Anki template's `.nodeword` CSS rule renders the highlight. Chinese, Quick Add sentence, Telegram sentence, idiom (<5 words), and dictation-section paths unchanged. Spec: `docs/superpowers/specs/2026-04-19-long-underlined-phrase-split-design.md`. Plan: `docs/superpowers/plans/2026-04-19-long-underlined-phrase-split.md`.
```

Leave the separate "Tech debt: deduplicate cloze/main-sentence regex" Pending entry as-is — it remains open.

- [ ] **Step 2: Commit**

```bash
git add docs/todo.md
git commit -m "$(cat <<'EOF'
docs: record long-phrase split + cloze span-wrap completion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification checklist (run after Task 7)

- [ ] `git log --oneline` shows 5 feature commits + 1 docs commit on master (plus the earlier spec commits).
- [ ] `npm test` is green on the final state.
- [ ] `docs/todo.md` shows the feature under "Recently Completed" and the tech-debt follow-up still under "Pending".
- [ ] Dev server on port 3001 serving the updated code.

---

## Spec → Plan coverage map

| Spec item | Task |
|---|---|
| Goal 1 — splitLongPhrasesInPages pure helper | Task 2 |
| Goal 1 — wire via extractFromImages seam | Tasks 1 + 3 |
| Goal 2 — buildCloze library change | Task 4 |
| Goal 2 — four inline call sites | Task 5 |
| Testing plan — 8 splitter tests | Task 2 Step A |
| Testing plan — updated + new buildCloze tests | Task 4 Step A |
| Mutation M1–M3 | Task 2 Step C |
| Mutation M4–M5 | Task 4 Step C |
| Rollout — dev server restart, smoke test | Task 6 |
| Rollout — Anki template CSS verification | Task 6 Step 4 (user) |
| Non-goal — no refactor of inline sites to share buildCloze | Task 5 explicit note + docs/todo.md |
| Non-goal — no Playwright worksheet e2e | Task 6 manual smoke only |
