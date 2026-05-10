import { describe, expect, it } from "vitest";
import { distributeViaExportWithOptions } from "@/lib/distribution";
import type { AnkiNote } from "@/types/anki";

type Call = { action: string; args: unknown[] };

class FakeAnkiClient {
  calls: Call[] = [];

  constructor(
    private readonly notes: AnkiNote[] = [],
    private readonly cardsByQuery: Record<string, number[]> = {},
    private readonly notesByCards: Record<number, number> = {}
  ) {}

  async deckNames(): Promise<string[]> {
    this.calls.push({ action: "deckNames", args: [] });
    return ["Gao English Spelling", "Gao Chinese"];
  }

  async modelNames(): Promise<string[]> {
    this.calls.push({ action: "modelNames", args: [] });
    return ["school spelling", "school Chinese spelling"];
  }

  async notesInfo(notes: number[]): Promise<AnkiNote[]> {
    this.calls.push({ action: "notesInfo", args: [notes] });
    return this.notes.filter((note) => notes.includes(note.noteId));
  }

  async findCards(query: string): Promise<number[]> {
    this.calls.push({ action: "findCards", args: [query] });
    return this.cardsByQuery[query] ?? [];
  }

  async cardsToNotes(cards: number[]): Promise<number[]> {
    this.calls.push({ action: "cardsToNotes", args: [cards] });
    return cards.map((card) => this.notesByCards[card]).filter((id): id is number => id !== undefined);
  }

  async changeDeck(cards: number[], deck: string): Promise<void> {
    this.calls.push({ action: "changeDeck", args: [cards, deck] });
  }

  async exportPackage(deck: string, path: string, includeSched?: boolean): Promise<void> {
    this.calls.push({ action: "exportPackage", args: [deck, path, includeSched] });
  }

  async importPackage(path: string): Promise<void> {
    this.calls.push({ action: "importPackage", args: [path] });
  }

  async deleteDecks(decks: string[], cardsToo?: boolean): Promise<void> {
    this.calls.push({ action: "deleteDecks", args: [decks, cardsToo] });
  }

  async findNotes(query: string): Promise<number[]> {
    this.calls.push({ action: "findNotes", args: [query] });
    return [];
  }

  async deleteNotes(notes: number[]): Promise<void> {
    this.calls.push({ action: "deleteNotes", args: [notes] });
  }
}

function makeNote(noteId: number, modelName: string): AnkiNote {
  return { noteId, modelName, fields: {}, tags: [] };
}

describe("distributeViaExportWithOptions", () => {
  it("exports each source deck through a temp deck and imports it into target endpoints", async () => {
    const source = new FakeAnkiClient(
      [
        makeNote(1, "school spelling"),
        makeNote(2, "school Chinese spelling"),
      ],
      {
        "nid:1": [11],
        "nid:2": [22],
      }
    );
    const target = new FakeAnkiClient(
      [],
      {
        'deck:"__anki_portal_export_Gao_English_Spelling_fixed-id"': [101],
        'deck:"__anki_portal_export_Gao_Chinese_fixed-id"': [102],
      },
      { 101: 1001, 102: 1002 }
    );
    const removedFiles: string[] = [];

    const results = await distributeViaExportWithOptions([1, 2], {
      sourceClient: source,
      targetEndpoints: ["http://target:8765"],
      createTargetClient: () => target,
      sharedPath: "/exports",
      idFactory: () => "fixed-id",
      fileOps: {
        mkdir: () => undefined,
        unlink: (path) => removedFiles.push(path),
      },
    });

    expect(results).toEqual([
      { target: "http://target:8765", success: true, notesDistributed: 2 },
    ]);
    expect(source.calls).toContainEqual({
      action: "changeDeck",
      args: [[11], "__anki_portal_export_Gao_English_Spelling_fixed-id"],
    });
    expect(source.calls).toContainEqual({
      action: "exportPackage",
      args: [
        "__anki_portal_export_Gao_English_Spelling_fixed-id",
        "/exports/__anki_portal_export_Gao_English_Spelling_fixed-id.apkg",
        false,
      ],
    });
    expect(source.calls).toContainEqual({
      action: "changeDeck",
      args: [[11], "Gao English Spelling"],
    });
    expect(source.calls).toContainEqual({
      action: "changeDeck",
      args: [[22], "__anki_portal_export_Gao_Chinese_fixed-id"],
    });
    expect(source.calls).toContainEqual({
      action: "changeDeck",
      args: [[22], "Gao Chinese"],
    });
    expect(target.calls).toContainEqual({
      action: "changeDeck",
      args: [[101], "Gao English Spelling"],
    });
    expect(target.calls).toContainEqual({
      action: "changeDeck",
      args: [[102], "Gao Chinese"],
    });
    expect(removedFiles).toEqual([
      "/exports/__anki_portal_export_Gao_English_Spelling_fixed-id.apkg",
      "/exports/__anki_portal_export_Gao_Chinese_fixed-id.apkg",
    ]);
  });

  it("restores the source deck and reports endpoint import failures", async () => {
    const source = new FakeAnkiClient(
      [makeNote(1, "school spelling")],
      { "nid:1": [11] }
    );
    const target = new FakeAnkiClient();
    target.importPackage = async (path: string) => {
      target.calls.push({ action: "importPackage", args: [path] });
      throw new Error("target down");
    };
    const removedFiles: string[] = [];

    const results = await distributeViaExportWithOptions([1], {
      sourceClient: source,
      targetEndpoints: ["http://target:8765"],
      createTargetClient: () => target,
      sharedPath: "/exports",
      idFactory: () => "fixed-id",
      fileOps: {
        mkdir: () => undefined,
        unlink: (path) => removedFiles.push(path),
      },
    });

    expect(results).toEqual([
      {
        target: "http://target:8765",
        success: false,
        error: "target down",
        notesDistributed: 0,
      },
    ]);
    expect(source.calls).toContainEqual({
      action: "changeDeck",
      args: [[11], "Gao English Spelling"],
    });
    expect(removedFiles).toEqual([
      "/exports/__anki_portal_export_Gao_English_Spelling_fixed-id.apkg",
    ]);
  });
});
