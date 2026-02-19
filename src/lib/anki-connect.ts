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
  params?: Record<string, unknown>,
  timeoutMs = 30000
): Promise<T> {
  const url = getConfig("ANKI_CONNECT_URL");
  const body: AnkiConnectRequest = { action, version: 6, params };
  const res = await fetch(url, {
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

// Profile-switching mutex: serialize all profile switches
let profileLock: Promise<void> = Promise.resolve();

export async function withProfileLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const myLock = new Promise<void>((r) => {
    release = r;
  });
  const prev = profileLock;
  profileLock = myLock;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
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

  /** Get all Anki profile names */
  async getProfiles(): Promise<string[]> {
    return invoke<string[]>("getProfiles");
  },

  /** Load/switch to a specific profile */
  async loadProfile(name: string): Promise<boolean> {
    return invoke<boolean>("loadProfile", { name });
  },

  /**
   * Load a profile and wait until AnkiConnect is fully ready on the new profile.
   * AnkiConnect's loadProfile returns immediately but the actual switch takes
   * several seconds. We snapshot deck names before switching, then poll until
   * they change (confirming the new profile is loaded).
   */
  async loadProfileAndWait(name: string, maxWaitMs = 15000): Promise<void> {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Snapshot current deck names to detect when the switch actually happens
    let decksBefore: string[] = [];
    try {
      decksBefore = await invoke<string[]>("deckNames");
    } catch {
      // If we can't get decks (Anki transitioning), that's ok
    }

    // Issue the profile switch
    await invoke("loadProfile", { name });

    // Wait for Anki to actually complete the switch.
    // We detect this by polling deckNames — when the response differs from
    // the snapshot, the new profile is loaded. If already on the target profile,
    // just wait for AnkiConnect to be responsive after a brief pause.
    await delay(2000);

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const decksNow = await invoke<string[]>("deckNames");
        // If deck list changed, the switch completed
        if (JSON.stringify(decksNow) !== JSON.stringify(decksBefore)) {
          return;
        }
        // If decks are the same (same profile or identical deck setup),
        // accept after a reasonable wait
        if (Date.now() - start >= 3000) {
          return;
        }
      } catch {
        // AnkiConnect not ready yet during transition
      }
      await delay(500);
    }
    // Even if we couldn't confirm the switch, proceed after timeout
    // (the profile may have the same deck setup)
  },

  /** Request a sync */
  async sync(): Promise<void> {
    await invoke("sync");
  },

  /** Sync before write — non-blocking, logs warning on failure */
  async syncBeforeWrite(): Promise<void> {
    try {
      await invoke("sync");
    } catch (err) {
      console.warn("[AnkiConnect] Sync before write failed (continuing anyway):", err);
    }
  },
};
