# 2026-07-04 — Per-Instance Distribution (replace profile switching)

## Problem

Distribution currently works by switching profiles on a single Anki instance
(`loadProfileAndWait` + `ProfileLock`). This design:

- created the cache-invalidation windows behind the Default-deck bug (see
  `2026-07-03-deck-guard-model-pin-image-retry.md`),
- blocks the whole Anki instance during distribution (Telegram work queues up),
- costs 3–6 s of switch-confirmation waiting per profile hop.

Infrastructure has moved to **one dedicated Anki container per profile** with a
fixed AnkiConnect URL:

- Local test env (Podman, `~/services/anki/`): `anki-gaotian` → profile
  "Gao Tian" at `http://localhost:8770`; `anki-gaoyi` → profile "Gao Yi" at
  `http://localhost:8771`. Fresh empty profiles (only "Default" deck, stock
  notetypes).
- Production VPS: configured equivalently (separate agent manages deployment).

## Decisions (user-confirmed 2026-07-04)

1. **Auto-provision receivers.** When a target instance lacks the deck or
   notetype, create them automatically from the source instance's definitions.
2. **Remove the profile-switching machinery entirely.** No more
   `ProfileLock`, `loadProfileAndWait`, `ACTIVE_PROFILE`,
   `DISTRIBUTION_PROFILES`, `/api/anki/profiles`, or Settings profile-switch UI.
   Each instance permanently owns one profile.
3. **No delete propagation.** Deleting notes acts only on the instance being
   operated on. Rationale: libraries are not guaranteed mirrors (distribution
   failures, historical bugs, manual edits cause drift), and duplicates can
   share the same app-generated "Note ID" UUID (deck-scoped dedup search missed
   notes that fell into Default → re-add with same UUID). Propagating a dedup
   delete can therefore remove the *only* copy on another instance. A future,
   separate feature may add an explicit "retire word everywhere" action
   (match by Word field, per-instance preview, confirm) — out of scope here.

## Architecture

### Client factory (`src/lib/anki-connect.ts`)

- `createAnkiClient(url: string)` returns the same API surface as today's
  `ankiConnect` object, with every `invoke` bound to the given URL.
- The default export `ankiConnect` remains, bound dynamically to
  `getConfig("ANKI_CONNECT_URL")` (the **source** instance) — zero churn for
  existing callers.
- Deck placement guard (`ensureCardsInDeck`) applies to all clients.
- Removed methods: `getProfiles`, `loadProfile`, `loadProfileAndWait`.
- Removed export: `withProfileLock`.

### Configuration (`src/lib/settings.ts`)

- **New key** `DISTRIBUTION_TARGETS` (non-secret): comma-separated
  `Name=URL` pairs, e.g.
  `Gao Tian=http://localhost:8770, Gao Yi=http://localhost:8771`.
  Parsed by a new `getDistributionTargets(): { name: string; url: string }[]`
  helper (trims whitespace; entries without `=` or with empty name/URL are
  skipped with a console.warn).
- **Removed keys**: `ACTIVE_PROFILE`, `DISTRIBUTION_PROFILES`.
- Settings page: remove the profile-switcher section; `DISTRIBUTION_TARGETS`
  is edited through the existing generic settings mechanism.

### Distribution flow (shared, `src/lib/enrichment-pipeline.ts`)

`distributeToTargets(noteIds, targets, mediaCache?, progress?)` replaces
`distributeToProfiles`. For each target, sequentially, errors isolated
per-target (one failing target never aborts the others):

1. `createAnkiClient(target.url)`.
2. **Ensure notetype**: if `modelNames()` on the target lacks the source
   note's model, fetch the full definition from the **source** client
   (`modelFieldNames` + `modelTemplates` + `modelStyling` + cloze flag from
   `findModelsByName`) and `createModel` on the target.
3. **Ensure deck**: if `deckNames()` lacks the language deck, `createDeck`.
   (Replaces today's "Deck not found → skip" behavior.)
4. Store media files (`storeMediaFile`); the 2 s post-media settle delay is
   removed (it existed to protect profile switches).
5. Upsert notes by "Note ID" UUID: `findNotes(deck:"X" "<uuid>")` →
   `updateNoteFields` if found, else `addNote` (deck guard applies).
6. Best-effort `sync()` on the target after writes (pushes to the kid's
   AnkiWeb-connected devices; logs and continues on failure, e.g. test
   containers with no AnkiWeb login).

`DistributeResult.profile` carries the target **name**.

Callers updated: Telegram pipeline (`runFullPipeline`), `/api/anki/distribute`
(the route's own duplicated loop is replaced by a call into the shared
function).

### Delete flow (`/api/anki/notes` DELETE)

Deletes notes on the source instance only. The entire cross-profile deletion
block is removed. Response shape drops `profileResults` (UI updated
accordingly).

### UI

- Settings: remove profile switcher; distribution targets textarea/input.
- `ProfileIndicator` (shared component): remove — it displayed
  `ACTIVE_PROFILE`, which no longer exists. No replacement.
- Browse/other pages referencing distribution results: relabel "profiles" →
  "targets" where user-visible.

## Testing

- **Unit (Vitest, mocked fetch keyed by URL+action):**
  - targets parsing (`getDistributionTargets`): valid list, whitespace,
    malformed entries skipped;
  - `createAnkiClient` routes requests to its own URL; default client still
    follows `ANKI_CONNECT_URL`;
  - distribution: provisioning triggered when notetype/deck missing, not
    triggered when present; upsert add vs update paths; per-target error
    isolation; sync called best-effort;
  - delete: no cross-instance calls issued.
- **Integration (new, real local containers):** treat 8770 as source and 8771
  as target — seed source via AnkiConnect API with `__test_` data, run the
  real distribution, assert notetype/deck auto-created and note landed on
  8771, clean up both. Auto-skip when containers are unreachable.
- Existing suite stays green; tests referencing removed profile machinery are
  updated or deleted.

## Out of scope

- Parallel distribution across targets (sequential first).
- "Retire word everywhere" explicit global delete.
- Browse-page instance switcher (manage kids' instances from the portal).
- Reverse sync (receiver → source).
- WriteQueue removal/refactor.
