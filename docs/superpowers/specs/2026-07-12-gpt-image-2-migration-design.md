# 2026-07-12 — GPT Image 2 Provider Migration (C17)

## Authority and base

- Product authority: coverage v0.10, SHA-256
  `8c597674997f77b42c3501172678ecc7c1953890c7eeec890bf0ce04e57c53c9`.
- Repository base: `feat/per-instance-distribution` at
  `e04a97b1295a4768fae7f425919fe3e8ddd7a42b`.
- Official API evidence:
  - <https://developers.openai.com/api/docs/guides/image-generation>
  - <https://developers.openai.com/api/reference/resources/images/methods/generate>
  - <https://developers.openai.com/api/docs/models/gpt-image-2>

## Problem

Image generation still depends on Gemini/Nano Banana in runtime code,
configuration, Settings, startup status, tests, and current documentation. Its
retry loop retries permanent errors, ignores provider retry guidance, and can
accept an empty image. Several portal and CLI paths can then report success even
when the image was not generated or was not finalized in Anki media.

The owner has ruled that this milestone retires Gemini completely and uses one
OpenAI `gpt-image-2` Image API path while preserving existing illustrations and
the current literal, child-friendly, text-free flashcard prompt intent.

## Design decisions

1. Use a small direct `fetch` transport for `POST
   https://api.openai.com/v1/images/generations`. The repository has no OpenAI
   SDK dependency, already mocks provider calls at `fetch`, and needs one
   explicit application-owned retry policy. This avoids dependency and nested
   retry behavior while following the official HTTP contract.
2. Extract the provider transport and PNG validation into
   `src/lib/openai-image.ts`. Keep the existing public
   `generateImage(word, sentence) -> { base64, mimeType }` and
   `generateAndSaveImage() -> MediaFile[]` contracts so portal, Telegram, skill,
   and later C06 distribution continue through one seam.
3. Keep image work sequential (concurrency 1). Make at most two attempts: the
   first request plus one retry. Retry only network failures and HTTP 408, 409,
   429, or 5xx responses. Honor `Retry-After` (seconds or HTTP date) when it is
   valid; otherwise wait 1000 ms. Each attempt times out after 120 seconds, and
   that timeout is a transient network failure eligible for the one retry.
   Permanent 4xx responses and malformed/empty HTTP-200 payloads fail
   immediately.
4. OpenAI access remains Settings-file-only. One shared `OPENAI_API_KEY` in the
   existing `data/secrets.json` is secret, masked, and not environment-backed;
   there is no image-specific key or second secret store. C17 reads that shared
   setting for images but does not migrate the current Azure TTS path. Unknown
   settings keys are rejected and are not re-persisted, so a retired key cannot
   be reintroduced through the Settings API. Existing deployed legacy
   credentials are removed/revoked by Otto after the approved rollback window;
   they are never converted or copied.
5. A generated image is successful only when `data[0].b64_json` is canonical
   base64 and decodes to a complete PNG: standard signature, first `IHDR`,
   non-empty image data, and a terminal `IEND`, with valid raw chunk-type
   bytes. The provider result is always returned as `image/png`.
6. Image field mutation is ordered: validate generated PNG -> store/finalize the
   media file -> verify the media response -> update `Picture`. A failed media
   write never creates or reports a `Picture` reference.
7. Every requested batch item has an explicit outcome: `succeeded`, `failed`,
   or `not attempted`. Requested words/note IDs that cannot be resolved remain
   visible as not attempted. Independent cards continue after a card-local
   failure. Progress remains sequential and names the current card. Completion
   reports outcome counts, never attempted-card counts as success. CLI exit is
   0 only when all requested items succeed, 1 for partial completion, and 2
   when zero succeed or the run is fatal.
8. Existing images and historical dated design/incident documents remain
   untouched. Current code, active tests, setup/handoff documents, and UI/status
   labels must contain no active Gemini/Nano Banana endpoint, key, fallback, or
   provider claim.

## Acceptance criteria

### A. OpenAI Image API transport

- **A1.** `generateImage` reads `OPENAI_API_KEY`. When absent, it fails before
  any network request with an actionable configuration error.
- **A2.** One generation request uses Bearer authentication and exactly:
  `model: "gpt-image-2"`, `n: 1`, `size: "1024x1024"`,
  `quality: "medium"`, and `output_format: "png"`.
- **A3.** The prompt retains the source sentence and vocabulary word and the
  existing simple, literal, child-friendly, uncluttered intent while explicitly
  prohibiting all visible text, letters, labels, captions, and watermarks.
