import { NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const noteIds = await ankiConnect.findNotes('deck:"Gao English Spelling"');
    const total = noteIds.length;

    if (total === 0) {
      return NextResponse.json({
        total: 0,
        missingDefinition: 0,
        missingAudio: 0,
        missingImage: 0,
        missingSentence: 0,
        complete: 0,
        needsAttention: 0,
        needsAttentionNoteIds: [],
      });
    }

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

    return NextResponse.json({
      total,
      missingDefinition,
      missingAudio,
      missingImage,
      missingSentence,
      complete,
      needsAttention,
      needsAttentionNoteIds,
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
