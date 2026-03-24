import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { writeQueue } from "@/lib/write-queue";

/** GET: Retrieve a media file from Anki */
export async function GET(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) {
      return NextResponse.json(
        { error: "filename is required" },
        { status: 400 }
      );
    }

    const base64Data = await ankiConnect.retrieveMediaFile(filename);
    if (!base64Data) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(base64Data, "base64");

    // Detect content type from extension
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const contentTypes: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Retrieve media error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to retrieve media file",
      },
      { status: 500 }
    );
  }
}

/** POST: Store a media file in Anki */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, data } = body;

    if (!filename || !data) {
      return NextResponse.json(
        { error: "filename and data (base64) are required" },
        { status: 400 }
      );
    }

    const result = await writeQueue.enqueue(() =>
      ankiConnect.storeMediaFile(filename, data)
    );

    return NextResponse.json({ filename: result });
  } catch (error) {
    console.error("Store media error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to store media file",
      },
      { status: 500 }
    );
  }
}
