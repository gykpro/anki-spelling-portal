# Phase A.5 Shared-Core Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~29 Vitest boundary tests on the shared core (languages, card-builder, telegram/intent, enrichment-pipeline pure helpers), with a test-review gate before every commit — piloting the Phase A workflow.

**Architecture:** Four Vitest test files, one per boundary, each a pure-function test. No mocking. New fixture factory (`makeSpellingCard`) for `card-builder` tests.

**Tech Stack:** Vitest 2.1, TypeScript, existing `@/` path alias, existing `makeTestCard` factory pattern.

**Spec:** `docs/superpowers/specs/2026-04-18-phase-a5-shared-core-coverage-design.md`

**Pilot contract (read before starting):**

- After each boundary's tests are written and green, the executing agent **pauses** and presents the test diff + plain-English summary to the user via `AskUserQuestion`. Wait for approval. This is non-negotiable; it is the workflow we are piloting.
- If the user requests additions ("also test X"), add them and re-present. Treat one such round per boundary as expected.
- If any test fails because of a real bug in existing production code, fix the production code in the **same commit** as the test. Per rule #2.
- Do not batch multiple boundaries into one commit. Each boundary is its own commit.

---

## File Structure

**New files:**
- `tests/unit/languages.test.ts` — `detectLanguage` + `isSentenceInput` tests (Task 2)
- `tests/unit/card-builder.test.ts` — `buildMainSentence` / `buildCloze` / `buildSpellingCard` / `cardToAnkiNote` tests (Task 3)
- `tests/unit/telegram-intent.test.ts` — `detectIntent` tests (Task 4)
- `tests/unit/enrichment-pipeline-helpers.test.ts` — `pinyinToNumbered` + `extractJsonArray` tests (Task 5)
- `tests/fixtures/make-spelling-card.ts` — `makeSpellingCard({ overrides })` factory (Task 3)

**Modified files:**
- `docs/todo.md` — Phase A.5 recently-completed entry (Task 6)

**Branch:** `feat/phase-a5-shared-core-tests` (created in Task 1, merged to master at the end).

---

## Task 1: Create feature branch

**Files:** none (git state only)

- [ ] **Step 1.1: Verify on master and clean**

Run: `git branch --show-current && git status --short`
Expected: Current branch is `master`; only untracked `.claude/resume.md` and unstaged `.claude/settings.local.json` (pre-existing; ignore). No other changes.

If there are unexpected changes, stop and ask the user.

- [ ] **Step 1.2: Create the branch**

Run: `git checkout -b feat/phase-a5-shared-core-tests`
Expected: Output `Switched to a new branch 'feat/phase-a5-shared-core-tests'`.

No commit needed yet — first commit will be Task 2.

---

## Task 2: Boundary 1 — `languages.test.ts`

**Files:**
- Create: `tests/unit/languages.test.ts`

- [ ] **Step 2.1: Write the test file**

