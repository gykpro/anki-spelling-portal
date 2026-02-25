# Project Conventions

## Development Workflow

Follow this order for every feature request or change:

1. **Plan first** — Enter plan mode, explore the codebase, and write an implementation plan for user approval before writing code.
2. **Implement** — Write the code following the approved plan.
3. **Update tests** — If the change affects UI behavior, update `tests/ui-test-plan.md` to reflect new or modified scenarios. Add new sections for new features, revise existing steps for changed behavior, remove obsolete cases.
4. **Self-test** — Always run the UI test plan sections related to the new/changed features via browser automation. This is mandatory, not optional. Report results in a table. Fix any failures before proceeding.
5. **Update Skill** - The project provides a skill for agents who wants to utilise the capabilities. Always check if the usage of new features are covered in generated skill document
6. **Commit** — After tests pass, create a git commit with a descriptive message summarizing the change.
7. **CRITICAL — Continue** — NEVER stop after a commit. Always do one of: (a) if there are more features to implement, immediately start the next one (back to step 1); (b) if unsure what to do next, use `AskUserQuestion` with a menu of options. You must NEVER end your turn silently after step 5. Stopping without asking is a workflow violation.

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

- Test plan lives at `tests/ui-test-plan.md`
- All test data uses `__test_` prefix for easy cleanup
- Always run cleanup (section 6) after testing to remove test data from Anki
- If a test fails, fix the code and re-test before committing
- Edge cases matter — test empty states, invalid input, error handling, not just happy paths

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
