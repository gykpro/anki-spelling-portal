import { NextRequest, NextResponse } from "next/server";
import { extractWordsFromSentence } from "@/lib/enrichment-pipeline";
import { detectLanguage } from "@/lib/languages";

export async function POST(request: NextRequest) {
  try {
    const { sentence } = await request.json();
    if (!sentence || typeof sentence !== "string") {
      return NextResponse.json({ error: "No sentence provided" }, { status: 400 });
    }
    const lang = detectLanguage(sentence);
    const words = await extractWordsFromSentence(sentence, lang);
    return NextResponse.json({ words, lang: lang.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
