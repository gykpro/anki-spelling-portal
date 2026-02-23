/** Fields for the "school spelling" (English) note type */
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

/** Fields for the "school Chinese spelling" note type */
export interface ChineseSpellingNoteFields {
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
  "Main Sentence Pinyin": string;
  "Stroke Order Anim": string;
  is_dictation: string;
  is_dictation_from_mem: string;
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
  fields: Record<string, string>;
  tags: string[];
}

export interface UpdateNoteParams {
  id: number;
  fields: Record<string, string>;
}

export interface DistributeResult {
  profile: string;
  success: boolean;
  error?: string;
  notesDistributed: number;
}
