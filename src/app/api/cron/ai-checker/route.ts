import { NextResponse } from "next/server";
import { runScheduled } from "@/lib/ai-checker";
import { assessRecent } from "@/lib/attendance-assess";

// Dipanggil Vercel Cron (vercel.json) dua kali semalam: kirim pemeriksaan bila jadwalnya tiba, lalu ambil hasilnya.
// Vercel mengirim header Authorization: Bearer <CRON_SECRET> bila env CRON_SECRET diisi.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Penilaian kehadiran (Alpha otomatis) 7 hari terakhir, lalu AI Pemeriksa.
  const attendance = await assessRecent(true);
  const result = await runScheduled();
  return NextResponse.json({ attendance, ...result });
}
