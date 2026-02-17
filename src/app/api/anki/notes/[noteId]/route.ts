import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import type { SpellingNoteFields } from "@/types/anki";

/** PUT: Update fields of an existing note */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { noteId } = await params;
    const noteIdNum = parseInt(noteId, 10);
    if (isNaN(noteIdNum)) {
      return NextResponse.json(
        { error: "Invalid note ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const fields: Partial<SpellingNoteFields> = body.fields;

    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No fields provided" },
        { status: 400 }
      );
    }

    await ankiConnect.syncBeforeWrite();
    await ankiConnect.updateNoteFields({ id: noteIdNum, fields });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update note error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update note",
      },
      { status: 500 }
    );
  }
}
