import type {
  AnkiConnectRequest,
  AnkiConnectResponse,
  AnkiNote,
  CreateNoteParams,
  UpdateNoteParams,
} from "@/types/anki";
import { getConfig } from "./settings";

export class AnkiConnectClient {
  constructor(private readonly baseUrl: string | (() => string)) {}

  private get url(): string {
    return typeof this.baseUrl === "function" ? this.baseUrl() : this.baseUrl;
  }

  private async invoke<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<T> {
    const body: AnkiConnectRequest = { action, version: 6, params };
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`AnkiConnect HTTP error: ${res.status}`);
    }

    const data: AnkiConnectResponse<T> = await res.json();
    if (data.error) {
      throw new Error(`AnkiConnect error: ${data.error}`);
    }

    return data.result;
  }

  /** Check if AnkiConnect is reachable */
  async ping(): Promise<boolean> {
    try {
      await this.invoke("version");
      return true;
    } catch {
      return false;
    }
  }

  /** Get AnkiConnect version */
  async version(): Promise<number> {
    return this.invoke<number>("version");
  }

  /** List all deck names */
  async deckNames(): Promise<string[]> {
    return this.invoke<string[]>("deckNames");
  }

  /** List all model (note type) names */
  async modelNames(): Promise<string[]> {
    return this.invoke<string[]>("modelNames");
  }

  /** Get field names for a model */
  async modelFieldNames(modelName: string): Promise<string[]> {
    return this.invoke<string[]>("modelFieldNames", { modelName });
  }

  /** Create a new deck */
  async createDeck(deck: string): Promise<number> {
    return this.invoke<number>("createDeck", { deck });
  }

  /** Add a single note */
  async addNote(params: CreateNoteParams): Promise<number> {
    return this.invoke<number>("addNote", {
      note: {
        deckName: params.deckName,
        modelName: params.modelName,
        fields: params.fields,
        tags: params.tags,
        options: {
          allowDuplicate: false,
          duplicateScope: "deck",
        },
      },
    });
  }

  /** Add multiple notes at once */
  async addNotes(
    notes: CreateNoteParams[]
  ): Promise<(number | null)[]> {
    return this.invoke<(number | null)[]>("addNotes", {
      notes: notes.map((n) => ({
        deckName: n.deckName,
        modelName: n.modelName,
        fields: n.fields,
        tags: n.tags,
        options: {
          allowDuplicate: false,
          duplicateScope: "deck",
        },
      })),
    }, 120000);
  }

  /** Update fields of an existing note */
  async updateNoteFields(params: UpdateNoteParams): Promise<void> {
    await this.invoke("updateNoteFields", {
      note: {
        id: params.id,
        fields: params.fields,
      },
    });
  }

  /** Search for notes using Anki query syntax */
  async findNotes(query: string): Promise<number[]> {
    return this.invoke<number[]>("findNotes", { query }, 60000);
  }

  /** Get full note info for given IDs */
  async notesInfo(notes: number[]): Promise<AnkiNote[]> {
    return this.invoke<AnkiNote[]>("notesInfo", { notes }, 60000);
  }

  /** Store a media file in Anki */
  async storeMediaFile(
    filename: string,
    data: string // base64-encoded
  ): Promise<string> {
    return this.invoke<string>("storeMediaFile", { filename, data }, 120000);
  }

  /** Retrieve a media file from Anki (returns base64) */
  async retrieveMediaFile(filename: string): Promise<string> {
    return this.invoke<string>("retrieveMediaFile", { filename });
  }

  /** Delete notes by ID */
  async deleteNotes(notes: number[]): Promise<void> {
    await this.invoke("deleteNotes", { notes });
  }

  /** Add tags to notes */
  async addTags(notes: number[], tags: string): Promise<void> {
    await this.invoke("addTags", { notes, tags });
  }

  /** Search for cards using Anki query syntax */
  async findCards(query: string): Promise<number[]> {
    return this.invoke<number[]>("findCards", { query }, 60000);
  }

  /** Convert card IDs to note IDs */
  async cardsToNotes(cards: number[]): Promise<number[]> {
    return this.invoke<number[]>("cardsToNotes", { cards }, 60000);
  }

  /** Move cards to a deck */
  async changeDeck(cards: number[], deck: string): Promise<void> {
    await this.invoke("changeDeck", { cards, deck }, 120000);
  }

  /** Export a deck package to a path visible to the Anki instance */
  async exportPackage(
    deck: string,
    path: string,
    includeSched = false
  ): Promise<void> {
    await this.invoke("exportPackage", { deck, path, includeSched }, 120000);
  }

  /** Import a package from a path visible to the Anki instance */
  async importPackage(path: string): Promise<void> {
    await this.invoke("importPackage", { path }, 120000);
  }

  /** Delete decks, optionally deleting contained cards */
  async deleteDecks(decks: string[], cardsToo = false): Promise<void> {
    await this.invoke("deleteDecks", { decks, cardsToo }, 120000);
  }

  /** Request a sync */
  async sync(): Promise<void> {
    await this.invoke("sync", undefined, 120000);
  }

  /** Sync before write — non-blocking, logs warning on failure */
  async syncBeforeWrite(): Promise<void> {
    try {
      await this.invoke("sync", undefined, 120000);
    } catch (err) {
      console.warn("[AnkiConnect] Sync before write failed (continuing anyway):", err);
    }
  }
}

export function createAnkiClient(url: string): AnkiConnectClient {
  return new AnkiConnectClient(url);
}

export const ankiConnect = new AnkiConnectClient(() => getConfig("ANKI_CONNECT_URL"));
