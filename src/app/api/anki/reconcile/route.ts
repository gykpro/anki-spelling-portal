import { NextRequest, NextResponse } from "next/server";
import { getDistributionTargets } from "@/lib/settings";
import { reconcileTargets } from "@/lib/reconcile";

/**
 * GET: Read-only reconciliation report — how each target instance differs
 * from the source (missing/extra notes, word mismatches, duplicate UUIDs).
 * Query: ?target=<name> to limit to one configured target.
 */
export async function GET(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get("target");
    const configured = getDistributionTargets();
    const targets = name ? configured.filter((t) => t.name === name) : configured;

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No matching distribution targets configured" },
        { status: 400 }
      );
    }

    const report = await reconcileTargets(targets);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Reconcile error:", error);
    const msg = error instanceof Error ? error.message : "Reconciliation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
