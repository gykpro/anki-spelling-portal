/** Fields for the "school spelling" note type */
export interface SpellingNoteFields {
  Word: string;
  "Main Sentence": string;
  Cloze: string;
  "Phonetic symbol": string;
  Audio: string;
  "Main Sentence Audio": string;
  Definition: string;
  "Extra information": string;
  Picture: string;
  Synonyms: string;
  "Note ID": string;
  is_dictation_mem: string;
}

export interface AnkiNote {
  noteId: number;
  modelName: string;
  fields: Record<string, { value: string; order: number }>;
  tags: string[];
  /** Modification timestamp (seconds since epoch) */
  mod?: number;
}

export interface AnkiConnectRequest {
  action: string;
  version: 6;
  params?: Record<string, unknown>;
}

export interface AnkiConnectResponse<T = unknown> {
  result: T;
  error: string | null;
}

export interface CreateNoteParams {
  deckName: string;
  modelName: string;
  fields: Partial<SpellingNoteFields>;
  tags: string[];
}

export interface UpdateNoteParams {
  id: number;
  fields: Partial<SpellingNoteFields>;
}
