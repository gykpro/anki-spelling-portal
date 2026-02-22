import { NextRequest, NextResponse } from "next/server";
import { runAIVision } from "@/lib/ai";
import { EXTRACTION_PROMPT } from "@/lib/enrichment-pipeline";

function getMediaType(filename: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf" {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
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
    const images: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf" }[] = [];
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
