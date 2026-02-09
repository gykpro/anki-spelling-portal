import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import type { CreateNoteParams } from "@/types/anki";

/** GET: Search for notes in the spelling deck */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || 'deck:"Gao English Spelling"';
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const noteIds = await ankiConnect.findNotes(query);
    const limitedIds = noteIds.slice(0, limit);

    if (limitedIds.length === 0) {
      return NextResponse.json({ notes: [], total: 0 });
    }

    const notes = await ankiConnect.notesInfo(limitedIds);

    return NextResponse.json({
      notes,
      total: noteIds.length,
    });
  } catch (error) {
    console.error("Notes search error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to search notes",
      },
      { status: 500 }
    );
  }
}

/** POST: Create new notes in Anki */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const notes: CreateNoteParams[] = body.notes;

    if (!notes || notes.length === 0) {
      return NextResponse.json(
        { error: "No notes provided" },
        { status: 400 }
      );
    }

    // Ensure deck exists
    await ankiConnect.createDeck(notes[0].deckName);

    const results = await ankiConnect.addNotes(notes);

    const created = results.filter((id) => id !== null).length;
    const failed = results.filter((id) => id === null).length;

    return NextResponse.json({
      results,
      summary: { total: notes.length, created, failed },
    });
  } catch (error) {
    console.error("Create notes error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create notes",
      },
      { status: 500 }
    );
  }
}
