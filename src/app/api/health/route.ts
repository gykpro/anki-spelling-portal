import { NextResponse } from "next/server";
import { ankiConnect, createAnkiClient } from "@/lib/anki-connect";
import { getDistributionEndpoints } from "@/lib/distribution";
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
    distributionEndpoints: [] as {
      url: string;
      ankiConnect: boolean;
      ankiVersion: number | null;
    }[],
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

  for (const endpoint of getDistributionEndpoints()) {
    const client = createAnkiClient(endpoint);
    const endpointCheck = {
      url: endpoint,
      ankiConnect: false,
      ankiVersion: null as number | null,
    };
    try {
      endpointCheck.ankiVersion = await client.version();
      endpointCheck.ankiConnect = true;
    } catch {
      // Target endpoint not reachable.
    }
    checks.distributionEndpoints.push(endpointCheck);
  }

  const allGood =
    checks.ankiConnect &&
    languages.some(
      (l) => checks.languages[l.id]?.deck && checks.languages[l.id]?.model
    ) &&
    checks.distributionEndpoints.every((endpoint) => endpoint.ankiConnect);

  return NextResponse.json({ ok: allGood, checks });
}