Create `tests/unit/languages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectLanguage, isSentenceInput, getLanguageById } from "@/lib/languages";

describe("detectLanguage", () => {
  it("returns English config for English-only text", () => {
    expect(detectLanguage("apple").id).toBe("english");
  });

  it("returns Chinese config for text containing CJK characters", () => {
    expect(detectLanguage("苹果").id).toBe("chinese");
  });

  it("returns Chinese config for mixed text containing at least one CJK char", () => {
    expect(detectLanguage("apple 苹果").id).toBe("chinese");
  });

  it("returns English config for empty string (default fallback)", () => {
    expect(detectLanguage("").id).toBe("english");
  });

  it("returns the same object as getLanguageById for each id", () => {
    expect(detectLanguage("apple")).toBe(getLanguageById("english"));
    expect(detectLanguage("苹果")).toBe(getLanguageById("chinese"));
  });
});

describe("isSentenceInput", () => {
  it("returns false for a single English word", () => {
    expect(isSentenceInput("apple")).toBe(false);
  });

  it("returns true for an English sentence with 4+ words ending in '.'", () => {
    expect(isSentenceInput("I ate an apple yesterday.")).toBe(true);
  });

  it("returns false for a short Chinese word (≤5 chars)", () => {
    expect(isSentenceInput("苹果")).toBe(false);
    expect(isSentenceInput("美丽世界")).toBe(false);
  });

  it("returns true for long Chinese text (>5 chars) without punctuation", () => {
    expect(isSentenceInput("今天天气非常好我们出去玩吧")).toBe(true);
  });

  it("returns true for Chinese text ending with '？' or '。'", () => {
    expect(isSentenceInput("你好吗？")).toBe(true);
    expect(isSentenceInput("很好。")).toBe(true);
  });

  it("returns true for English text ending with '!'", () => {
    expect(isSentenceInput("What a great day!")).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run the test file**

Run: `npm run test:unit -- tests/unit/languages.test.ts`
Expected: All 11 tests (5 in `detectLanguage` + 6 in `isSentenceInput`) pass. Runtime <1s.

If any test fails:
- Inspect the source (`src/lib/languages.ts`) to determine whether the test or the production code is wrong.
- If test is wrong: adjust assertions to match actual correct behavior and document why.
- If code is wrong: prepare the fix for inclusion in the same commit.
- Re-run until green. Do not proceed to the gate with failures.

- [ ] **Step 2.3: Test-review gate (PAUSE)**

Before committing, present the following to the user via `AskUserQuestion`:

1. The full diff of `tests/unit/languages.test.ts` (use `git diff --stat` and `git diff` on the untracked file with `git add -N` first if needed; or paste the file content).
2. A plain-English summary of each test:
   - `detectLanguage`: 5 tests covering English, Chinese, mixed, empty, and identity check against `getLanguageById`.
   - `isSentenceInput`: 6 tests covering English word (not sentence), English full sentence, short Chinese (not sentence), long Chinese (sentence), Chinese punctuation, English `!`.
3. Ask via `AskUserQuestion` with options:
   - Approved — commit.
   - Add more assertions (specify which).
   - Reject — rework.

Wait for the user's answer. If they request additions, add them, re-run tests, re-present. Only proceed once approved.

- [ ] **Step 2.4: Commit**

```bash
git add tests/unit/languages.test.ts
git commit -m "$(cat <<'EOF'
test: add Vitest coverage for src/lib/languages.ts (11 tests, green)

detectLanguage: English / Chinese / mixed / empty / identity.
isSentenceInput: short word / English sentence / short Chinese / long Chinese / Chinese punctuation / English !.

Part of Phase A.5 shared-core coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the test run in Step 2.2 required a production code fix, `git add` the modified source file too.

---

## Task 3: Boundary 2 — `card-builder.test.ts` + `makeSpellingCard` factory

**Files:**
- Create: `tests/fixtures/make-spelling-card.ts`
- Create: `tests/unit/card-builder.test.ts`

- [ ] **Step 3.1: Create `makeSpellingCard` factory**

Create `tests/fixtures/make-spelling-card.ts`:
```ts
import type { SpellingCard } from "@/types/spelling";

/**
 * Factory for SpellingCard fixtures. All fields overridable.
 * Default is an English card with a filled sentence.
 */
export function makeSpellingCard(overrides: Partial<SpellingCard> = {}): SpellingCard {
  return {
    id: "test-card-1",
    word: "apple",
    sentence: "I ate an apple.",
    mainSentence: "",
    cloze: "",
    termWeek: "Term 1 Week 1",
    topic: "Fruit",
    edited: false,
    ...overrides,
  };
}
```

- [ ] **Step 3.2: Write the test file**

