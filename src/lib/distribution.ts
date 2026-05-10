import { mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { ankiConnect, createAnkiClient } from "@/lib/anki-connect";
import { ensureAnkiSchema } from "@/lib/anki-init";
import { getConfig } from "@/lib/settings";
import { getLanguageById, getLanguageByNoteType } from "@/lib/languages";
import type { AnkiNote, DistributeResult } from "@/types/anki";

export interface DistributionProgress {
  update: (text: string) => Promise<void>;
}

interface DistributionAnkiClient {
  deckNames(): Promise<string[]>;
  modelNames(): Promise<string[]>;
  notesInfo(notes: number[]): Promise<AnkiNote[]>;
  findCards(query: string): Promise<number[]>;
  cardsToNotes(cards: number[]): Promise<number[]>;
  changeDeck(cards: number[], deck: string): Promise<void>;
  exportPackage(deck: string, path: string, includeSched?: boolean): Promise<void>;
  importPackage(path: string): Promise<void>;
  deleteDecks(decks: string[], cardsToo?: boolean): Promise<void>;
  findNotes(query: string): Promise<number[]>;
  deleteNotes(notes: number[]): Promise<void>;
}

interface DistributionFileOps {
  mkdir(path: string): void;
  unlink(path: string): void;
}

interface DistributeOptions {
  sourceClient: DistributionAnkiClient;
  targetEndpoints: string[];
  createTargetClient: (url: string) => DistributionAnkiClient;
  sharedPath: string;
  progress?: DistributionProgress;
  idFactory: () => string;
  fileOps: DistributionFileOps;
}

interface NoteGroup {
  deckName: string;
  noteIds: number[];
}

const defaultFileOps: DistributionFileOps = {
  mkdir(path: string) {
    mkdirSync(path, { recursive: true });
  },
  unlink(path: string) {
    try {
      unlinkSync(path);
    } catch {
      // Best-effort cleanup; AnkiConnect failures are reported separately.
    }
  },
};

export function getDistributionEndpoints(): string[] {
  return getConfig("DISTRIBUTION_ENDPOINTS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getExportSharedPath(): string {
  return getConfig("EXPORT_SHARED_PATH");
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "deck";
}

function tempDeckName(deckName: string, id: string): string {
  return `__anki_portal_export_${safePathPart(deckName)}_${safePathPart(id)}`;
}

function groupNotesByDeck(notes: AnkiNote[]): NoteGroup[] {
  const fallbackDeck = getLanguageById("english").deck;
  const grouped = new Map<string, number[]>();

  for (const note of notes) {
    const lang = getLanguageByNoteType(note.modelName);
    const deckName = lang?.deck ?? fallbackDeck;
    const existing = grouped.get(deckName) ?? [];
    existing.push(note.noteId);
    grouped.set(deckName, existing);
  }

  return Array.from(grouped.entries()).map(([deckName, noteIds]) => ({
    deckName,
    noteIds,
  }));
}

async function findCardsForNotes(
  client: Pick<DistributionAnkiClient, "findCards">,
  noteIds: number[]
): Promise<number[]> {
  const cards = new Set<number>();
  for (const noteId of noteIds) {
    const found = await client.findCards(`nid:${noteId}`);
    for (const cardId of found) cards.add(cardId);
  }
  return Array.from(cards);
}

function blankResult(endpoint: string): DistributeResult {
  return { target: endpoint, success: true, notesDistributed: 0 };
}

function appendEndpointError(result: DistributeResult, err: unknown): void {
  result.success = false;
  const msg = err instanceof Error ? err.message : "Distribution failed";
  result.error = result.error ? `${result.error}; ${msg}` : msg;
}

async function importPackageToTarget(
  target: DistributionAnkiClient,
  endpoint: string,
  packagePath: string,
  sourceDeck: string,
  transportDeck: string,
  result: DistributeResult,
  progress?: DistributionProgress
): Promise<void> {
  await progress?.update(`Importing cards to ${endpoint}...`);
  await target.importPackage(packagePath);

  const importedCards = await target.findCards(`deck:"${transportDeck}"`);
  const importedNotes = importedCards.length > 0
    ? new Set(await target.cardsToNotes(importedCards))
    : new Set<number>();

  if (importedCards.length > 0) {
    await target.changeDeck(importedCards, sourceDeck);
  }
  await target.deleteDecks([transportDeck], false);

  result.notesDistributed += importedNotes.size;
}

export async function distributeViaExportWithOptions(
  noteIds: number[],
  options: DistributeOptions
): Promise<DistributeResult[]> {
  const uniqueNoteIds = Array.from(new Set(noteIds)).filter((id) => Number.isFinite(id));
  if (uniqueNoteIds.length === 0 || options.targetEndpoints.length === 0) {
    return [];
  }

  options.fileOps.mkdir(options.sharedPath);

  const sourceNotes = await options.sourceClient.notesInfo(uniqueNoteIds);
  if (sourceNotes.length === 0) return [];

  const groups = groupNotesByDeck(sourceNotes);
  const results = new Map(
    options.targetEndpoints.map((endpoint) => [endpoint, blankResult(endpoint)])
  );
  const initializedEndpoints = new Set<string>();

  for (const group of groups) {
    const id = options.idFactory();
    const transportDeck = tempDeckName(group.deckName, id);
    const packagePath = join(options.sharedPath, `${transportDeck}.apkg`);
    const sourceCards = await findCardsForNotes(options.sourceClient, group.noteIds);

    if (sourceCards.length === 0) continue;

    try {
      try {
        await options.progress?.update(`Exporting ${group.noteIds.length} cards from ${group.deckName}...`);
        await options.sourceClient.changeDeck(sourceCards, transportDeck);
        await options.sourceClient.exportPackage(transportDeck, packagePath, false);
      } finally {
        await options.sourceClient.changeDeck(sourceCards, group.deckName);
        try {
          await options.sourceClient.deleteDecks([transportDeck], false);
        } catch {
          // The export deck is empty after restore; ignore cleanup failures.
        }
      }

      for (const endpoint of options.targetEndpoints) {
        const result = results.get(endpoint)!;
        let target: DistributionAnkiClient | null = null;
        try {
          target = options.createTargetClient(endpoint);
          if (!initializedEndpoints.has(endpoint)) {
            await ensureAnkiSchema(target, { sharedPath: options.sharedPath });
            initializedEndpoints.add(endpoint);
          }
          await importPackageToTarget(
            target,
            endpoint,
            packagePath,
            group.deckName,
            transportDeck,
            result,
            options.progress
          );
        } catch (err) {
          try {
            await target?.deleteDecks([transportDeck], true);
          } catch {
            // Best-effort target cleanup after a failed import.
          }
          appendEndpointError(result, err);
        }
      }
    } finally {
      options.fileOps.unlink(packagePath);
    }
  }

  return Array.from(results.values());
}

export async function distributeViaExport(
  noteIds: number[],
  progress?: DistributionProgress
): Promise<DistributeResult[]> {
  return distributeViaExportWithOptions(noteIds, {
    sourceClient: ankiConnect,
    targetEndpoints: getDistributionEndpoints(),
    createTargetClient: createAnkiClient,
    sharedPath: getExportSharedPath(),
    progress,
    idFactory: randomUUID,
    fileOps: defaultFileOps,
  });
}

export async function deleteFromEndpoints(
  uuids: string[],
  deckName: string
): Promise<DistributeResult[]> {
  const endpoints = getDistributionEndpoints();
  if (endpoints.length === 0 || uuids.length === 0) return [];

  const results: DistributeResult[] = [];
  for (const endpoint of endpoints) {
    const client = createAnkiClient(endpoint);
    const result = blankResult(endpoint);
    try {
      for (const uuid of uuids) {
        const found = await client.findNotes(`deck:"${deckName}" "${uuid}"`);
        if (found.length > 0) {
          await client.deleteNotes(found);
          result.notesDistributed += found.length;
        }
      }
    } catch (err) {
      appendEndpointError(result, err);
    }
    results.push(result);
  }

  return results;
}
