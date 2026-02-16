import type {
  AnkiConnectRequest,
  AnkiConnectResponse,
  AnkiNote,
  CreateNoteParams,
  UpdateNoteParams,
} from "@/types/anki";
import { getConfig } from "./settings";

async function invoke<T = unknown>(
  action: string,
  params?: Record<string, unknown>
): Promise<T> {
  const url = getConfig("ANKI_CONNECT_URL");
  const body: AnkiConnectRequest = { action, version: 6, params };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export const ankiConnect = {
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

  /** Create a new deck */
  async createDeck(deck: string): Promise<number> {
    return invoke<number>("createDeck", { deck });
  },

  /** Add a single note */
  async addNote(params: CreateNoteParams): Promise<number> {
    return invoke<number>("addNote", {
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
  },

  /** Add multiple notes at once */
  async addNotes(
    notes: CreateNoteParams[]
  ): Promise<(number | null)[]> {
    return invoke<(number | null)[]>("addNotes", {
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
    });
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
    return invoke<number[]>("findNotes", { query });
  },

  /** Get full note info for given IDs */
  async notesInfo(notes: number[]): Promise<AnkiNote[]> {
    return invoke<AnkiNote[]>("notesInfo", { notes });
  },

  /** Store a media file in Anki */
  async storeMediaFile(
    filename: string,
    data: string // base64-encoded
  ): Promise<string> {
    return invoke<string>("storeMediaFile", { filename, data });
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
    await invoke("sync");
  },
};