Create `tests/unit/card-builder.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  buildMainSentence,
  buildCloze,
  buildSpellingCard,
  cardToAnkiNote,
} from "@/lib/card-builder";
import { makeSpellingCard } from "../fixtures/make-spelling-card";

describe("buildMainSentence", () => {
  it("wraps the word in <span class='nodeword'>", () => {
    const result = buildMainSentence("I ate an apple.", "apple");
    expect(result).toBe('I ate an <span class="nodeword">apple</span>.');
  });

  it("matches case-insensitively but preserves original case", () => {
    const result = buildMainSentence("Apple pie is great.", "apple");
    expect(result).toBe('<span class="nodeword">Apple</span> pie is great.');
  });

  it("escapes regex special characters in the word", () => {
    const result = buildMainSentence("He's at the café.", "he's");
    expect(result).toBe('<span class="nodeword">He\'s</span> at the café.');
  });
});

describe("buildCloze", () => {
  it("replaces the word with {{c1::word}}", () => {
    expect(buildCloze("I ate an apple.", "apple")).toBe("I ate an {{c1::apple}}.");
  });

  it("matches case-insensitively", () => {
    expect(buildCloze("Apple pie is great.", "apple")).toBe("{{c1::Apple}} pie is great.");
  });
});

describe("buildSpellingCard", () => {
  it("leaves mainSentence and cloze empty when sentence is empty", () => {
    const card = buildSpellingCard(
      { number: 1, word: "apple", sentence: "" },
      "Term 1 Week 1",
      "Fruit"
    );
    expect(card.mainSentence).toBe("");
    expect(card.cloze).toBe("");
    expect(card.word).toBe("apple");
    expect(card.sentence).toBe("");
  });

  it("populates mainSentence and cloze when sentence is non-empty", () => {
    const card = buildSpellingCard(
      { number: 1, word: "apple", sentence: "I ate an apple." },
      "Term 1 Week 1",
      "Fruit"
    );
    expect(card.mainSentence).toBe('I ate an <span class="nodeword">apple</span>.');
    expect(card.cloze).toBe("I ate an {{c1::apple}}.");
  });
});

describe("cardToAnkiNote (English)", () => {
  it("uses Gao English Spelling deck and school spelling note type", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "apple" }));
    expect(note.deckName).toBe("Gao English Spelling");
    expect(note.modelName).toBe("school spelling");
  });

  it("includes is_dictation_mem field for English cards", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "apple" }));
    expect(note.fields).toHaveProperty("is_dictation_mem");
    expect(note.fields).not.toHaveProperty("Main Sentence Pinyin");
    expect(note.fields).not.toHaveProperty("Stroke Order Anim");
  });

  it("constructs tags from termWeek and topic (lowercased, underscored)", () => {
    const note = cardToAnkiNote(
      makeSpellingCard({ termWeek: "Term 1 Week 2", topic: "Sea Life" })
    );
    expect(note.tags).toEqual(["term_1_week_2", "sea_life"]);
  });
});

describe("cardToAnkiNote (Chinese, auto-detected)", () => {
  it("uses Gao Chinese deck and school Chinese spelling note type", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "苹果" }));
    expect(note.deckName).toBe("Gao Chinese");
    expect(note.modelName).toBe("school Chinese spelling");
  });

  it("includes Chinese-specific fields and excludes is_dictation_mem", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "苹果" }));
    expect(note.fields).toHaveProperty("Main Sentence Pinyin");
    expect(note.fields).toHaveProperty("Stroke Order Anim");
    expect(note.fields).toHaveProperty("is_dictation");
    expect(note.fields).toHaveProperty("is_dictation_from_mem");
    expect(note.fields).not.toHaveProperty("is_dictation_mem");
  });
});
```

- [ ] **Step 3.3: Run the test file**

Run: `npm run test:unit -- tests/unit/card-builder.test.ts`
Expected: All 10 tests pass.

If any test fails, follow the failure-handling from Task 2 (inspect, decide test-vs-code, fix, re-run).

- [ ] **Step 3.4: Test-review gate (PAUSE)**

Present to the user:
1. Full diff of both new files.
2. Summary:
   - `buildMainSentence`: 3 tests — basic replace, case-insensitive, regex-char-safe.
   - `buildCloze`: 2 tests — basic replace, case-insensitive.
   - `buildSpellingCard`: 2 tests — empty sentence → empty decorations, filled sentence → decorated.
   - `cardToAnkiNote` English: 3 tests — deck/noteType, fields, tags.
   - `cardToAnkiNote` Chinese: 2 tests — deck/noteType, Chinese-specific fields.
3. Ask via `AskUserQuestion`: Approved / Add more / Reject.

Wait for approval.

- [ ] **Step 3.5: Commit**

