import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { getAllLanguages, getLanguageByDeck } from "@/lib/languages";
import { getCardCompleteness } from "@/lib/card-completeness";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const deckParam = request.nextUrl.searchParams.get("deck");

    // If a specific deck is requested, return stats for that deck only
    if (deckParam) {
      return NextResponse.json(await getDeckStats(deckParam));
    }

    // Otherwise, return stats for all configured decks
    const languages = getAllLanguages();
    const allStats: Record<string, unknown> = {};

    for (const lang of languages) {
      allStats[lang.id] = await getDeckStats(lang.deck);
    }

    // Backward compat: also return flat stats for English (dashboard uses this)
    const english = languages.find((l) => l.id === "english");
    const englishStats = english
      ? (allStats[english.id] as Record<string, unknown>)
      : null;

    return NextResponse.json({
      ...(englishStats || emptyStats()),
      byLanguage: allStats,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch stats",
      },
      { status: 500 }
    );
  }
}

function emptyStats() {
  return {
    total: 0,
    missingDefinition: 0,
    missingAudio: 0,
    missingImage: 0,
    missingSentence: 0,
    missingPhonetic: 0,
    missingSentenceAudio: 0,
    missingStrokeOrder: 0,
    missingSynonyms: 0,
    missingExtraInfo: 0,
    missingSentencePinyin: 0,
    complete: 0,
    needsAttention: 0,
    needsAttentionNoteIds: [],
  };
}

async function getDeckStats(deck: string) {
  const noteIds = await ankiConnect.findNotes(`deck:"${deck}"`);
  const total = noteIds.length;

  if (total === 0) return emptyStats();

  const notes = await ankiConnect.notesInfo(noteIds);
  const lang = getLanguageByDeck(deck);
  const isChinese = lang?.id === "chinese";

  let missingDefinition = 0;
  let missingAudio = 0;
  let missingImage = 0;
  let missingSentence = 0;
  let missingPhonetic = 0;
  let missingSentenceAudio = 0;
  let missingStrokeOrder = 0;
  let missingSynonyms = 0;
  let missingExtraInfo = 0;
  let missingSentencePinyin = 0;
  const needsAttentionNoteIds: number[] = [];

  for (const note of notes) {
    const result = getCardCompleteness(note.fields, isChinese);

    if (!result.complete) {
      needsAttentionNoteIds.push(note.noteId);
    }

    for (const key of result.missing) {
      switch (key) {
        case "definition": missingDefinition++; break;
        case "audio": missingAudio++; break;
        case "image": missingImage++; break;
        case "sentence": missingSentence++; break;
        case "phonetic": missingPhonetic++; break;
        case "sentence_audio": missingSentenceAudio++; break;
        case "strokeOrder": missingStrokeOrder++; break;
        case "synonyms": missingSynonyms++; break;
        case "extra_info": missingExtraInfo++; break;
        case "sentencePinyin": missingSentencePinyin++; break;
      }
    }
  }

  const needsAttention = needsAttentionNoteIds.length;
  const complete = total - needsAttention;

  return {
    total,
    missingDefinition,
    missingAudio,
    missingImage,
    missingSentence,
    missingPhonetic,
    missingSentenceAudio,
    missingStrokeOrder,
    missingSynonyms,
    missingExtraInfo,
    missingSentencePinyin,
    complete,
    needsAttention,
    needsAttentionNoteIds,
  };
}
