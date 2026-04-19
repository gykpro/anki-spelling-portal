# Long Underlined Phrase Split — Design

**Date:** 2026-04-19
**Status:** Draft, pending user review
**Scope:** English worksheet extraction split + correct `.nodeword` span wrapping for Anki rendering

## Problem

Some English spelling worksheet sentences have a very long underlined portion. Example:

> Outer space is **an infinitely huge place with trillions of stars**.

Today, the entire underlined span becomes a single Anki card's `Word` field. Downstream effects:

- The Cloze replaces the whole nine-word span, making cloze review awkward.
- The Extra-information enrichment prompt asks the AI for "2 additional example sentences using the word" — which forces the AI to reuse the long phrase verbatim in new examples.
- Audio, image, and definition enrichment target a sentence fragment rather than a vocabulary unit, producing low-value cards.

## Goals

- **Goal 1 — long-phrase split.** For English worksheet lines whose underlined span is ≥5 whitespace-separated tokens, replace the single long-phrase card with **one card per hard sub-word**, each sharing the original sentence as `Main Sentence`.
- Preserve the teacher's signal: feed the sub-word extractor the underlined span itself (not the full sentence), since the teacher already filtered to what they consider worth studying.
- **Goal 2 — cloze span-wrap.** The existing `Main Sentence` field is not displayed by the user's Anki template; the template uses the `Cloze` field and styles the highlight there. Today's `<span class="nodeword">` wrapping on `Main Sentence` is a no-op in Anki (it only styles in the portal's own review UI via `src/app/globals.css:32`). This spec wraps the **cloze directive itself** with `<span class="nodeword">...</span>` so the existing `.nodeword` CSS rule in the Anki card template takes effect. Outside-wrap shape: `<span class="nodeword">{{c1::word}}</span>` — the span applies on both the cloze-hidden front card (wrapping the `[…]` placeholder) and the cloze-shown back card (wrapping the word).
- No change to Chinese worksheet extraction, Quick Add or Telegram sentence-input pipelines, enrichment content, or Anki templates themselves.

## Non-goals

- Chinese worksheet long phrases (confirmed not to occur in practice; symmetric logic can be added later if a case appears).
- Idiom detection (English ≥5-word threshold is a deliberate simplification; multi-word idioms longer than 4 words are rare in Primary 4 worksheets).
- New review-UI affordances (e.g. manual "Split" button). The split happens server-side before review.
- Any change to the `is_dictation` / `is_dictation_mem` fields or the Anki card template itself.
- Removing the now-dead `<span class="nodeword">` wrapping on the `Main Sentence` field. It still styles the portal's own preview UI via `globals.css:32` and is inert in Anki; cleanup would be a separate non-blocking change.
- Refactoring the four inline cloze regexes (quick-add, enrich ×2, skill script) to share `buildCloze`. Flagged as follow-up tech debt in `docs/todo.md`.
- Backfilling existing Anki cards' `Cloze` markup. Only new cards get the new wrapping.
- Related but deferred: **layered pipeline refactor** — promote the `(word, sentence, clause) → enriched card` core into a public primitive, with worksheet extraction becoming a thin adapter on top. Tracked as a separate architecture review.

## User-facing behavior

### Field output (what the app writes into Anki)

For a worksheet line with a long underlined span:

```
Input (worksheet):
  "Outer space is [an infinitely huge place with trillions of stars]."

BEFORE this change (one long-phrase card):
  Card A  Word:          an infinitely huge place with trillions of stars
          Main Sentence: Outer space is <span class="nodeword">an infinitely huge place with trillions of stars</span>.
          Cloze:         Outer space is {{c1::an infinitely huge place with trillions of stars}}.

AFTER this change (N sub-word cards sharing the sentence):
  Card A  Word:          infinitely
          Main Sentence: Outer space is an <span class="nodeword">infinitely</span> huge place with trillions of stars.
          Cloze:         Outer space is an <span class="nodeword">{{c1::infinitely}}</span> huge place with trillions of stars.
  Card B  Word:          trillions
          Main Sentence: Outer space is an infinitely huge place with <span class="nodeword">trillions</span> of stars.
          Cloze:         Outer space is an infinitely huge place with <span class="nodeword">{{c1::trillions}}</span> of stars.
```

Two things are changing in the output:

1. **Split:** one line expands to N cards with sub-words as `Word`.
2. **Cloze markup:** the `Cloze` field now wraps the cloze directive with `<span class="nodeword">…</span>`. This applies to **every** card going forward, not just split cards — short single-word underlines also get the new cloze markup.

### Anki rendering (what the template actually shows)

The user's Anki card template uses the `Cloze` field (not `Main Sentence`) as the main display. A JS function in the template additionally post-processes the cloze text. The `.nodeword` CSS rule also lives in the template's styling section.

- Before this change: the `Cloze` field has no `.nodeword` wrapper, so the template's CSS rule matches nothing, and the highlight does not render in Anki (it only appears in the portal's own review UI). This is the pre-existing bug Goal 2 fixes.
- After this change: the `.nodeword` span wraps the cloze block, so the template's CSS rule applies on both the front (hidden `[…]`) and back (revealed word). The `Main Sentence` field's existing `.nodeword` wrapping is kept as-is — it still styles the portal's own preview UI via `src/app/globals.css:32` and is inert in Anki; deliberately out of scope to remove.

