import { NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";

export async function GET() {
  const checks = {
    ankiConnect: false,
    ankiVersion: null as number | null,
    deck: null as string | null,
    modelExists: false,
  };

  // Check AnkiConnect
  try {
    checks.ankiVersion = await ankiConnect.version();
    checks.ankiConnect = true;

    // Check deck and model
    const decks = await ankiConnect.deckNames();
    const deckName = "Gao English Spelling";
    if (decks.includes(deckName)) {
      checks.deck = deckName;
    }

    const models = await ankiConnect.modelNames();
    checks.modelExists = models.includes("school spelling+");
  } catch {
    // AnkiConnect not reachable
  }

  const allGood = checks.ankiConnect && checks.modelExists;

  return NextResponse.json({ ok: allGood, checks });
}
