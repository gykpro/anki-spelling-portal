import { NextRequest, NextResponse } from "next/server";
import { writeQueue } from "@/lib/write-queue";
import { getDistributionTargets } from "@/lib/settings";
import { distributeToTargets } from "@/lib/distribution";

/** POST: Distribute notes from the source instance to target instances */
export async function POST(request: NextRequest) {
  try {
    const { noteIds, targetProfiles, mediaFiles } = await request.json();

    if (!noteIds?.length || !targetProfiles?.length) {
      return NextResponse.json(
        { error: "noteIds and targetProfiles are required" },
        { status: 400 }
      );
    }

    // Build media cache from optional mediaFiles array
    const mediaCache = new Map<string, string>();
    if (Array.isArray(mediaFiles)) {
      for (const mf of mediaFiles) {
        if (mf.filename && mf.data) {
          mediaCache.set(mf.filename, mf.data);
        }
      }
    }

    // targetProfiles carries target names; resolve to configured instances
    const configured = getDistributionTargets();
    const targets = configured.filter((t) => targetProfiles.includes(t.name));
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No matching distribution targets configured" },
        { status: 400 }
      );
    }

    const results = await writeQueue.enqueue(() =>
      distributeToTargets(
        noteIds,
        targets,
        mediaCache.size > 0 ? mediaCache : undefined
      )
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Distribute error:", error);
    const msg = error instanceof Error ? error.message : "Distribution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
