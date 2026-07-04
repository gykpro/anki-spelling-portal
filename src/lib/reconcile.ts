import { ankiConnect, createAnkiClient, type AnkiClient } from "@/lib/anki-connect";
import { getAllLanguages } from "@/lib/languages";
import type { DistributionTarget } from "@/lib/distribution";

export type NoteKey = { uuid: string; word: string };

export type LibraryDiff = {
  missingOnTarget: NoteKey[];
  extraOnTarget: NoteKey[];
  wordMismatches: { uuid: string; sourceWord: string; targetWord: string }[];
  duplicateUuidsOnSource: { uuid: string; count: number; word: string }[];
  duplicateUuidsOnTarget: { uuid: string; count: number; word: string }[];
};

function countByUuid(notes: NoteKey[]): Map<string, { count: number; word: string }> {
  const map = new Map<string, { count: number; word: string }>();
  for (const n of notes) {
    if (!n.uuid) continue; // un-reconcilable
    const entry = map.get(n.uuid);
    if (entry) entry.count++;
    else map.set(n.uuid, { count: 1, word: n.word });
  }
  return map;
}

/** Pure, read-only comparison of two libraries keyed by "Note ID" UUID. */
export function compareLibraries(source: NoteKey[], target: NoteKey[]): LibraryDiff {
  const src = countByUuid(source);
  const tgt = countByUuid(target);

  const missingOnTarget: NoteKey[] = [];
  const wordMismatches: LibraryDiff["wordMismatches"] = [];
  for (const [uuid, s] of src) {
    const t = tgt.get(uuid);
    if (!t) {
      missingOnTarget.push({ uuid, word: s.word });
    } else if (t.word !== s.word) {
      wordMismatches.push({ uuid, sourceWord: s.word, targetWord: t.word });
    }
  }

  const extraOnTarget: NoteKey[] = [];
  for (const [uuid, t] of tgt) {
    if (!src.has(uuid)) extraOnTarget.push({ uuid, word: t.word });
  }

  const duplicates = (map: Map<string, { count: number; word: string }>) =>
    [...map.entries()]
      .filter(([, v]) => v.count > 1)
      .map(([uuid, v]) => ({ uuid, count: v.count, word: v.word }));

  return {
    missingOnTarget,
    extraOnTarget,
    wordMismatches,
    duplicateUuidsOnSource: duplicates(src),
    duplicateUuidsOnTarget: duplicates(tgt),
  };
}

const NOTES_INFO_BATCH = 100;

/** Fetch {uuid, word} for every note in a deck. Read-only. */
async function fetchNoteKeys(client: AnkiClient, deck: string): Promise<NoteKey[]> {
  const noteIds = await client.findNotes(`deck:"${deck}"`);
  const keys: NoteKey[] = [];
  for (let i = 0; i < noteIds.length; i += NOTES_INFO_BATCH) {
    const infos = await client.notesInfo(noteIds.slice(i, i + NOTES_INFO_BATCH));
    for (const note of infos) {
      keys.push({
        uuid: note.fields["Note ID"]?.value ?? "",
        word: note.fields["Word"]?.value ?? "",
      });
    }
  }
  return keys;
}

export type DeckReport = {
  deck: string;
  sourceCount: number;
  targetCount: number;
} & LibraryDiff;

export type ReconcileReport = {
  targets: { profile: string; decks: DeckReport[] }[];
};

/** Compare every configured language deck on each target against the source. */
export async function reconcileTargets(
  targets: DistributionTarget[]
): Promise<ReconcileReport> {
  const report: ReconcileReport = { targets: [] };

  for (const target of targets) {
    const client = createAnkiClient(target.url);
    const decks: DeckReport[] = [];
    for (const lang of getAllLanguages()) {
      const sourceKeys = await fetchNoteKeys(ankiConnect, lang.deck);
      const targetKeys = await fetchNoteKeys(client, lang.deck);
      decks.push({
        deck: lang.deck,
        sourceCount: sourceKeys.length,
        targetCount: targetKeys.length,
        ...compareLibraries(sourceKeys, targetKeys),
      });
    }
    report.targets.push({ profile: target.name, decks });
  }

  return report;
}
