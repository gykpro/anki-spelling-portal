export interface DefinitionResult {
  word: string;
  phonetic: string;
  definition: string;
  synonyms: string[];
  extraInfo: string;
}

export interface TTSResult {
  /** Base64-encoded audio data */
  base64: string;
  /** Audio format (e.g., "mp3") */
  format: string;
}

export interface ImageGenResult {
  /** Base64-encoded image data */
  imageBase64: string;
  /** Image format (e.g., "png") */
  format: string;
  /** Generated filename */
  filename: string;
  /** The prompt used to generate the image */
  prompt: string;
}

export interface EnrichmentProgress {
  noteId: number;
  word: string;
  field: string;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
}

export interface BatchEnrichRequest {
  cards: { noteId: number; word: string; sentence?: string }[];
  fields: ("sentence" | "definition" | "phonetic" | "synonyms" | "extra_info")[];
}

export interface BatchEnrichResultItem {
  noteId: number;
  word: string;
  sentence?: string;
  definition?: string;
  phonetic?: string;
  synonyms?: string[];
  extra_info?: string;
  sentencePinyin?: string;
  error?: string;
}

export interface BatchEnrichResponse {
  results: BatchEnrichResultItem[];
  succeeded: number;
  failed: number;
}
