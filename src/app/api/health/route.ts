import { NextResponse } from "next/server";
import { features } from "@/lib/config";
import { cacheStats } from "@/lib/cache";
import { quotaStatus } from "@/lib/providers/football-data";

export const dynamic = "force-dynamic";

/**
 * Health and capability report.
 *
 * Deliberately reports which features are *enabled* rather than whether keys
 * are present, and never echoes key material.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "sportx",
    time: new Date().toISOString(),
    features: {
      assistant: features.assistant,
      playerAnalytics: features.playerAnalytics,
    },
    cache: cacheStats(),
    // Remaining football-data.org budget, so throttling is observable rather
    // than something you infer from a sudden wave of errors.
    upstreamQuota: quotaStatus(),
  });
}
