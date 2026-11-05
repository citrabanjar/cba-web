import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTodayAttendance, getWeekAttendance } from "./actions";
import AbsensiWrapper from "./AbsensiWrapper";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Absensi" };

export default async function AbsensiPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const [today, week] = await Promise.all([
    getTodayAttendance(),
    getWeekAttendance(),
  ]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white px-4 py-4 flex items-center gap-3 shrink-0">
        <Link href="/portal/dashboard" className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="font-bold text-base">Absensi GPS</h1>
          <p className="text-blue-200 text-xs">
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </header>

      {/* Map + controls — takes remaining height */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AbsensiWrapper today={today} week={week} />
      </div>
    </div>
  );
}
