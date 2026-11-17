import { NextResponse } from "next/server";
import { escalateChecks } from "@/lib/overtime-check";

// Vercel Cron 01:00 UTC = 08:00 WIB: laporan cek fisik lembur ke atasan. Header Authorization: Bearer <CRON_SECRET>.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reported = await escalateChecks();
  return NextResponse.json({ reported });
}