The long phrase itself is **not** retained as a card. Users see the expanded word list in the normal review UI and can edit or delete individual entries as always.

## Scope rules

| Situation | Behavior |
|---|---|
| English worksheet line, underlined span ≥5 whitespace tokens | Split (this feature) |
| English worksheet line, underlined span <5 tokens | Unchanged (idiom or single word preserved) |
| Chinese worksheet line, any length | Unchanged |
| Quick Add / Telegram: user types an English sentence | Already split by existing `extractWordsFromSentence` sentence-input path — unchanged |
| Quick Add / Telegram: user types a word or phrase | Unchanged |
| Worksheet dictation section | Already discarded at extraction (EXTRACTION_PROMPT rule 6) — unchanged |

## Architecture

### Goal 1 — seam placement for the splitter

Both worksheet entry points will share the splitter by routing through a single pure helper:

- `src/lib/enrichment-pipeline.ts :: extractFromImages(images)` — **this wrapper gains the splitter**. Currently a one-line passthrough around `runAIVision(EXTRACTION_PROMPT, images)`. After the change it returns `splitLongPhrasesInPages(pages)` applied to the vision output.
- `src/app/api/extract/route.ts` — **refactored** to call `extractFromImages(images)` instead of `runAIVision` directly. The route currently imports `EXTRACTION_PROMPT` to call `runAIVision` itself; after the change the prompt import is gone from the route.
- `src/lib/telegram/handlers.ts` — already calls `extractFromImages(...)` for photo and document worksheet uploads. Inherits the split automatically, no handler change needed.

### Goal 2 — call sites that must change for the cloze span-wrap

The cloze-producing logic is duplicated across five places today (pre-existing tech debt; deliberately **not** refactored as part of this feature). All five must emit the new output shape `<span class="nodeword">{{c1::$1}}</span>`:

| File | Today | After |
|---|---|---|
| `src/lib/card-builder.ts :: buildCloze` (line 29) | `sentence.replace(regex, "{{c1::$1}}")` | `sentence.replace(regex, '<span class="nodeword">{{c1::$1}}</span>')` |
| `src/app/quick-add/page.tsx` (line 39) | inline `"{{c1::$1}}"` | inline `'<span class="nodeword">{{c1::$1}}</span>'` |
| `src/app/enrich/page.tsx` (line 586) | inline `"{{c1::$1}}"` | same update |
| `src/app/enrich/page.tsx` (line 1278) | inline `"{{c1::$1}}"` | same update |
| `skill/scripts/lib/anki-fields.mjs` (line 28) | inline `"{{c1::$1}}"` | same update |

The `buildMainSentence` function and the four inline main-sentence regexes are untouched. Refactoring the four inline cloze regexes to use `buildCloze` is out of scope — flagged in docs/todo.md as follow-up tech debt.

### Pure helper

New exported function in `src/lib/enrichment-pipeline.ts`, co-located with the existing `extractWordsFromSentence`:

```ts
export async function splitLongPhrasesInPages(
  pages: ExtractedPage[],
  extractor: (s: string, l: LanguageConfig) => Promise<string[]> = extractWordsFromSentence,
): Promise<ExtractedPage[]>
```

- `extractor` is injected with a default for testability; production passes `extractWordsFromSentence` implicitly.
- Returns a new `ExtractedPage[]` with the `sentences` arrays rewritten where applicable. Other fields untouched.

### Algorithm

For each page, for each entry:

1. **Language gate:** compute `detectLanguage(entry.word).id`. If `!== "english"`, keep entry unchanged.
2. **Length gate:** `entry.word.trim().split(/\s+/).length >= 5`. If below, keep entry unchanged.
3. **Extractor call:** `const hardWords = await extractor(entry.word, englishLang)` where `englishLang = getLanguageById("english")`.
4. **Empty-response fallback:** if `hardWords.length === 0`, keep the original entry.
5. **Throw fallback:** if `extractor` throws, `console.warn(...)` and keep the original entry. The batch never fails because of one line.
6. **Dedup within page:** filter `hardWords` against the lowercased set of `word` values already present on this page's other entries. Case-insensitive equality.
7. **Emit replacement entries:** one new `ExtractedSentence` per surviving `hardWord`, each inheriting the parent entry's `number` and `sentence`. Drop the original long-phrase entry.
8. **Parallelism:** within a page, all long-phrase entries run through the extractor concurrently via `Promise.all`.