```bash
git add tests/unit/card-builder.test.ts tests/fixtures/make-spelling-card.ts
git commit -m "$(cat <<'EOF'
test: add Vitest coverage for src/lib/card-builder.ts (10 tests, green)

buildMainSentence: 3 tests — basic, case-insensitive, regex-char-safe.
buildCloze: 2 tests — basic, case-insensitive.
buildSpellingCard: 2 tests — empty-sentence short-circuit, populated.
cardToAnkiNote English: 3 tests — deck/noteType, English fields, tag construction.
cardToAnkiNote Chinese (CJK auto-detect): 2 tests — deck/noteType, Chinese-specific fields.

New fixture: tests/fixtures/make-spelling-card.ts (SpellingCard factory).

Part of Phase A.5 shared-core coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Boundary 3 — `telegram-intent.test.ts`

**Files:**
- Create: `tests/unit/telegram-intent.test.ts`

- [ ] **Step 4.1: Write the test file**

Create `tests/unit/telegram-intent.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectIntent } from "@/lib/telegram/intent";

describe("detectIntent", () => {
  it("returns unknown for empty input", () => {
    expect(detectIntent("")).toEqual({ type: "unknown" });
    expect(detectIntent("   ")).toEqual({ type: "unknown" });
  });

  it("returns unknown for slash commands", () => {
    expect(detectIntent("/start")).toEqual({ type: "unknown" });
    expect(detectIntent("/help")).toEqual({ type: "unknown" });
  });

  it("returns a single-word word_list for a single English word", () => {
    const result = detectIntent("apple");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["apple"]);
      expect(result.lang.id).toBe("english");
    }
  });

  it("splits English comma-separated input into a word_list", () => {
    const result = detectIntent("apple, banana, cherry");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["apple", "banana", "cherry"]);
    }
  });

  it("classifies a multi-word English sentence ending with '.' as a sentence", () => {
    const result = detectIntent("I saw a beautiful sunset today.");
    expect(result.type).toBe("sentence");
    if (result.type === "sentence") {
      expect(result.sentence).toBe("I saw a beautiful sunset today.");
      expect(result.lang.id).toBe("english");
    }
  });

  it("classifies a single short Chinese word as word_list", () => {
    const result = detectIntent("苹果");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["苹果"]);
      expect(result.lang.id).toBe("chinese");
    }
  });

  it("classifies Chinese comma list with short parts as word_list", () => {
    const result = detectIntent("苹果，香蕉，樱桃");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["苹果", "香蕉", "樱桃"]);
    }
  });

  it("classifies Chinese with commas where at least one part is a clause (>3 CJK) as sentence", () => {
    const result = detectIntent("元旦夜了，大家喜迎新年，开心极了");
    expect(result.type).toBe("sentence");
    if (result.type === "sentence") {
      expect(result.sentence).toBe("元旦夜了，大家喜迎新年，开心极了");
      expect(result.lang.id).toBe("chinese");
    }
  });

  it("classifies long English input (>5 words, no sentence punctuation) as unknown", () => {
    const result = detectIntent("hello how are you doing today my friend");
    expect(result.type).toBe("unknown");
  });
});
```

- [ ] **Step 4.2: Run the test file**

Run: `npm run test:unit -- tests/unit/telegram-intent.test.ts`
Expected: All 9 tests pass.

- [ ] **Step 4.3: Test-review gate (PAUSE)**

Present to the user:
1. Full diff of `tests/unit/telegram-intent.test.ts`.
2. Summary:
   - 9 tests covering: empty/whitespace, slash commands, single English word, English comma list, English sentence with `.`, single Chinese word, Chinese comma list (short parts), Chinese commas with clause (`>3` CJK chars), long English (>5 words, no punctuation → unknown).
3. Ask via `AskUserQuestion`: Approved / Add more / Reject.

Wait for approval.

- [ ] **Step 4.4: Commit**

```bash
git add tests/unit/telegram-intent.test.ts
git commit -m "$(cat <<'EOF'
test: add Vitest coverage for src/lib/telegram/intent.ts (9 tests, green)

detectIntent tests: empty/whitespace, slash commands, single English word,
English comma list, English sentence with '.', single Chinese word,
Chinese comma list (short parts), Chinese commas with clause (>3 CJK),
long English catchall → unknown.

Part of Phase A.5 shared-core coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Boundary 4 — `enrichment-pipeline-helpers.test.ts`

**Files:**
- Create: `tests/unit/enrichment-pipeline-helpers.test.ts`

**Behavior reference** (verified by reading `src/lib/enrichment-pipeline.ts` lines 70–112, 247–313 during plan writing):

