# Reliable Feature Delivery Workflow

## Problem

Returning to this project after a gap, two fears dominate:

1. **How do I know the new feature works?**
2. **How do I know existing features don't regress?**

Current verification depends on bespoke browser automation orchestrated by the agent per change. Bot features are explicitly marked `(manual)` in `tests/ui-test-plan.md` — meaning even the plan concedes they can't be run automatically. Per `CLAUDE.md` the agent runs only "sections related to the new/changed features," so full regression effectively never happens between sessions.

The project also runs two user-facing flows (portal UI + Telegram bot) on a shared core. A change to either flow can silently regress the other if the agent doesn't re-test it.

## Goals

- Testing confidence that survives a session gap — the next agent can run a suite and get a trustworthy pass/fail without replaying the whole UI plan.
- Regression safety via an executable suite runnable in **<5 minutes**.
- A test-update workflow compatible with fast iteration and mid-flight requirement changes.
- **Experiment framing**: prove the approach on one piloted feature before generalizing.

## Non-Goals

- Coverage thresholds (invite testing-for-numbers).
- Full Playwright coverage of every UI path — only golden journeys.
- CI gating (future, not MVP).
- Snapshot tests (high maintenance cost, low value here).
- Replacing `tests/ui-test-plan.md` entirely — it stays, slimmer, for edge cases not worth automating.

## Approach

**Medium appetite (option B).** Two executable test layers at stable boundaries, plus a slim retained manual plan for edge cases.

### Layers

1. **Vitest — boundary tests.** Unit/integration tests at the stable seams of the codebase:
   - `src/lib/enrichment-pipeline.ts` — public functions (`runPipeline`, `generateExtraInfoAudio`, etc.) with the AI boundary mocked.
   - `src/lib/card-completeness.ts` — pure functions, ideal targets.
   - `src/lib/card-builder.ts` — field assembly logic.
   - `src/lib/telegram/intent.ts` — message parsing against fixtures of real Telegram payloads.
   - `src/lib/anki-connect.ts` — tested against a real dedicated Anki test profile (no mocking — the contract is stable and Anki is cheap to run locally).
   - `src/lib/languages.ts` — pure language config lookup.

2. **Playwright — journey tests.** One spec per user-visible journey. Targets:
   - **Quick-add happy path**: add 3 words → success message → 3 cards in Anki.
   - **Quick-add duplicate detection**: add existing word → skipped with warning.
   - **Enrich flow**: navigate with noteIds → "Enrich All Empty" → "Save All" → fields populated.
   - **Browse filters**: apply "No Definition" → count matches dashboard chip.
   - **Browse drawer**: click word → drawer opens with field status.

   Playwright launches a dev server running in `TEST_MODE=true` (canned AI responses) and points at a real Anki test profile. Stable `data-testid` attributes used for selectors.

3. **Manual plan (`tests/ui-test-plan.md`, slimmed).** Retained for flows not worth automating:
   - Destructive operations (Anki stopped mid-run, profile switch races).
   - Telegram-side flows that require a live bot (queue timers, multi-message batching).
   - Visual regression / subjective quality of AI output.

### Philosophy (one-line mantras)

- **Test behavior, not implementation.** A refactor that preserves behavior should touch zero tests.
- **Factories, not fixtures.** `makeTestCard({ overrides })` > static JSON fixtures. One data-shape change → one update.
- **Stable selectors.** Playwright uses `data-testid`, never CSS paths or text content.
- **Real integrations where cheap.** Real Anki test profile beats mocking Anki. Mock AI (expensive + non-deterministic), not Anki (fast + deterministic).
- **AI is the maintenance engine.** When boundaries are stable, the agent regenerates broken tests in seconds.

## Workflow

### For every change

1. **Spec phase**: write acceptance criteria inline in the design doc — these become test seeds.
2. **Failing test first** for new user-visible behavior or bug reproduction.
3. **Test review gate** — agent presents proposed test changes (new tests, updated tests, deleted tests) to the user for approval before writing any production code. See "Test review gate" below.
4. **Implementation** — agent writes code to turn the approved failing tests green.
5. **`npm test`** — all green before commit.
6. **Commit**: test change ships with behavior change in the same commit.

### Test review gate

After step 2 and before step 4, the agent pauses and presents:

