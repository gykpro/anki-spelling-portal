# 2026-07-04 — Full Re-distribution Entry Point

## Problem

After the per-instance migration, receivers have historical gaps (notes that
failed to distribute under the old profile-switching architecture). Cutover
step 7 in `docs/ops-per-instance-distribution.md` needs a one-shot "re-distribute
everything" action. Additionally, notes *added* to a receiver during
re-distribution need their media files (audio/images) copied from the source,
or the healed cards render broken — normal pipeline distribution carries
freshly generated media in memory, but historical notes' media only exists in
the source's media folder.

## Acceptance Criteria

### A. Media copy on add (`src/lib/distribution.ts`)

- **A1.** `distributeToTargets` accepts an options argument
  `{ copyMediaOnAdd?: boolean }`. When set and a note is **added** (not
  updated) on a target, media filenames referenced by the note's fields —
  `[sound:<file>]` and `<img src="<file>">` patterns — are fetched from the
  source (`retrieveMediaFile`) and stored on the target (`storeMediaFile`)
  before the `addNote`.
- **A2.** The update path never triggers media copy (existing cards already
  have their media).
- **A3.** Per-file failures (missing on source, store error) warn and
  continue; they never fail the note or the target.

### B. `redistributeAll` (`src/lib/distribution.ts`)

- **B1.** `redistributeAll(targets, progress?)` scans **both** language decks
  on the source (`findNotes('deck:"<deck>"')` for English and Chinese),
  batches note IDs in chunks of 25, and calls the shared distribution flow
  per chunk with `copyMediaOnAdd: true`.
- **B2.** Returns `{ notesScanned, results }` where `results` aggregates
  per-target: `{ profile, success, notesDistributed }` summed across batches;
  a target is `success: false` if any batch failed (first error message kept).
- **B3.** Empty decks / no targets → returns zeros without network writes.

### C. API route (`POST /api/anki/redistribute`)

- **C1.** Body `{ targetProfiles?: string[] }` — names filtered against
  `getDistributionTargets()`; omitted/empty → all configured targets.
- **C2.** Runs inside the write queue; responds with `redistributeAll`'s
  result.
- **C3.** No matching targets configured → 400.

## Out of scope

- Dashboard/Settings UI button (API + documented curl is the cutover
  deliverable; UI entry can follow).
- Progress streaming (long-running request is acceptable for a one-shot admin
  operation; documented in the ops doc).
- Reconciliation report (separate todo item).
