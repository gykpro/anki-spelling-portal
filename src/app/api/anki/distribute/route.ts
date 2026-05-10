import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { distributeViaExport } from "@/lib/distribution";
import { writeQueue } from "@/lib/write-queue";

/** POST: Export notes from the central Anki instance and import them into configured endpoints. */
export async function POST(request: NextRequest) {
  try {
    const { noteIds } = await request.json();

    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json(
        { error: "noteIds is required" },
        { status: 400 }
      );
    }

    const results = await writeQueue.enqueue(async () => {
      await ankiConnect.syncBeforeWrite();
      return distributeViaExport(noteIds);
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Distribute error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Distribution failed" },
      { status: 500 }
    );
  }
}
