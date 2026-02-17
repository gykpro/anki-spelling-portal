import { NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";

/** POST: Trigger Anki sync */
export async function POST() {
  try {
    await ankiConnect.sync();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
