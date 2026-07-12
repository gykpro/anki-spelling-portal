import { NextRequest, NextResponse } from "next/server";
import {
  getAllConfigStatus,
  saveSettings,
  getAIBackend,
  isConfigKey,
  type ConfigKey,
} from "@/lib/settings";

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
    const rawUpdates =
      body && typeof body === "object"
        ? (body as { settings?: unknown }).settings
        : undefined;

    if (
      !rawUpdates ||
      typeof rawUpdates !== "object" ||
      Array.isArray(rawUpdates)
    ) {
      return NextResponse.json({ error: "settings object is required" }, { status: 400 });
    }

    for (const [key, value] of Object.entries(rawUpdates)) {
      if (!isConfigKey(key)) {
        return NextResponse.json(
          { error: `Unknown setting: ${key}` },
          { status: 400 }
        );
      }
      if (typeof value !== "string") {
        return NextResponse.json(
          { error: `Setting ${key} must be a string` },
          { status: 400 }
        );
      }
    }

    const updates = rawUpdates as Partial<Record<ConfigKey, string>>;

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
