import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";

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

    const result = await ankiConnect.storeMediaFile(filename, data);

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
