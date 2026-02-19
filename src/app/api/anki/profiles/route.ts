import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { getConfig, saveSettings } from "@/lib/settings";

/** GET: List all profiles and the active profile */
export async function GET() {
  try {
    const profiles = await ankiConnect.getProfiles();
    const active = getConfig("ACTIVE_PROFILE") || null;
    return NextResponse.json({ profiles, active });
  } catch (error) {
    console.error("Get profiles error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get profiles" },
      { status: 500 }
    );
  }
}

/** POST: Switch to a different profile */
export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Profile name required" }, { status: 400 });
    }

    await ankiConnect.loadProfileAndWait(name);
    saveSettings({ ACTIVE_PROFILE: name });

    return NextResponse.json({ success: true, active: name });
  } catch (error) {
    console.error("Switch profile error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to switch profile" },
      { status: 500 }
    );
  }
}
