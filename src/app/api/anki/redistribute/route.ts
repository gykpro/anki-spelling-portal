import { NextRequest, NextResponse } from "next/server";
import { writeQueue } from "@/lib/write-queue";
import { getDistributionTargets } from "@/lib/settings";
import { redistributeAll } from "@/lib/distribution";

/**
 * POST: Re-distribute every note in both language decks to target instances.
 * One-shot admin operation for healing historical distribution gaps
 * (see docs/ops-per-instance-distribution.md, cutover step 7).
 * Body: { targetProfiles?: string[] } — omitted = all configured targets.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const names: string[] | undefined = body?.targetProfiles;

    const configured = getDistributionTargets();
    const targets =
      names && names.length > 0
        ? configured.filter((t) => names.includes(t.name))
        : configured;

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No matching distribution targets configured" },
        { status: 400 }
      );
    }

    const summary = await writeQueue.enqueue(() => redistributeAll(targets));
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Redistribute error:", error);
    const msg = error instanceof Error ? error.message : "Re-distribution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
