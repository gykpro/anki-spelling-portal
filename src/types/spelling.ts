export interface ExtractedSentence {
  /** 1-based index from the worksheet */
  number: number;
  /** Full sentence text (empty string for word-only worksheets) */
  sentence: string;
  /** The underlined word or phrase to be tested */
  word: string;
}

export interface ExtractedPage {
  /** Page number (1-based) */
  pageNumber: number;
  /** Term and week info, e.g. "Term 2 Week 3" */
  termWeek: string;
  /** Topic/theme of the week, e.g. "Predators and Prey" */
  topic: string;
  /** Extracted sentences */
  sentences: ExtractedSentence[];
}

export interface SpellingCard {
  /** Unique ID for this card in the session (client-generated) */
  id: string;
  /** The underlined word/phrase */
  word: string;
  /** Full sentence */
  sentence: string;
  /** Formatted main sentence with word highlighted in bold */
  mainSentence: string;
  /** Cloze deletion format */
  cloze: string;
  /** Term/week tag */
  termWeek: string;
  /** Topic tag */
  topic: string;
  /** Whether this card has been edited by the user */
  edited: boolean;
  /** Whether this word already exists in Anki */
  isDuplicate?: boolean;
}

export interface UploadSession {
  /** Session ID */
  id: string;
  /** Original file name */
  fileName: string;
  /** Extracted pages */
  pages: ExtractedPage[];
  /** Cards built from extraction, ready for review */
  cards: SpellingCard[];
  /** Timestamp */
  createdAt: string;
}
