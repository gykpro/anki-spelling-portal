import { ankiConnect, createAnkiClient, type AnkiClient } from "@/lib/anki-connect";
import { getLanguageByNoteType, getLanguageById } from "@/lib/languages";
import type { AnkiNote, DistributeResult } from "@/types/anki";

export type DistributionTarget = { name: string; url: string };
export type DistributionProgress = { update(msg: string): Promise<void> };

/**
 * Distribute source notes to dedicated per-profile Anki instances.
 * Sequential across targets; each target's failure is isolated so one
 * unreachable instance never blocks the others.
 */
export async function distributeToTargets(
  noteIds: number[],
  targets: DistributionTarget[],
  mediaCache?: Map<string, string>,
  progress?: DistributionProgress
): Promise<DistributeResult[]> {
  if (noteIds.length === 0 || targets.length === 0) return [];

  const sourceNotes = await ankiConnect.notesInfo(noteIds);
  if (sourceNotes.length === 0) return [];

  const lang = getLanguageByNoteType(sourceNotes[0].modelName);
  const deckName = lang?.deck ?? getLanguageById("english").deck;
  const modelName = lang?.noteType ?? getLanguageById("english").noteType;

  const results: DistributeResult[] = [];
  for (const target of targets) {
    if (progress) await progress.update(`Distributing to ${target.name}...`);
    results.push(
      await distributeToTarget(target, sourceNotes, deckName, modelName, mediaCache)
    );
  }
  return results;
}

async function distributeToTarget(
  target: DistributionTarget,
  sourceNotes: AnkiNote[],
  deckName: string,
  modelName: string,
  mediaCache?: Map<string, string>
): Promise<DistributeResult> {
  try {
    const client = createAnkiClient(target.url);

    await ensureModel(client, modelName, target.name);
    await ensureDeck(client, deckName, target.name);

    if (mediaCache && mediaCache.size > 0) {
      for (const [filename, data] of mediaCache) {
        try {
          await client.storeMediaFile(filename, data);
        } catch (err) {
          console.warn(
            `[Distribution] Failed to store media "${filename}" on "${target.name}":`,
            err
          );
        }
      }
    }

    let distributed = 0;
    for (const note of sourceNotes) {
      const fields: Record<string, string> = {};
      for (const [key, val] of Object.entries(note.fields)) {
        fields[key] = val.value;
      }
      const uuid = fields["Note ID"];
      if (!uuid) continue;

      const existing = await client.findNotes(`deck:"${deckName}" "${uuid}"`);
      if (existing.length > 0) {
        await client.updateNoteFields({ id: existing[0], fields });
      } else {
        try {
          await client.addNote({ deckName, modelName, fields, tags: note.tags });
        } catch {
          continue;
        }
      }
      distributed++;
    }

    // Best-effort: push to the target's AnkiWeb-connected devices.
    try {
      await client.sync();
    } catch (err) {
      console.warn(`[Distribution] Sync on "${target.name}" failed (continuing):`, err);
    }

    return { profile: target.name, success: true, notesDistributed: distributed };
  } catch (err) {
    console.error(`[Distribution] Error distributing to "${target.name}":`, err);
    return {
      profile: target.name,
      success: false,
      error: err instanceof Error ? err.message : "Distribution failed",
      notesDistributed: 0,
    };
  }
}

/** Create the notetype on the target from the source's full definition. */
async function ensureModel(
  client: AnkiClient,
  modelName: string,
  targetName: string
): Promise<void> {
  const models = await client.modelNames();
  if (models.includes(modelName)) return;

  console.log(`[Distribution] Provisioning notetype "${modelName}" on "${targetName}"`);
  const [srcModel] = await ankiConnect.findModelsByName([modelName]);
  const inOrderFields = await ankiConnect.modelFieldNames(modelName);
  const templates = await ankiConnect.modelTemplates(modelName);
  const styling = await ankiConnect.modelStyling(modelName);

  await client.createModel({
    modelName,
    inOrderFields,
    css: styling.css,
    isCloze: srcModel?.type === 1,
    cardTemplates: Object.entries(templates).map(([Name, t]) => ({
      Name,
      Front: t.Front,
      Back: t.Back,
    })),
  });
}

/** Create the deck on the target if missing. */
async function ensureDeck(
  client: AnkiClient,
  deckName: string,
  targetName: string
): Promise<void> {
  const decks = await client.deckNames();
  if (decks.includes(deckName)) return;
  console.log(`[Distribution] Provisioning deck "${deckName}" on "${targetName}"`);
  await client.createDeck(deckName);
}