- **Diffs of new/changed test files** — the actual code the user will be approving.
- **A short summary per test**: what behavior it asserts, in plain English. Example: *"`enrichment-pipeline.test.ts :: should skip extra_info audio when all `<li>` already have `[sound:...]`` — asserts idempotency of the extra-info audio generator."*
- **Removed/disabled tests** with rationale. A deleted test is a deleted guarantee; it needs justification.

User approves, requests changes, or rejects. Only after approval does the agent proceed to implementation.

**Why this gate is non-negotiable:** tests are the contract the agent will implement against. If the tests assert the wrong behavior — because the agent misread the requirement, or the requirement is ambiguous, or an edge case is missing — then production code that passes them gives false confidence. Reviewing tests *before* implementation catches misunderstandings when they're cheap to fix.

**For tiny changes** (e.g., one-line string tweak with a one-line test update): the gate is still required but takes seconds to clear. Do not skip it even for trivial changes — the discipline is the value.

### Scenarios

| Scenario | Workflow |
|---|---|
| New feature | Acceptance criteria in spec → failing tests → **user reviews tests** → code → green |
| Bug fix | Failing test that reproduces the bug → **user confirms test reproduces the bug** → fix → green. Never fix without a regression test. |
| Mid-flight requirement change | Update **spec → tests → user re-reviews tests → code**, in that order. Don't silently shift behavior in code. |
| Pure refactor | Zero test changes expected. No review gate needed. If tests break, they were coupled to internals — rewrite at a higher boundary. |
| Test fails mysteriously | Investigate before skipping. If skipped, add `// TODO(owner, issue)` and flag to user. |
| Test data shape changes | Update the factory (one place), not N fixtures. User review of the factory diff is part of the test review gate. |
| Test mechanism needs rewrite | Pause — the boundary was probably wrong. |

### Bottom line (three hard rules, nothing more)

1. **All tests pass before commit.** `npm test` green; agent reports pass/fail matrix in the commit body.
2. **Every user-visible behavior change ships with a test change in the same commit.** New behavior → new test. Changed behavior → updated test. Removed behavior → deleted test.
3. **Test changes are reviewed and approved before implementation begins.** The test review gate (see Workflow above) is non-negotiable. No production code is written against unreviewed tests.

Explicitly **not** in the bottom line: coverage thresholds, "every function needs a test," or CI gating. Those are nice-to-haves, not the minimum.

## Relation to TDD

TDD-flavored at the discipline level (test-first for new behavior and bugs; tests as spec), non-TDD at the granularity level (boundary-focused, not per-function-unit). We borrow the red-before-green reflex; we skip strict per-function cycles, heavy mocking, and coverage-chasing.

## Technical design

### Test infra layout

```
tests/
  unit/                    # Vitest boundary tests
    card-completeness.test.ts
    enrichment-pipeline.test.ts
    telegram-intent.test.ts
    card-builder.test.ts
    ...
  e2e/                     # Playwright journey specs
    quick-add.spec.ts
    enrich.spec.ts
    browse.spec.ts
    upload.spec.ts
  fixtures/                # Factories + canned AI responses
    make-test-card.ts
    canned-enrichment.ts
    telegram-payloads.ts
  setup/
    anki-test-profile.ts   # Ensures "Test" profile exists, clean before/after
    test-mode-server.ts    # (if needed) helper to start dev server in TEST_MODE
  ui-test-plan.md          # Retained, slimmed
```

### Config files

- `vitest.config.ts` — node environment; jsdom later only if we start testing components directly (not planned for MVP).
- `playwright.config.ts` — launches dev server in `TEST_MODE=true`, points at `localhost:3001`, uses a dedicated test Anki profile.

### npm scripts

- `npm test` — runs `npm run test:unit && npm run test:e2e`.
- `npm run test:unit` — Vitest watch-friendly.
- `npm run test:e2e` — Playwright headed off by default.
- `npm run test:e2e:ui` — Playwright in UI mode for debugging.

### Handling AI non-determinism

AI calls are expensive and non-deterministic. Strategy:

