# Project Conventions

## Development Workflow

Follow this order for every feature request or change:

1. **Plan first** — Enter plan mode, explore the codebase, and write an implementation plan for user approval before writing code.
2. **Implement** — Write the code following the approved plan.
3. **Update tests** — If the change affects UI behavior, update `tests/ui-test-plan.md` to reflect new or modified scenarios. Add new sections for new features, revise existing steps for changed behavior, remove obsolete cases.
4. **Self-test** — Run the relevant sections of the UI test plan via browser automation. Report results in a table. Fix any failures before proceeding.
5. **Commit** — After tests pass, create a git commit with a descriptive message summarizing the change.

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
