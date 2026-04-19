# Phase A.5 — Shared-Core Baseline Test Coverage

## Problem

Phase A left the repo with four tests (3 Vitest + 1 Playwright). Those tests prove the harness works but cover almost none of the code. The project has two user-facing flows — portal UI and Telegram bot — that share a common core. A regression introduced by a change in either flow today is not caught by the test suite.

The user's concern: _"we have a kind of complex dual workflow"_. The risk: a UI-motivated change to `src/lib/enrichment-pipeline.ts` or `src/lib/card-builder.ts` silently breaks the bot flow (or vice versa), and nobody notices until a feature is used.

## Goals

- Add Vitest coverage on the **shared-core boundaries** where UI and bot converge, so either flow's regression on shared code is caught by `npm test`.
- Exercise the Phase A workflow end-to-end, including the test-review gate, on real work. This spec **is the pilot** that Phase A's spec originally deferred.
- Keep the added suite fast: total Vitest runtime <5s, ~25–30 tests.
- Deliberately trigger (or naturally encounter) at least one mid-flight requirement change during implementation to prove that loop works.

## Non-Goals

- Orchestration tests (`runPipeline`, `createWordNotes`, `generateAndSaveAudio`, `distributeNotes`, etc.). Testing those at the Vitest level requires heavy mocking, which produces brittle tests coupled to implementation. These are deferred — a future Playwright integration test can cover the happy paths, running against a real Anki Test profile and `TEST_MODE=true` canned AI.
- New Playwright specs in this phase.
- Mocking the AI backend. Pure helpers don't need it.
- 100 % line coverage. We aim for the specific convergence points between UI and bot, not blanket coverage.
- Broader React component tests. Page-level behavior belongs to Playwright; individual components change too often to lock down with Vitest.

## Approach

Vitest-only, pure-function testing at four stable boundaries. Each boundary is a clearly-scoped module with a narrow public interface. Tests call the exported functions with real inputs and assert on real outputs. Zero mocks.

## Test plan by boundary

### `src/lib/languages.ts` (~8 tests)

Shared by both flows for language detection.

- `detectLanguage("apple")` → English config (id = `"english"`).
- `detectLanguage("苹果")` → Chinese config.
- `detectLanguage("apple 苹果")` (mixed; CJK present) → Chinese config.
- `detectLanguage("")` → English config (default fallback).
- `isSentenceInput("apple")` → false.
- `isSentenceInput("I ate an apple yesterday.")` (4 words, ends with `.`) → true.
- `isSentenceInput("苹果")` (short Chinese) → false.
- `isSentenceInput("今天天气非常好，我们出去玩吧")` (long Chinese, no period) → true.
- `isSentenceInput("你好吗？")` (Chinese with `？`) → true.

### `src/lib/card-builder.ts` (~7 tests)

Builds Anki note fields from extracted/reviewed cards. Shared by Upload review flow and any code path that promotes a `SpellingCard` to an Anki note.

- `buildMainSentence("I ate an apple.", "apple")` → wraps "apple" in `<span class="nodeword">…</span>`.
- `buildMainSentence("Apple pie is great.", "apple")` → case-insensitive, wraps "Apple".
- `buildMainSentence("He's at the café.", "he's")` → escapes regex special chars in word.
- `buildCloze("I ate an apple.", "apple")` → replaces with `{{c1::apple}}`.
- `buildSpellingCard({word, sentence: ""}, "Term 1 Week 2", "Fruit")` → `mainSentence` and `cloze` are `""` (no replacement attempted).
- `buildSpellingCard({word, sentence: "I like apples."}, …)` → both `mainSentence` and `cloze` populated.
- `cardToAnkiNote(englishCard)` → `deckName === "Gao English Spelling"`, `modelName === "school spelling"`, fields include `is_dictation_mem`, tags include the lowercased + underscore-joined termWeek and topic.
- `cardToAnkiNote(chineseCard)` (CJK word auto-detect) → `deckName === "Gao Chinese"`, `modelName === "school Chinese spelling"`, fields include `Main Sentence Pinyin`, `Stroke Order Anim`, `is_dictation`, `is_dictation_from_mem`.

(Note: the last two are counted as two tests, bringing the boundary total to 8.)

### `src/lib/telegram/intent.ts` (~9 tests)

The bot's message classifier. A regression here routes user input to the wrong handler.

