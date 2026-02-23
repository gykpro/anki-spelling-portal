import { NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { getAllLanguages } from "@/lib/languages";

export async function GET() {
  const languages = getAllLanguages();
  const checks = {
    ankiConnect: false,
    ankiVersion: null as number | null,
    deck: null as string | null,
    modelExists: false,
    languages: {} as Record<
      string,
      { deck: boolean; model: boolean }
    >,
  };

  try {
    checks.ankiVersion = await ankiConnect.version();
    checks.ankiConnect = true;

    const decks = await ankiConnect.deckNames();
    const models = await ankiConnect.modelNames();

    for (const lang of languages) {
      const hasDeck = decks.includes(lang.deck);
      const hasModel = models.includes(lang.noteType);
      checks.languages[lang.id] = { deck: hasDeck, model: hasModel };
    }

    // Backward compat: set deck/modelExists based on English
    const english = languages.find((l) => l.id === "english");
    if (english) {
      checks.deck = decks.includes(english.deck) ? english.deck : null;
      checks.modelExists = models.includes(english.noteType);
    }
  } catch {
    // AnkiConnect not reachable
  }

  const allGood =
    checks.ankiConnect &&
    languages.some(
      (l) => checks.languages[l.id]?.deck && checks.languages[l.id]?.model
    );

  return NextResponse.json({ ok: allGood, checks });
}
