import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTodayAttendance, getWeekAttendance } from "./actions";
import AbsensiWrapper from "./AbsensiWrapper";
import { T } from "@/components/i18n";
import { formatDate } from "@/lib/utils";

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
    <div className="flex flex-col h-full">
      {/* Page title */}
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800"><T>Absensi GPS</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date().toLocaleDateString("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" })}, {formatDate(new Date(), "Asia/Jakarta")}
        </p>
      </div>

      {/* Map + controls */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AbsensiWrapper today={today} week={week} />
      </div>
    </div>
  );
}