- **Vitest**: mock at the boundary (the Anthropic SDK / Claude CLI call sites). Unit tests of `runPipeline` inject a fake AI client returning canned JSON.
- **Playwright**: run the dev server with an env flag `TEST_MODE=true` (or `AI_BACKEND=canned`) that intercepts the AI backend and returns canned enrichment responses keyed off the input word. Implemented as a third backend option alongside SDK and CLI.
- **Manual plan**: retained for testing real-AI output *quality* (that's a human judgment, not an assertion).

### Test Anki profile

- Named `Test`, auto-created by setup script if missing.
- Has both `Gao English Spelling` and `Gao Chinese` decks pre-configured.
- All test notes use `__test_` prefix.
- Cleanup runs before **and** after each test via AnkiConnect `findNotes` + `deleteNotes`.
- Profile switching via existing `ProfileLock` + `loadProfileAndWait` mechanism.

### `data-testid` conventions

- Every interactive element Playwright targets gets `data-testid="<feature>-<element>"`.
- Example: `data-testid="quick-add-submit"`, `data-testid="enrich-save-all"`, `data-testid="browse-filter-no-definition"`.
- This is a one-time additive change to existing components as Playwright specs are written.

## Experiment plan: pilot with one feature

The workflow only proves itself on a **real new feature**, not a retroactive test of existing code (retroactive wouldn't exercise the "idea → spec → tests → code" loop or mid-flight change handling).

### Pilot sequence

1. **Phase A — infrastructure (workflow setup).**
   - Install Vitest + Playwright.
   - Create `tests/unit/`, `tests/e2e/`, `tests/fixtures/`, `tests/setup/` with initial scaffolding.
   - Add `TEST_MODE` AI backend.
   - Add test Anki profile setup script.
   - Write **one** Vitest test (`card-completeness.test.ts`) and **one** Playwright test (`quick-add.spec.ts`) to prove the harness works end-to-end.
   - Add `data-testid`s to elements those tests touch.
   - Wire up `npm test`.
   - Commit when green.

2. **Phase B — pilot feature.**
   - Pick one upcoming feature (TBD at plan-writing time — user picks from `docs/todo.md` or proposes a new one).
   - Run it through the full workflow: spec → acceptance criteria → failing tests → **test review gate** → code → green.
   - During implementation, **deliberately trigger a mid-flight requirement change** (user-initiated) to prove the spec→tests→user re-review→code loop works.
   - Commit.

3. **Phase C — retro.**
   - Measure: Did tests catch regressions? Did the mid-flight change flow work? How long did `npm test` take? What broke?
   - Decide: generalize, adjust, or rethink.

4. **Phase D — workflow documentation.**
   - Update `CLAUDE.md` to encode the two bottom-line rules and the scenario table.
   - Update `tests/ui-test-plan.md` intro to clarify its role as edge-case-only.

### Deferred to later (out of scope for MVP)

- Filling out Vitest coverage across all listed boundary targets (pilot adds only what the pilot feature touches).
- Filling out Playwright specs for all listed journeys (pilot adds only one).
- Feature catalog / repo map (potential follow-on spec if the fear resurfaces after testing is in place).
- GitHub Actions CI for Vitest-only runs (Playwright needs Anki, which complicates CI).
- Snapshot tests, visual regression, coverage dashboards.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `TEST_MODE` AI backend adds complexity | Keep it as a thin switch in the AI client module; canned responses keyed by input word in a single file. |
| Flaky Playwright tests erode trust | Start with 1–2 specs; insist on `data-testid` selectors; no sleep-based waits. |
| Test Anki profile drifts from real profiles | Setup script idempotently creates decks/note types; cleanup runs before every test, not just after. |
| Two hard rules not enforced → drift | Encode them in `CLAUDE.md` after spec lands; agent reports pass/fail matrix in commit body as visible evidence. |
| Pilot feature too large for one plan | Pick something small and user-visible — ideally 1–2 days of work, not a multi-week feature. |

## Success criteria

- `npm test` runs in <5 minutes end-to-end.
- Pilot feature lands through the full workflow with zero deviations from the three hard rules.
- Test review gate is exercised at least once during the pilot (ideally at least twice if a mid-flight change occurs).
- Mid-flight requirement change during the pilot is handled cleanly via spec→tests→user re-review→code, demonstrating the workflow.
- A future agent, opening the project cold, can run `npm test` and trust the result.
- Agent's post-commit message includes a verifiable pass/fail matrix.

## Open questions (resolved at plan-writing time)

- Which pilot feature? (User picks; default: smallest pending item from `docs/todo.md`, or a new small addition.)
- Exact shape of `TEST_MODE` AI backend: single canned-response file vs. per-test injection? (Defer to plan.)
