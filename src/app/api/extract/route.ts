import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { runClaudeJSON } from "@/lib/claude-cli";

const UPLOAD_DIR = join(process.cwd(), ".uploads");

const EXTRACTION_PROMPT = `You are extracting spelling worksheet data. For each image file listed below, read it and extract the data.

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

Now read these image files and extract the data:
`;

/** POST: Upload images and extract via Claude Code CLI */
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

    // Save files to disk
    const sessionId = `session_${Date.now()}`;
    const sessionDir = join(UPLOAD_DIR, sessionId);
    await mkdir(sessionDir, { recursive: true });

    const filePaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "png";
      const filename = `page_${i + 1}.${ext}`;
      const filePath = join(sessionDir, filename);
      await writeFile(filePath, buffer);
      filePaths.push(filePath);
    }

    // Build prompt with file paths
    const fileList = filePaths.map((p) => `- ${p}`).join("\n");
    const prompt = EXTRACTION_PROMPT + fileList;

    // Invoke Claude Code CLI via stdin pipe
    const pages = await runClaudeJSON(prompt, {
      timeout: 120_000,
      allowedTools: ["Read"],
    });

    return NextResponse.json({ pages });
  } catch (error) {
    console.error("Extraction error:", error);
    const message =
      error instanceof Error ? error.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
