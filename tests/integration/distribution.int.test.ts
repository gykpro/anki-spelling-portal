import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnkiClient } from "@/lib/anki-connect";
import { distributeToTargets } from "@/lib/distribution";
import { getConfig } from "@/lib/settings";

/**
 * Real-container integration test (plan 2026-07-04, Task 7).
 * Treats the local Podman test instances as source (8770, anki-gaotian)
 * and target (8771, anki-gaoyi). Auto-skips when either is unreachable,
 * so `npm run test:integration` is safe to run anywhere.
 *
 * NOT part of `npm test` — run explicitly with `npm run test:integration`.
 */

const SOURCE_URL = "http://localhost:8770";
const TARGET_URL = "http://localhost:8771";

const source = createAnkiClient(SOURCE_URL);
const target = createAnkiClient(TARGET_URL);

let skipReason: string | null = null;

beforeAll(async () => {
  if (!(await source.ping())) skipReason = `source ${SOURCE_URL} unreachable`;
  else if (!(await target.ping())) skipReason = `target ${TARGET_URL} unreachable`;

  if (skipReason) {
    console.warn(`[integration] Skipping: ${skipReason}`);
    return;
  }

  // distributeToTargets reads the source via the default ankiConnect client,
  // which follows ANKI_CONNECT_URL (file value > env). Point it at the source
  // container; bail out loudly if a file-configured value shadows the env var.
  process.env.ANKI_CONNECT_URL = SOURCE_URL;
  if (getConfig("ANKI_CONNECT_URL") !== SOURCE_URL) {
    skipReason =
      "ANKI_CONNECT_URL is set in data/secrets.json and shadows the env override; " +
      "unset it there to run the integration test";
    console.warn(`[integration] Skipping: ${skipReason}`);
  }
});

const MODEL = "school Chinese spelling";
const DECK = "Gao Chinese";
const FIELDS = [
  "Word", "Main Sentence", "Cloze", "Phonetic symbol", "Audio",
  "Main Sentence Audio", "Definition", "Extra information", "Picture",
  "Synonyms", "Note ID", "is_dictation_mem", "Main Sentence Pinyin",
  "Stroke Order Anim", "is_dictation", "is_dictation_from_mem",
];

const TEST_UUID = `__test_${Date.now()}`;

async function ensureSourceModel() {
  const models = await source.modelNames();
  if (models.includes(MODEL)) return;
  await source.createModel({
    modelName: MODEL,
    inOrderFields: FIELDS,
    css: ".card {}",
    isCloze: false,
    cardTemplates: [
      { Name: "Card 1", Front: "{{Word}}", Back: "{{Main Sentence}}" },
      { Name: "Card 2", Front: "{{Main Sentence}}", Back: "{{Word}}" },
    ],
  });
}

afterAll(async () => {
  if (skipReason) return;
  for (const client of [source, target]) {
    try {
      const notes = await client.findNotes(`"${TEST_UUID}"`);
      if (notes.length > 0) await client.deleteNotes(notes);
    } catch {
      // cleanup is best-effort
    }
  }
});

describe("per-instance distribution (real containers)", () => {
  it(
    "distributes a note from 8770 to 8771, auto-provisioning model and deck",
    { timeout: 60_000 },
    async (ctx) => {
      if (skipReason) return ctx.skip();

      await ensureSourceModel();
      const decks = await source.deckNames();
      if (!decks.includes(DECK)) await source.createDeck(DECK);

      const fields = Object.fromEntries(FIELDS.map((f) => [f, ""]));
      fields["Word"] = "__test_word";
      fields["Main Sentence"] = "__test sentence";
      fields["Note ID"] = TEST_UUID;
      const sourceNoteId = await source.addNote({
        deckName: DECK,
        modelName: MODEL,
        fields,
        tags: ["__test"],
      });
      expect(sourceNoteId).toBeGreaterThan(0);

      const results = await distributeToTargets(
        [sourceNoteId],
        [{ name: "Gao Yi", url: TARGET_URL }]
      );

      expect(results[0].success).toBe(true);
      expect(results[0].notesDistributed).toBe(1);
      expect(await target.modelNames()).toContain(MODEL);
      expect(await target.deckNames()).toContain(DECK);
      const found = await target.findNotes(`"${TEST_UUID}"`);
      expect(found).toHaveLength(1);

      // Idempotency: distributing again updates, doesn't duplicate
      const again = await distributeToTargets(
        [sourceNoteId],
        [{ name: "Gao Yi", url: TARGET_URL }]
      );
      expect(again[0].success).toBe(true);
      expect(await target.findNotes(`"${TEST_UUID}"`)).toHaveLength(1);
    }
  );
});
