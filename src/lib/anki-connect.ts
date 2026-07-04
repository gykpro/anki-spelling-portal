import type {
  AnkiConnectRequest,
  AnkiConnectResponse,
  AnkiNote,
  CreateNoteParams,
  UpdateNoteParams,
} from "@/types/anki";
import { getConfig } from "./settings";

/**
 * Create an AnkiConnect client bound to a specific instance URL.
 * Without a URL, the client follows getConfig("ANKI_CONNECT_URL") dynamically
 * (the source instance). Per-target clients for distribution pass a fixed URL.
 */
export function createAnkiClient(urlOverride?: string) {
  const resolveUrl = () => urlOverride ?? getConfig("ANKI_CONNECT_URL");

  async function invoke<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<T> {
    const body: AnkiConnectRequest = { action, version: 6, params };
    const res = await fetch(resolveUrl(), {
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

  /**
   * AnkiConnect passes the target deck to Anki by mutating an in-memory cached
   * notetype dict; when that cache is invalidated mid-add (sync, profile-switch
   * reset), Anki falls back to the notetype's persisted deck id — which can be
   * dangling and resolve to "Default". Verify placement after adding and move
   * misplaced cards back to the requested deck. Best-effort: the note already
   * exists, so guard failures must not fail the add.
   */
  async function ensureCardsInDeck(noteIds: number[], deckName: string): Promise<void> {
    if (noteIds.length === 0) return;
    try {
      const misplaced = await invoke<number[]>("findCards", {
        query: `nid:${noteIds.join(",")} -deck:"${deckName}"`,
      });
      if (misplaced.length > 0) {
        console.warn(
          `[AnkiConnect] ${misplaced.length} card(s) landed outside "${deckName}", moving back`
        );
        await invoke("changeDeck", { cards: misplaced, deck: deckName });
      }
    } catch (err) {
      console.warn(`[AnkiConnect] Deck placement guard failed for "${deckName}":`, err);
    }
  }

  return {
    /** Check if AnkiConnect is reachable */
    async ping(): Promise<boolean> {
      try {
        await invoke("version");
        return true;
      } catch {
        return false;
      }
    },

    /** Get AnkiConnect version */
    async version(): Promise<number> {
      return invoke<number>("version");
    },

    /** List all deck names */
    async deckNames(): Promise<string[]> {
      return invoke<string[]>("deckNames");
    },

    /** List all model (note type) names */
    async modelNames(): Promise<string[]> {
      return invoke<string[]>("modelNames");
    },

    /** Get field names for a model */
    async modelFieldNames(modelName: string): Promise<string[]> {
      return invoke<string[]>("modelFieldNames", { modelName });
    },

    /** Get full model definitions (includes `type`: 0 standard, 1 cloze) */
    async findModelsByName(
      modelNames: string[]
    ): Promise<Array<{ id: number; type: number } & Record<string, unknown>>> {
      return invoke("findModelsByName", { modelNames });
    },

    /** Get card templates for a model: { [templateName]: { Front, Back } } */
    async modelTemplates(
      modelName: string
    ): Promise<Record<string, { Front: string; Back: string }>> {
      return invoke("modelTemplates", { modelName });
    },

    /** Get CSS styling for a model */
    async modelStyling(modelName: string): Promise<{ css: string }> {
      return invoke("modelStyling", { modelName });
    },

    /** Create a new note type */
    async createModel(params: {
      modelName: string;
      inOrderFields: string[];
      css: string;
      isCloze: boolean;
      cardTemplates: { Name: string; Front: string; Back: string }[];
    }): Promise<unknown> {
      return invoke("createModel", { ...params });
    },

    /** Create a new deck */
    async createDeck(deck: string): Promise<number> {
      return invoke<number>("createDeck", { deck });
    },

    /** Add a single note */
    async addNote(params: CreateNoteParams): Promise<number> {
      const noteId = await invoke<number>("addNote", {
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
      await ensureCardsInDeck([noteId], params.deckName);
      return noteId;
    },

    /** Add multiple notes at once. All notes in a batch target the same deck. */
    async addNotes(notes: CreateNoteParams[]): Promise<(number | null)[]> {
      const noteIds = await invoke<(number | null)[]>(
        "addNotes",
        {
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
        },
        120000
      );
      const created = noteIds.filter((id): id is number => id !== null);
      if (created.length > 0) {
        await ensureCardsInDeck(created, notes[0].deckName);
      }
      return noteIds;
    },

    /** Find cards using Anki query syntax */
    async findCards(query: string): Promise<number[]> {
      return invoke<number[]>("findCards", { query });
    },

    /** Move cards to a deck */
    async changeDeck(cards: number[], deck: string): Promise<void> {
      await invoke("changeDeck", { cards, deck });
    },

    /** Update fields of an existing note */
    async updateNoteFields(params: UpdateNoteParams): Promise<void> {
      await invoke("updateNoteFields", {
        note: {
          id: params.id,
          fields: params.fields,
        },
      });
    },

    /** Search for notes using Anki query syntax */
    async findNotes(query: string): Promise<number[]> {
      return invoke<number[]>("findNotes", { query }, 60000);
    },

    /** Get full note info for given IDs */
    async notesInfo(notes: number[]): Promise<AnkiNote[]> {
      return invoke<AnkiNote[]>("notesInfo", { notes }, 60000);
    },

    /** Store a media file in Anki */
    async storeMediaFile(
      filename: string,
      data: string // base64-encoded
    ): Promise<string> {
      return invoke<string>("storeMediaFile", { filename, data }, 120000);
    },

    /** Retrieve a media file from Anki (returns base64) */
    async retrieveMediaFile(filename: string): Promise<string> {
      return invoke<string>("retrieveMediaFile", { filename });
    },

    /** Delete notes by ID */
    async deleteNotes(notes: number[]): Promise<void> {
      await invoke("deleteNotes", { notes });
    },

    /** Add tags to notes */
    async addTags(notes: number[], tags: string): Promise<void> {
      await invoke("addTags", { notes, tags });
    },

    /** Request a sync */
    async sync(): Promise<void> {
      await invoke("sync", undefined, 120000);
    },

    /** Sync before write — non-blocking, logs warning on failure */
    async syncBeforeWrite(): Promise<void> {
      try {
        await invoke("sync", undefined, 120000);
      } catch (err) {
        console.warn("[AnkiConnect] Sync before write failed (continuing anyway):", err);
      }
    },
  };
}

export type AnkiClient = ReturnType<typeof createAnkiClient>;

/** Default client — the source instance, follows ANKI_CONNECT_URL config. */
export const ankiConnect = createAnkiClient();
