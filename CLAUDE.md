# Project Conventions

## Development Workflow

Follow this order for every feature request or change:

1. **Spec first** — write acceptance criteria in the design doc (`docs/superpowers/specs/YYYY-MM-DD-*.md`). These become the test seeds.
2. **Failing test first** — write Vitest or Playwright tests asserting the new behavior (or reproducing the bug) before touching production code.
3. **Test review gate** — present the test diffs + a plain-English summary of each test to the user. **Before presenting**, run a mutation spot-check: temporarily mutate the production code in 1–2 obvious ways (e.g., flip a boolean return, force a single branch), confirm tests catch each mutation, then revert. Include the mutation kill report in the commit body. Wait for approval before writing any production code. This gate is non-negotiable; even tiny changes require it.
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

## Task Tracking

- Feature roadmap and pending tasks live in `docs/todo.md`. Always check this file at the start of a session to know what's pending.
- After completing a feature: mark it `[x]` in `docs/todo.md` and move it to the "Completed" section.
- After committing, check `docs/todo.md` for the next pending task and start it (or ask the user which one to do next).
- When the user adds new feature requests, add them to `docs/todo.md` before starting work.

## Communication Style

- When asking the user a question, always use `AskUserQuestion` with concrete options rather than open-ended text questions. Let the user pick from a menu instead of typing free-form answers.

## When to Commit

- After completing a feature or meaningful unit of work
- After fixing a bug
- Do NOT commit broken or untested code

## Service Restart

- **Always restart the dev server** (`npm run dev`) after committing a feature change. The Telegram bot and other services load code at startup and won't pick up changes without a restart.
- Kill the existing process on port 3000 before restarting.
- Verify the server is healthy after restart by checking `/api/health`.

## Testing Conventions

- **Two executable layers + slim manual plan:**
  - **Vitest** (`tests/unit/`) — boundary tests on `src/lib/*`. Fast, deterministic. Mock AI at the `src/lib/ai.ts` boundary (or rely on the canned backend via `TEST_MODE`).
  - **Playwright** (`tests/e2e/`) — page-level journey tests. Dev server launched with `TEST_MODE=true` so AI is canned.
  - **Manual plan** (`tests/ui-test-plan.md`) — retained for edge cases not worth automating: destructive ops, Telegram races, visual/quality regression of real AI output.
- **Test at behavior, not implementation.** A pure refactor should touch zero tests.
- **Factories over fixtures.** `makeTestCard({ overrides })` in `tests/fixtures/`.
- **Stable selectors.** Playwright uses `data-testid="<feature>-<element>"`. Never CSS paths or text.
- **All test data uses `__test_` prefix.** Cleanup runs before AND after each Playwright spec via `tests/setup/anki-test-helpers.ts`.
- **Run tests on the `Test` Anki profile** (or any profile with both decks) to avoid polluting real profiles.
- Edge cases matter — empty states, invalid input, error handling, not just happy paths.

## Tech Stack Reminders

- Prioritise Claude Code CLI for AI calls, since it's subscription based
- Anki is source of truth — no database
- Image generation via Gemini API directly (not through Claude)
- Audio generation via Azure TTS
- Deployable via Docker (see `docs/nas-setup.md`)

## Memory Protocol

At the start of every session:
1. Read MEMORY.md from the auto-memory directory
2. Check for any topic files (debugging.md, patterns.md, etc.)

After completing work:
1. Save important decisions, patterns, and context to MEMORY.md
2. Create topic files for detailed notes on specific areas
3. Update or remove outdated memories
