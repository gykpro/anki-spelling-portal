import { NextRequest, NextResponse } from "next/server";
import { runAIVision } from "@/lib/ai";

const EXTRACTION_PROMPT = `You are extracting spelling worksheet data from the provided images.

Return ONLY a JSON array (no markdown, no code fences) with this structure:
[
  {
    "pageNumber": 1,
    "termWeek": "Term X Week Y",
    "topic": "The topic title",
    "sentences": [
      { "number": 1, "sentence": "Full sentence exactly as written.", "word": "the underlined word or phrase" }
    ]
  }
]

Rules:
1. Extract term/week from the header "SPELLING LIST (Term X Week Y)"
2. Extract the topic from the subtitle
3. For each numbered sentence (1-10), copy it EXACTLY and identify the bold/underlined word or phrase
4. The underlined text may be a single word or a multi-word phrase - extract the ENTIRE underlined portion
5. Return ONLY valid JSON, nothing else
`;

function getMediaType(filename: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

/** POST: Upload images and extract via Anthropic Vision API */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // Convert files to base64 for vision API
    const images: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" }[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      images.push({
        base64: buffer.toString("base64"),
        mediaType: getMediaType(file.name),
      });
    }

    // Send images to AI backend (vision requires SDK)
    const pages = await runAIVision(EXTRACTION_PROMPT, images);

    return NextResponse.json({ pages });
  } catch (error) {
    console.error("Extraction error:", error);
    const message =
      error instanceof Error ? error.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
