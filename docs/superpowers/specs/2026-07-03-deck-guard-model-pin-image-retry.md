# 2026-07-03 — Deck Placement Guard / CLI Model Pin / Image-Gen Retry

Three fixes from the 2026-07-03 bug report session.

## Background (root causes, evidence-verified)

1. **Cards landing in the "Default" deck.** AnkiConnect's `createNote` passes the
   target deck by mutating the in-memory cached notetype dict
   (`ankiNote.note_type()['did'] = deck['id']`). When that cache is invalidated
   between the mutation and the actual `addNote` (sync / profile-switch UI reset),
   Anki falls back to the notetype's *persisted* `did`. On our collections,
   `school Chinese spelling` has a dangling persisted `did` (1481705571524 — a
   long-deleted deck), so the backend falls back to Default (id=1). Observed: 81
   whole notes in Default on profile "Gao Tian", all Chinese/telegram, intermittent
   Mar–Jul 2026; English notetype has a valid `did` and never misplaces.
2. **Vision model drift.** `AI_BACKEND=cli` and `runClaude` passes no `--model`,
   so extraction quality tracks whatever the environment's Claude CLI default is
   (NAS Docker: CLI built-in default; dev machine: user's personal default).
   Decision: pin `claude-opus-4-8`.
3. **Image generation has no retry.** `generateImage` is a single fetch; transient
   Gemini errors fail the word permanently for that run.

## Acceptance Criteria

### A. Deck placement guard (`src/lib/anki-connect.ts`)

- **A1.** After `ankiConnect.addNote` successfully creates a note, it queries
  `findCards` with `nid:<noteId> -deck:"<deckName>"`. If any card IDs are
  returned, it calls `changeDeck` with those cards and the target deck, then
  returns the note ID.
- **A2.** If the query returns no cards (normal case), no `changeDeck` call is made.
- **A3.** `ankiConnect.addNotes` applies the same guard once for the whole batch:
  a single `findCards` query `nid:<id1>,<id2>,... -deck:"<deckName>"` over the
  non-null created IDs (deck taken from the first note; all callers pass one deck
  per batch). `changeDeck` only when misplaced cards exist.
- **A4.** If every ID in an `addNotes` result is null, the guard is skipped entirely.
- **A5.** Guard failures (findCards/changeDeck errors) are logged with
  `console.warn` and do **not** fail the add — the note was already created;
  the guard is best-effort defense.

### B. CLI model pin (`src/lib/claude-cli.ts`)

- **B1.** `runClaude` spawns the claude binary with `--model claude-opus-4-8`
  in its argument list. (`runClaudeJSON` / `runClaudeVision` delegate to
  `runClaude`, so they inherit the pin.)

### C. Image generation retry (`src/lib/enrichment-pipeline.ts` — `generateImage`)

- **C1.** On any failure (non-OK HTTP status, network error, or "No image
  returned from Gemini"), `generateImage` retries once after a 1000 ms delay —
  2 attempts total.
- **C2.** A successful first attempt makes exactly one HTTP request.
- **C3.** If both attempts fail, the last error is thrown.

## Out of scope

- One-time repair of the 81 misplaced notes (manual/scripted `changeDeck` per
  profile; pending user go-ahead — see session notes).
- Fixing the dangling notetype `did` inside Anki collections (the guard makes it moot).