- `pinyinToNumbered(pinyin: string)`: splits by `\s+`, converts each syllable. Each syllable: finds first tone-marked char, uses its tone (1–4); if no tone-mark found, tone defaults to `5`. Tone-mark chars are stripped to plain letters. `ü` (no tone) maps to `v`.
  - `"nǐ"` → `"ni3"`
  - `"hello"` (no tone marks) → `"hello5"`
  - `"nǐ hǎo"` → `"ni3 hao3"`
  - `"nü"` (ü no tone) → `"nv5"`
- `extractJsonArray(text: string)`: strips ```json code fences, direct-parses, falls back to extracting from first `[` to last `]`, then tries trailing-comma / control-char repair, last resort extracts individual `{...}` objects via regex.
  - Throws `Error("No JSON array found in response")` if no `[` and `]` are present.

- [ ] **Step 5.1: Write the test file**

Create `tests/unit/enrichment-pipeline-helpers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pinyinToNumbered, extractJsonArray } from "@/lib/enrichment-pipeline";

describe("pinyinToNumbered", () => {
  it("converts a single tone-marked syllable to numbered form", () => {
    expect(pinyinToNumbered("nǐ")).toBe("ni3");
  });

  it("converts a multi-syllable tone-marked pinyin string", () => {
    expect(pinyinToNumbered("nǐ hǎo")).toBe("ni3 hao3");
  });

  it("appends neutral tone 5 to syllables with no tone marks", () => {
    expect(pinyinToNumbered("hello")).toBe("hello5");
  });

  it("maps ü (no tone) to v5", () => {
    expect(pinyinToNumbered("nü")).toBe("nv5");
  });
});

