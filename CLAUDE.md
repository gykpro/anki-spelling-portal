# Project Conventions

## Development Workflow

Follow this order for every feature request or change:

1. **Plan first** — Enter plan mode, explore the codebase, and write an implementation plan for user approval before writing code.
2. **Implement** — Write the code following the approved plan.
3. **Update tests** — If the change affects UI behavior, update `tests/ui-test-plan.md` to reflect new or modified scenarios. Add new sections for new features, revise existing steps for changed behavior, remove obsolete cases.
4. **Self-test** — Always run the UI test plan sections related to the new/changed features via browser automation. This is mandatory, not optional. Report results in a table. Fix any failures before proceeding.
5. **Commit** — After tests pass, create a git commit with a descriptive message summarizing the change.
6. **CRITICAL — Continue** — NEVER stop after a commit. Always do one of: (a) if there are more features to implement, immediately start the next one (back to step 1); (b) if unsure what to do next, use `AskUserQuestion` with a menu of options. You must NEVER end your turn silently after step 5. Stopping without asking is a workflow violation.

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

## Testing Conventions

- Test plan lives at `tests/ui-test-plan.md`
- All test data uses `__test_` prefix for easy cleanup
- Always run cleanup (section 6) after testing to remove test data from Anki
- If a test fails, fix the code and re-test before committing
- Edge cases matter — test empty states, invalid input, error handling, not just happy paths

## Tech Stack Reminders

- Claude CLI via stdin pipe (`src/lib/claude-cli.ts`) — never pass prompts as CLI args
- No `@anthropic-ai/sdk` — all AI goes through `claude` CLI (Max subscription)
- Anki is source of truth — no database
- Image generation via Gemini API directly (not through Claude)
