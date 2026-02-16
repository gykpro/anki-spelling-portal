import { NextRequest, NextResponse } from "next/server";
import { getAllConfigStatus, saveSettings, getAIBackend, type ConfigKey } from "@/lib/settings";

export async function GET() {
  try {
    const settings = getAllConfigStatus();
    const aiBackend = getAIBackend();
    return NextResponse.json({ settings, aiBackend });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updates = body.settings as Partial<Record<ConfigKey, string>>;

    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "settings object is required" }, { status: 400 });
    }

    saveSettings(updates);

    const settings = getAllConfigStatus();
    const aiBackend = getAIBackend();
    return NextResponse.json({ settings, aiBackend, saved: true });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
