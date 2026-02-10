# UI Test Plan — Browser Automation

Follow this plan via Chrome browser automation. Improvise at each step based on
what you actually see on screen. Create test data, verify, then clean up.

Pre-requisites: Anki running with AnkiConnect, dev server on localhost:3000.

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

### 2c. Duplicate words
- Navigate to `/quick-add`
- Enter a word that already exists in Anki (pick one from Browse)
- Submit, observe behavior (should show error or duplicate warning)

### 2d. Special characters
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

### 4c. Generate text fields (critical — tests Claude CLI)
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

### 5d. Edit extracted data
- Modify a word or sentence inline
- Verify edit persists in the review list

### 5e. Submit to Anki
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

## Notes

- Test words use `__test_` prefix for easy identification and cleanup
- Claude CLI generation takes 15-30s per card — budget time accordingly
- Image generation via Gemini takes 10-20s
- If a step fails, screenshot the error state and note it before continuing
- Skip section 1b if Anki cannot be stopped during testing
- Skip section 5c-5e if no sample worksheet images are available