describe("extractJsonArray", () => {
  it("parses a clean JSON array string", () => {
    expect(extractJsonArray('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("strips ```json fences before parsing", () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("extracts the array when JSON is embedded in surrounding prose", () => {
    const input = 'Here is the result: [{"word":"apple"}] -- done.';
    expect(extractJsonArray(input)).toEqual([{ word: "apple" }]);
  });

  it("repairs trailing commas before }] when the direct parse fails", () => {
    const input = '[{"a":1,},]';
    expect(extractJsonArray(input)).toEqual([{ a: 1 }]);
  });

  it("throws when no array is present in the input", () => {
    expect(() => extractJsonArray("this has no json")).toThrow(
      /No JSON array found/
    );
  });
});
```

- [ ] **Step 5.2: Run the test file**

Run: `npm run test:unit -- tests/unit/enrichment-pipeline-helpers.test.ts`
Expected: All 9 tests (4 `pinyinToNumbered` + 5 `extractJsonArray`) pass.

Known risk: if the last-resort object-regex branch of `extractJsonArray` salvages more than `[{ a: 1 }]` from the trailing-comma input, the trailing-comma test may need tightening or relaxing. Adjust the assertion to match actual behavior; do not change production code unless it is obviously wrong.

- [ ] **Step 5.3: Test-review gate (PAUSE)**

Present to the user:
1. Full diff of `tests/unit/enrichment-pipeline-helpers.test.ts`.
2. Summary:
   - `pinyinToNumbered`: 4 tests — single tone-marked syllable, multi-syllable, no-tone-mark neutral-5 fallback, ü→v5.
   - `extractJsonArray`: 5 tests — clean array, ```json fence strip, embedded in prose, trailing-comma repair, no-array-throw.
3. Ask via `AskUserQuestion`: Approved / Add more / Reject.

Wait for approval.

- [ ] **Step 5.4: Commit**

```bash
git add tests/unit/enrichment-pipeline-helpers.test.ts
git commit -m "$(cat <<'EOF'
test: add Vitest coverage for enrichment-pipeline pure helpers (9 tests, green)

pinyinToNumbered: single tone-marked syllable, multi-syllable, no-tone-mark
neutral fallback, ü → v.
extractJsonArray: clean array, ```json fence strip, embedded prose extraction,
trailing-comma repair, no-array error.

Orchestration functions (runPipeline, createWordNotes, etc.) deferred to a
future integration spec.

Part of Phase A.5 shared-core coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full-suite run + todo.md update

**Files:**
- Modify: `docs/todo.md`

- [ ] **Step 6.1: Run the full Vitest suite**

Run: `npm run test:unit`
Expected: ~42 tests pass (3 from Phase A's `card-completeness.test.ts` + 11 from `languages.test.ts` + 10 from `card-builder.test.ts` + 9 from `telegram-intent.test.ts` + 9 from `enrichment-pipeline-helpers.test.ts`). Total runtime <2s.

If total count differs, reconcile with the plan. If any test fails, do not proceed — fix before continuing.

- [ ] **Step 6.2: Run the combined `npm test` (Vitest + Playwright)**

Run: `npm test`
Expected: Vitest ~42 green + Playwright 1 green. Total runtime <30s (dev server boot dominates).

Anki must be running for the Playwright portion. If Anki is unavailable, skip this step and note it to the user at the end.

- [ ] **Step 6.3: Update `docs/todo.md`**

Edit `docs/todo.md`. Under the `## Recently Completed` heading, insert as the first item (above the Phase A entry):

```markdown
- [x] **Phase A.5 — Shared-Core Baseline Test Coverage** — Added Vitest boundary tests for the four stable modules where UI and bot flows converge: `languages.ts` (11 tests: `detectLanguage` + `isSentenceInput`), `card-builder.ts` (10 tests: `buildMainSentence`/`buildCloze`/`buildSpellingCard`/`cardToAnkiNote` + new `makeSpellingCard` factory), `telegram/intent.ts` (9 tests: `detectIntent`), and `enrichment-pipeline.ts` pure helpers (9 tests: `pinyinToNumbered`, `extractJsonArray`). Total ~39 new tests, <2s Vitest runtime. Orchestration-level pipeline tests deliberately deferred (would require heavy mocking or real-Anki Playwright integration). Each boundary went through the Phase A test-review gate before commit. See spec `docs/superpowers/specs/2026-04-18-phase-a5-shared-core-coverage-design.md` and plan `docs/superpowers/plans/2026-04-18-phase-a5-shared-core-coverage.md`.
```

(Adjust the test counts to match what actually shipped after any test-review additions.)

- [ ] **Step 6.4: Commit**

```bash
git add docs/todo.md
git commit -m "$(cat <<'EOF'
docs: record Phase A.5 completion in todo.md

Entry summarizes boundary-by-boundary coverage, test counts, and the
deliberately-deferred orchestration tests. Points to spec + plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Finishing the development branch

- [ ] **Step 7.1: Invoke `superpowers:finishing-a-development-branch`**

After all previous tasks are committed and the full suite is green, invoke the finishing-a-development-branch skill.

The skill will:
1. Verify tests pass (`npm test`).
2. Present the 4 options (merge locally / push+PR / keep / discard).
3. Execute the user's choice.

Do not merge or discard without running the skill; the user's choice is the gate.

---

## Self-review checklist

**1. Spec coverage:**
- `src/lib/languages.ts` → Task 2 ✓
- `src/lib/card-builder.ts` + new `makeSpellingCard` factory → Task 3 ✓
- `src/lib/telegram/intent.ts` → Task 4 ✓
- `src/lib/enrichment-pipeline.ts` pure helpers → Task 5 ✓
- Test-review gate per boundary → Steps 2.3, 3.4, 4.3, 5.3 ✓
- Update `docs/todo.md` → Task 6 ✓
- Branch creation + finishing → Tasks 1, 7 ✓
- Non-goals respected: no orchestration tests, no Playwright, no AI mocking ✓

**2. Placeholder scan:** No "TBD", "TODO", or "fill in later" in any step. Every step has complete code or an exact command.

**3. Type consistency:**
- `makeSpellingCard` → `SpellingCard` → used by `cardToAnkiNote` — all match.
- `detectIntent` return type — narrowed via `if (result.type === ...)` before accessing `.words` / `.sentence` / `.lang`. TypeScript will be happy.
- `@/lib/...` alias is the Phase A Vitest config alias — consistent with existing `tests/unit/card-completeness.test.ts`.

**4. Test count:**
- Expected total new: 11 + 10 + 9 + 9 = 39 tests.
- Spec said ~29; plan delivers 39. Delta is driven by splitting compound assertions into separate `it(...)` blocks for clarity during review. Still well within the <5s runtime budget and the "25–30" was a rough estimate. Acceptable.

If you find issues during execution, fix inline and flag at the next review gate.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-phase-a5-shared-core-coverage.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Pairs well with the per-boundary test-review gate.
2. **Inline Execution** — execute in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
