import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { getAllLanguages, getLanguageByDeck } from "@/lib/languages";

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

  let missingDefinition = 0;
  let missingAudio = 0;
  let missingImage = 0;
  let missingSentence = 0;
  const needsAttentionNoteIds: number[] = [];

  for (const note of notes) {
    const def = note.fields?.Definition?.value?.trim();
    const audio = note.fields?.Audio?.value?.trim();
    const picture = note.fields?.Picture?.value?.trim();
    const sentence = note.fields?.["Main Sentence"]?.value?.trim();

    const hasDef = !!def;
    const hasAudio = !!audio;
    const hasPicture = !!picture;
    const hasSentence = !!sentence;

    if (!hasDef) missingDefinition++;
    if (!hasAudio) missingAudio++;
    if (!hasPicture) missingImage++;
    if (!hasSentence) missingSentence++;

    if (!hasDef || !hasAudio || !hasPicture) {
      needsAttentionNoteIds.push(note.noteId);
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
    complete,
    needsAttention,
    needsAttentionNoteIds,
  };
}
