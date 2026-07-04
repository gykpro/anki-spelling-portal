# 2026-07-04 — Instance Reconciliation Report

## Problem

Libraries drift (failed distributions, historical bugs, manual edits). Before
and after cutover we need a **read-only** report of how each target differs
from the source, so cleanup decisions stay human. Also surfaces duplicate
"Note ID" UUIDs — the failure mode behind the dedup-delete danger.

## Acceptance Criteria

### A. Pure comparison (`src/lib/reconcile.ts`)

- **A1.** `compareLibraries(source: NoteKey[], target: NoteKey[])` where
  `NoteKey = { uuid: string; word: string }` returns:
  - `missingOnTarget: NoteKey[]` — UUIDs present on source, absent on target
  - `extraOnTarget: NoteKey[]` — UUIDs present on target, absent on source
  - `wordMismatches: { uuid, sourceWord, targetWord }[]` — same UUID, different Word
  - `duplicateUuidsOnSource` / `duplicateUuidsOnTarget: { uuid, count, word }[]` —
    UUIDs appearing more than once on that side
- **A2.** Notes with an empty UUID are ignored (they can't be reconciled).

### B. Report endpoint (`GET /api/anki/reconcile`)

- **B1.** For each configured target (optionally filtered by
  `?target=<name>`), and for each language deck, fetches `{uuid, word}` for
  every note on source and target and returns the comparison plus counts:
  `{ targets: [{ profile, decks: [{ deck, sourceCount, targetCount, ...comparison }] }] }`.
- **B2.** Strictly read-only: only `findNotes` / `notesInfo` calls are issued.
- **B3.** No matching targets configured → 400.

## Out of scope

- Any automatic fixing/deleting (report only).
- UI page (curl / ops usage; UI can come with the Browse instance switcher).