- `detectIntent("")` → `{ type: "unknown" }`.
- `detectIntent("/start")` → `{ type: "unknown" }`.
- `detectIntent("apple")` → `{ type: "word_list", words: ["apple"], lang: English }`.
- `detectIntent("apple, banana, cherry")` → `word_list` with 3 words, English.
- `detectIntent("I saw a beautiful sunset today.")` → `sentence` with English lang.
- `detectIntent("苹果")` → `word_list` with 1 Chinese word.
- `detectIntent("苹果，香蕉，樱桃")` (Chinese comma list, short parts) → `word_list`, 3 words.
- `detectIntent("元旦夜了，大家喜迎新年，开心极了")` (Chinese commas, at least one clause >3 CJK) → `sentence`.
- `detectIntent("hello how are you doing today my friend")` (>5 English words, no punctuation) → `unknown`.

### `src/lib/enrichment-pipeline.ts` pure helpers (~5 tests)

Only the pure helpers; orchestration deferred per Non-Goals.

- `pinyinToNumbered("nǐ")` → `"ni3"`.
- `pinyinToNumbered("pinyin")` (no tone marks) → `"pinyin5"` for each syllable where applicable (verify the module's exact fallback behavior and lock it in).
- `pinyinToNumbered("nǐ hǎo")` → `"ni3 hao3"`.
- `extractJsonArray('[{"a":1}]')` → `[{ a: 1 }]` (clean).
- `extractJsonArray('[{"a":1,},]')` (trailing commas) → `[{ a: 1 }]` (repair succeeds).
- `extractJsonArray('some text [{"a":1}] trailing')` → `[{ a: 1 }]` (embedded JSON extraction).

(6 tests here; adjust down to 5 if the 2nd `pinyinToNumbered` test duplicates coverage — decide at implementation time.)

**Running total: ~29–30 tests.**

## Workflow (the pilot)

Each boundary is implemented as its own Vitest file, one file at a time:

1. Write the full test file for boundary N.
2. Run `npm run test:unit` — confirm the tests pass (since they test existing correct code) or fail in a way that reveals a real bug in the existing code.
3. **Test review gate** — agent presents the diff of the new file + plain-English summary of each test. User approves, requests changes, or spots missing cases.
4. If the user requests additions, add them and re-present (this is the expected mid-flight change loop).
5. If any test reveals a real bug, fix the production code in the same commit — per rule #2.
6. Commit: "test: add Vitest coverage for `<boundary>` (N tests, all green)".
7. Move to next boundary, repeat.

Four boundary files → four commits. One final commit updates `docs/todo.md` and marks Phase A.5 done.

## Technical design

### File layout

```
tests/
  unit/
    card-completeness.test.ts       # existing (Phase A)
    languages.test.ts               # new
    card-builder.test.ts            # new
    telegram-intent.test.ts         # new
    enrichment-pipeline-helpers.test.ts  # new
  fixtures/
    make-test-card.ts               # existing
    make-spelling-card.ts           # new — factory for SpellingCard
```

### New factory: `makeSpellingCard`

`card-builder.ts` tests need `SpellingCard` inputs. A small factory keeps fixtures DRY:

```ts
// tests/fixtures/make-spelling-card.ts
import type { SpellingCard } from "@/types/spelling";

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

### Runtime expectations

- Full `npm run test:unit` run with the new tests: under 5 seconds total (current run is 280ms for 3 tests; ~30 pure tests add negligible time).
- No Anki, no dev server, no network calls. Vitest alone.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A test reveals an actual bug in existing production code | Fix the bug in the same commit. This is a valid outcome and one of the reasons to add baseline coverage. |
| Tests over-assert on incidental details (e.g., exact tag string formatting) and break on harmless refactors | Assert on observable behavior (deck name, language id, field keys) rather than string-exact values where the string format is cosmetic. |
| `pinyinToNumbered` contains behavior we don't fully understand | During test-review, flag any assertion we're unsure about. Better to skip the test than lock in wrong behavior. |
| Scope creep during review ("also add a test for X") | Accept one round of additions per boundary during the review gate. If more comes up, create follow-up items in `docs/todo.md` rather than expanding this spec. |

## Success criteria

- All ~29 new Vitest tests pass on `npm run test:unit`.
- Total Vitest runtime <5 seconds.
- At least one test review gate is exercised per boundary (4 gates minimum).
- If any test reveals a real bug in production code, the fix ships in the same commit as the test.
- `docs/todo.md` has a Recently Completed entry for Phase A.5 referencing this spec.
- A future agent opening the project can run `npm test` and see at least ~33 tests pass (Phase A's 3 + 1 + Phase A.5's ~29).

## Open questions (resolved at plan-writing time)

- Exact number of tests for `pinyinToNumbered` (5 vs 6 total in that boundary) — resolved by reading the module before writing tests.