### Data types

No changes to `ExtractedSentence`, `ExtractedPage`, `SpellingCard`, or Anki fields. All existing downstream code (`buildSpellingCard`, `cardToAnkiNote`, enrichment, distribution) receives normal short-word `ExtractedSentence` values and needs no modification.

## Testing plan

Added per CLAUDE.md's three hard rules and mandatory mutation spot-check at the test-review gate.

### Vitest — `tests/unit/split-long-phrases.test.ts`

Boundary tests against `splitLongPhrasesInPages` with a deterministic stub extractor that returns a resolved Promise (no AI, no network). Eight tests:

1. English, word below threshold (4 tokens) → entry untouched, extractor not called.
2. English, word at threshold (5 tokens) → entry replaced by extractor output.
3. English, word above threshold (9 tokens, the motivating example) → entry replaced.
4. Chinese word of any length → entry untouched, extractor not called.
5. Extractor returns `[]` → fallback: original long-phrase entry kept.
6. Extractor throws → fallback: original entry kept, no exception propagates.
7. `number` and `sentence` preserved on all emitted sub-word entries.
8. Within-page dedup: if extractor returns a word that already exists on another entry of the page, that duplicate is dropped (case-insensitive).

Each test uses a page built from a `make-spelling-card`-style factory (or inline literal, given the shape is small).

### Vitest — update `tests/unit/card-builder.test.ts` (existing file)

The existing `buildCloze` and `buildSpellingCard` assertions today check `"I ate an {{c1::apple}}."`. Those assertions must be **updated** to expect `'I ate an <span class="nodeword">{{c1::apple}}</span>.'` — a behavior change paired with its test change, in the same commit, per the three hard rules.

Add two new `buildCloze` tests to lock the new contract explicitly:

- `buildCloze` wraps the cloze directive with `<span class="nodeword">…</span>`.
- Case-insensitive match still preserves original case inside the cloze directive (e.g. `'Apple pie'` with word `'apple'` produces `'<span class="nodeword">{{c1::Apple}}</span> pie.'`).

### Mutation spot-check (mandatory at test-review gate)

Before the user reviews, mutate production in 1–2 obvious ways, confirm at least one test kills each mutation, revert:

- **M1: flip the length threshold.** Change `>= 5` to `> 5`. Expect test #2 (exactly 5 tokens) to fail.
- **M2: remove the language gate.** Always run the splitter. Expect test #4 (Chinese) to fail.
- **M3: remove the empty-response fallback.** Emit zero entries when extractor returns `[]`. Expect test #5 to fail (entry disappears instead of being preserved).
- **M4: drop the span wrapper from buildCloze.** Revert to `"{{c1::$1}}"`. Expect the updated `buildCloze` and `buildSpellingCard` tests to fail.
- **M5: typo the class name.** Change `nodeword` to `wordnode`. Expect the class-assertion tests to fail.

Kill report included in commit body.

### Playwright

No new e2e test. Worksheet-photo upload isn't yet automated in Playwright; adding it is a larger infrastructure task out of scope here. Behavior is fully exercised by the Vitest suite given `splitLongPhrasesInPages` is a pure function.

## Rollout

- No database, no schema, no Anki template change.
- After merge, restart `npm run dev` so the Telegram bot reloads `extractFromImages` and the inline cloze regexes.
- No migration of existing cards already in Anki. They retain their current `Cloze` markup (no `.nodeword` wrapper); only newly-created cards get the new markup. If the user wants to backfill, that's a separate one-off script and out of scope here.
- Confirm after rollout that the Anki card template's `.nodeword` CSS rule actually exists — if not, the span wraps correctly but no highlight appears in Anki. (Cannot be verified from code; user to check the note type's "Cards…" dialog in Anki.)

## Open questions

- **User verification only:** does the user's Anki note-type card template contain a `.nodeword { … }` CSS rule? If not, Goal 2's wrapping is written correctly but no highlight renders in Anki, and the user would need to add the CSS rule to the template styling (one-time, manual, out of this codebase's scope). Flagged in Rollout section.

All other prior clarifying questions resolved (card shape, length threshold, language scope, extractor input source, seam placement, cloze wrap direction).