- **A4.** A valid `data[0].b64_json` PNG returns
  `{ base64, mimeType: "image/png" }`. No URL response or alternate provider
  fallback is accepted.

### B. Bounded and honest failure handling

- **B1.** Network failures, per-attempt 120-second timeouts, and HTTP 408, 409,
  429, and 5xx responses retry once. A valid `Retry-After` controls the delay;
  invalid values use the 1000 ms fallback delay.
- **B2.** Other 4xx responses do not retry. Errors name the OpenAI image request
  and HTTP status without exposing the API key.
- **B3.** Empty `data`, missing/empty `b64_json`, non-canonical/invalid base64,
  or decoded non-PNG bytes fail immediately and never report success.
- **B4.** After two transient failures, the final named failure is returned.

### C. Atomic media finalization

- **C1.** `generateAndSaveImage` validates PNG bytes before calling Anki media
  storage, stores a `.png`, waits for a non-empty safe finalized filename, uses
  the exact filename returned by Anki, and only then updates `Picture`.
- **C2.** A failed or empty media-store response leaves `Picture` unchanged and
  surfaces a card-specific failure.
- **C3.** Portal and CLI save paths check the media endpoint's HTTP result. They
  never swallow an image-store failure or count an empty `Picture` as success.
  Save All counts that card as failed, leaves it unsaved, and excludes it from
  distribution.

### D. Complete caller outcomes

- **D1.** Portal single-card generation shows `image_error` as failure and does
  not offer/save an image that is absent.
- **D2.** Portal batch image generation runs with max concurrency 1, continues
  after a card-local failure, and reports each card plus final succeeded / failed
  / not-attempted counts. It never says "done for N" when any item failed.
- **D3.** Telegram's shared pipeline continues independent cards and retains a
  named error for every failed image item in its returned result.
- **D4.** `enrich-image.mjs`, `enrich-full.mjs`, and the worksheet `--enrich`
  path propagate image generation and media-save failures into final JSON;
  every requested word/note ID occurrence remains present in request order,
  including duplicates, with unresolved input or a missing sentence explicitly
  not attempted. The worksheet wrapper forwards that JSON and exact status.
  Exit is 0 only when all requested items succeeded, 1 for partial completion,
  and 2 when none succeeded/fatal.

### E. Configuration and provider retirement

- **E1.** `OPENAI_API_KEY` replaces `NANO_BANANA_API_KEY` in the typed registry,
  Settings UI, masked status, and startup report. The API never returns its raw
  value.
- **E2.** Settings writes accept only registered keys and prune unknown stored
  keys on the next save. The retired key cannot be posted back into the file.
- **E3.** Current runtime, skill, README, setup/handoff/Telegram docs, active
  tests, startup output, and tracked permission allowlist contain no active
  Gemini/Nano Banana endpoint, key, or fallback. The dated 2026-07-03 incident
  spec remains historical and the roadmap labels its old retry rule superseded.
- **E4.** `/data` is excluded from Docker build context so local secrets never
  enter a build context or image layer.
- **E5.** A newly created `data/secrets.json` is written with mode 0600 rather
  than being created permissively and tightened only afterward.

### F. Verification and handoff

- **F1.** All automated provider/network tests are fully mocked and use only a
  synthetic tiny PNG. No normal test command reads a real OpenAI key or makes a
  paid request.
- **F2.** Targeted Vitest, CLI outcome tests, `npm test`, and `npm run build`
  pass on one exact commit. Static retirement checks find no active legacy
  provider residue.
- **F3.** Live app-integrated generate -> save -> preview -> Gao Tian-only
  delivery is a separate private smoke on the frozen build. It runs once only
  after Otto privately injects an authorized non-production key. Its absence is
  reported as blocked, never inferred from the raw API probe.
- **F4.** Dev hands Otto the exact commit/image contract, outbound requirement
  (`api.openai.com:443`), Settings key name, restart command, mocked gate results,
  and the still-blocked private smoke. No key or image payload enters chat, git,
  archives, Docker context, or `~/services/anki-dev`.

## Out of scope

- C05-C07 Browse/source-first implementation (task #3 remains separately
  owner-gated and will start from the promoted C17 head).
- C06's strict existing-child media repair and child-library preview routing.
- Provisioning or validating production credentials, billing budgets, provider
  tier/IPM, rollback duration, or revoking the live Gemini key (C18/Otto).
- Re-generating or migrating existing saved illustrations.
- Rewriting clearly historical dated specs/plans to pretend they used OpenAI.
