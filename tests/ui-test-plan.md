# UI Test Plan — Browser Automation

Follow this plan via Chrome browser automation. Improvise at each step based on
what you actually see on screen. Create test data, verify, then clean up.

## Test Setup

### Pre-requisites
1. **Anki** running with AnkiConnect plugin on `localhost:8765`
2. **Dev server** running on `localhost:3000` (`npm run dev`)
3. **Chrome browser** with Claude extension connected for browser automation

### Environment Setup
Before running tests, the following must be configured (via `/settings` page or `.env.local`):

| Service | Env Variable | Required For | How to Get |
|---------|-------------|--------------|------------|
| AnkiConnect | `ANKI_CONNECT_URL` | Sections 1-6 (all card operations) | Default `localhost:8765`, just have Anki open |
| Anthropic API | `ANTHROPIC_API_KEY` | Sections 4c-4n (text enrichment) | [console.anthropic.com](https://console.anthropic.com) |
| Azure TTS | `AZURE_TTS_KEY` + `AZURE_TTS_REGION` | Sections 4i, 4j, 4o (audio generation) | Azure Portal > Cognitive Services > Speech |
| Gemini API | `NANO_BANANA_API_KEY` | Sections 4e, 4p (image generation) | [aistudio.google.com](https://aistudio.google.com) |

### Setup Steps
1. Start Anki desktop app (ensure AnkiConnect plugin is installed)
2. Run `npm run dev` in the project root
3. Navigate to `http://localhost:3000/settings`
4. Enter the required API keys for the sections you plan to test
5. Click "Save Changes" and verify keys show as "Configured (from file)"
6. Start testing from Section 1

### What Can Be Tested Without API Keys
- **Section 1** (Dashboard) — only needs Anki running
- **Section 2** (Quick Add) — only needs Anki running
- **Section 3** (Browse) — only needs Anki running
- **Section 5** (Upload) — needs Anthropic API key for extraction
- **Section 7** (Settings) — no external services needed at all

---

## 1. Dashboard

### 1a. Health checks (happy path)
- Navigate to `/`
- Verify: AnkiConnect shows green + version, Deck shows "Gao English Spelling", Note Type shows "school spelling+"
- Click Refresh, verify status re-renders

### 1b. Health checks (AnkiConnect down)
- Stop Anki (or note: skip if can't control Anki)
- Navigate to `/`, verify disconnected/error states appear
- Restart Anki, click Refresh, verify recovery

### 1d. Needs Attention — stats display
- Navigate to `/`
- Verify "Card Completeness" section appears between System Status and Quick Actions
- Verify it shows "X of Y cards need attention" (or "All N cards are complete" if none missing)
- Verify stat chips show: "No Definition (N)", "No Audio (N)", "No Image (N)", "Complete (N)"
- Compare counts: navigate to `/browse`, apply "No Definition" filter, verify count matches dashboard chip
- Return to `/`, verify "Enrich N cards" button is shown when cards need attention

### 1e. Needs Attention — enrich link
- On dashboard, click the "Enrich N cards" button
- Verify it navigates to `/enrich?noteIds=...`
- Verify the enrich page loads with the correct number of cards matching the dashboard count

### 1f. Needs Attention — all complete state
- If all cards are complete, verify green "All N cards are complete" message with checkmark icon
- If not all complete, skip this test (cannot easily force all-complete state)

### 1c. Navigation
- Click each sidebar link (Dashboard, Upload, Quick Add, Browse, Enrich)
- Verify each page loads without error
- Click each quick action card on Dashboard, verify navigation

---

## 2. Quick Add

### 2a. Happy path
- Navigate to `/quick-add`
- Enter 3 test words: `__test_apple`, `__test_banana`, `__test_cherry`
- Verify button shows "Add 3 words to Anki"
- Submit, verify success message with "3 cards created"
- Verify "Enrich Cards" and "Add More" buttons appear

### 2b. Empty input
- Navigate to `/quick-add`
- Clear textarea completely
- Verify submit button is disabled or shows "Add 0 words"

### 2c. Duplicate detection — mixed input
- Navigate to `/quick-add`
- Enter `__test_dup_alpha`, `__test_dup_beta` and submit to create them first
- Click "Add More", enter `__test_dup_alpha`, `__test_dup_beta`, `__test_dup_gamma`
- Click submit — verify "Checking..." state appears briefly
- Verify duplicate warning panel appears with amber background
- Verify `__test_dup_alpha` and `__test_dup_beta` shown with "(exists — skipped)" and line-through
- Verify `__test_dup_gamma` shown as a normal chip (no strikethrough)
- Verify button says "Add 1 word to Anki"
- Click a duplicate chip to un-skip it — verify it changes to "(exists — will add)" and button updates to "Add 2 words"
- Click the duplicate chip again to re-skip it
- Click "Add 1 word to Anki"
- Verify success: 1 card created, 2 duplicates skipped

### 2d. Duplicate detection — all duplicates
- Navigate to `/quick-add`
- Enter only `__test_dup_alpha` (already exists from 2c)
- Submit — verify warning shows all as duplicates
- Verify button says "Add 0 words to Anki" and is disabled
- Click Cancel to return to input

### 2e. Duplicate detection — no duplicates
- Navigate to `/quick-add`
- Enter only `__test_dup_delta` (new word)
- Submit — verify no warning panel, proceeds directly to success

### 2g. Auto-Enrich button on success
- Navigate to `/quick-add`
- Enter 2 test words: `__test_autoenrich_one`, `__test_autoenrich_two`
- Submit, verify success message
- Verify "Enrich 2 Cards" button appears (primary style, Sparkles icon)
- Verify "Add More" button appears (secondary style)
- Verify "All Cards" link appears (secondary/outline style)
- Inspect the "Enrich 2 Cards" href — should contain `noteIds=<id1>,<id2>&autoEnrich=true`

### 2h. Auto-Enrich pipeline (end-to-end)
- From the success screen in 2g, click "Enrich 2 Cards"
- Verify enrich page loads with 2 cards
- Verify auto-enrich progress banner appears with "Generating text fields..." phase
- Wait for text generation to complete (up to 60s)
- Verify phase changes to "Saving text to Anki..."
- Verify phase changes to "Generating audio..."
- Verify phase changes to "Saving audio..."
- Verify final phase shows "Done! All cards enriched." with green success styling
- Verify cards refresh and show populated fields (sentence, definition, phonetic, synonyms, extra info, audio)
- Verify the `autoEnrich` param is removed from the URL (refresh should not re-trigger)

### 2f. Special characters
- Enter words with special chars: `__test_it's`, `__test_re-enter`
- Submit, verify they create successfully

---

## 3. Browse

### 3a. Card listing
- Navigate to `/browse`
- Verify total count shown, cards render in table
- Verify columns: Word, Sentence, Definition, Audio, Image, Tags

### 3b. Quick filters
- Click "No Definition" — verify only cards without definitions shown, count matches chip
- Click "No Audio" — same check
- Click "No Image" — same check
- Click "Complete" — verify all shown cards have all fields filled
- Click "All" — verify full list returns

### 3c. Column sorting
- Click "Word" header — verify alphabetical sort (A-Z)
- Click again — verify reverse sort (Z-A)
- Try sorting by other columns

### 3d. Pagination
- Verify pagination controls at bottom (page count, per-page selector)
- Click "Next", verify page 2 loads with different cards
- Change per-page to 50, verify more cards shown
- Click "Last", verify last page loads
- Click "First", verify return to page 1

### 3e. Search
- Type a known word in search box, click Search
- Verify filtered results
- Clear search, verify full list returns

### 3f. Empty results
- Search for a nonsensical string like `zzzznonexistent999`
- Verify empty state message appears gracefully

### 3g. Selection
- Check a few card checkboxes
- Verify selection bar appears with count
- Check "select all" header checkbox
- Verify all visible cards selected

---

## 4. Enrich

### 4a. Navigate with test cards
- Find the test note IDs for `__test_apple`, `__test_banana`, `__test_cherry` via AnkiConnect API
- Navigate to `/enrich?noteIds=<ids>`
- Verify 3 cards loaded, all showing "6 missing"

### 4b. Expand and inspect
- Click a test card to expand
- Verify 8 field boxes shown (Sentence, Definition, Phonetic, Synonyms, Extra Examples, Image, Word Audio, Sentence Audio)
- Verify Image and Sentence Audio show "Needs sentence" and are grayed out
- Verify "Select all empty" button present

### 4c. Generate text fields (critical — tests Anthropic SDK)
- On `__test_apple`, click "Select all empty"
- Verify 6 fields selected (not Image or Sentence Audio)
- Click "Generate", verify spinner appears
- Wait for results (up to 60s)
- Verify generated results preview shows: Sentence, Definition, Phonetic, Synonyms, Extra
- Verify results are sensible (related to "apple")

### 4d. Save to Anki
- Click "Save to Anki"
- Verify page refreshes, card now shows sentence and "2 missing" (Image + Sentence Audio)

### 4e. Image generation (requires sentence)
- Expand the saved card again
- Verify Image field is now available (no longer "Needs sentence")
- Select only Image
- Click Generate
- Wait for image result (up to 60s)
- Verify "Image generated" appears in results
- Save to Anki, verify card shows "Complete"

### 4f. Re-generate existing field
- Expand a card that already has a definition
- Click "Definition" (should show "(has)" indicator)
- Generate — verify it produces a new definition
- Optionally save or discard

### 4g. Empty enrich page
- Navigate to `/enrich?noteIds=999999999` (non-existent ID)
- Verify empty state or graceful handling

### 4h. Generate with no fields selected
- Expand a card, don't select any fields
- Verify Generate button is disabled

### 4i. Generate word audio
- On a test card that already has a Word value, expand the card
- Select only "Word Audio"
- Click Generate, verify spinner appears
- Wait for result (up to 15s — Azure TTS is fast)
- Verify audio player appears in results preview with play button
- Click play, verify audio plays (word pronunciation)
- Click "Save to Anki"
- Verify card refreshes, "Word Audio" field now shows "Has audio"
- In Anki, verify the Audio field contains `[sound:spelling_<word>_<noteId>.mp3]`

### 4k. Batch enrich — happy path
- Quick Add 3 test words: `__test_batch_one`, `__test_batch_two`, `__test_batch_three`
- Navigate to `/enrich` with those 3 note IDs
- Verify "Enrich All Empty" button visible in toolbar with count (3)
- Click "Enrich All Empty"
- Verify spinner appears, individual Generate buttons disabled
- Wait for completion (up to 120s — single CLI call for all 3)
- Verify all 3 cards show generated text results (sentence, definition, phonetic, synonyms, extra)
- Verify "Save All" button appears with count (3)
- Click "Save All"
- Verify all cards saved to Anki (progress shown)
- Refresh, verify all text fields populated

### 4l. Batch enrich — per-card error handling
- Quick Add 1 test word with unusual name: `__test_batch_odd_xyzzy`
- Navigate to enrich with that card
- Click "Enrich All Empty" — verify it processes (even single cards)
- Verify result or error shown for that card

### 4m. Batch with no empty fields
- On a card that already has all text fields filled, verify "Enrich All Empty" shows count (0) and is disabled

### 4n. Individual enrich still works after batch
- After batch enrichment, expand one card
- Select a single field manually
- Click Generate (individual) — verify it still works independently

### 4o. Batch audio generation
- On the enrich page with cards that have text fields filled but missing audio
- Verify "Generate All Audio (N)" button appears in toolbar with correct count
- Verify button is disabled when N=0 or during batch enrichment
- Click "Generate All Audio"
- Verify spinner appears, progress shows "Audio 1/N: word..."
- Wait for all audio to finish (up to 15s per card)
- Verify each card expands and shows audio player in results preview
- Verify "Save All" button appears with correct unsaved count
- Click "Save All", verify all audio saved to Anki
- Refresh, verify audio fields show "Has audio"

### 4p. Batch image generation
- On the enrich page with cards that have sentences but missing images
- Verify "Generate All Images (N)" button appears in toolbar with correct count
- Verify button is disabled when N=0 or during batch enrichment
- Click "Generate All Images"
- Verify spinner appears, progress shows "Images 1/N: word..."
- Wait for all images to finish (up to 15s per card)
- Verify each card expands and shows "Image generated" in results preview
- Verify "Save All" button appears with correct unsaved count
- Click "Save All", verify all images saved to Anki
- Refresh, verify image fields show "Has image"

### 4j. Generate sentence audio (requires sentence)
- On a test card that already has a Main Sentence, expand the card
- Verify "Sentence Audio" button is available (not grayed out)
- Select only "Sentence Audio"
- Click Generate, wait for result
- Verify audio player appears in results preview
- Click play, verify audio plays (full sentence)
- Save to Anki, verify "Sentence Audio" shows "Has audio"
- On a card WITHOUT a sentence, verify "Sentence Audio" shows "Needs sentence" and is unavailable

---

## 5. Upload & Extract

### 5a. Page load
- Navigate to `/upload`
- Verify file dropzone appears

### 5b. No files selected
- Verify submit/extract button is disabled without files

### 5c. Upload and extract (if sample images available)
- Drag or select sample worksheet images from `/private/tmp/spelling_pages/`
- Verify file previews appear
- Click extract, verify progress/loading state
- Verify extracted sentences appear in editable list
- Verify term/week and topic extracted correctly

### 5d. Duplicate flagging in review
- After extracting (5c), check if any extracted words already exist in Anki
- Verify duplicate cards show amber border and "duplicate" badge next to the word
- Verify non-duplicate cards have normal styling
- Verify user can remove duplicate cards with the trash button

### 5e. Edit extracted data
- Modify a word or sentence inline
- Verify edit persists in the review list

### 5f. Submit to Anki
- Submit extracted cards
- Verify success message with card count
- Go to Browse, verify new cards appear

---

## 6. Cleanup

After all tests:
- Find all test notes with `__test_` prefix via AnkiConnect:
  ```
  curl -s http://localhost:8765 -X POST \
    -d '{"action":"findNotes","version":6,"params":{"query":"deck:\"Gao English Spelling\" __test_*"}}'
  ```
- Delete them:
  ```
  curl -s http://localhost:8765 -X POST \
    -d '{"action":"deleteNotes","version":6,"params":{"notes":[<ids>]}}'
  ```
- Verify Browse page count returns to original

---

## 7. Settings

### 7a. Page load
- Navigate to `/settings`
- Verify page loads with three sections: "AI Backend", "API Keys", "Configuration"
- Verify "Save Changes" button is disabled (no changes yet)
- Verify sidebar shows "Settings" link with gear icon

### 7b. AI Backend section
- Verify three backend mode buttons: Auto, SDK, CLI
- Verify one is selected (highlighted with border)
- Verify "Active backend" badge shows current status (SDK/CLI/Not configured)
- Click a different backend mode — verify "Save Changes" enables
- Click "Save Changes" — verify save succeeds, badge may update

### 7c. View config status
- Verify each API key field shows status badge: "Configured" (green) or "Not set" (gray)
- Verify configured keys show source: "from file", "from env", or "default"
- Verify secret fields show masked value (e.g., "sk-a...1234") beneath input
- Verify non-secret fields (AZURE_TTS_REGION, ANKI_CONNECT_URL) show full current value

### 7d. Set a non-secret value
- In "Configuration" section, type `australiaeast` in AZURE_TTS_REGION field
- Verify "Save Changes" button enables
- Click "Save Changes" — verify "Saved" confirmation appears
- Reload page — verify AZURE_TTS_REGION shows "Configured (from file)"

### 7e. Set a secret value
- Type a test value in ANTHROPIC_API_KEY field (e.g., "sk-ant-test1234567890abcdef")
- Click "Save Changes" — verify save succeeds
- Verify status changes to "Configured (from file)"
- Verify masked value shows (e.g., "sk-a...cdef")
- Verify the input field is cleared (does not show the full key)

### 7f. Clear a stored value
- On a configured field, click the "Clear" button
- Verify field shows "Will remove stored value on save" warning in red
- Click "Save Changes" — verify value is cleared
- Verify status falls back to env var or "Not set"

### 7g. Eye toggle for secrets
- On a secret field, verify input type is "password" (dots shown)
- Click the eye icon — verify input switches to text (visible)
- Click again — verify it switches back to password

### 7h. Navigation integration
- Click "Settings" in sidebar — verify navigation works
- Click other sidebar links — verify they still work
- Return to Settings — verify state persists (saved values still shown)

---

## Notes

- Test words use `__test_` prefix for easy identification and cleanup
- Anthropic API generation takes 5-15s per card (single) or 10-20s total (batch) — budget time accordingly
- Image generation via Gemini takes 10-20s
- If a step fails, screenshot the error state and note it before continuing
- Skip section 1b if Anki cannot be stopped during testing
- Skip section 5c-5e if no sample worksheet images are available
