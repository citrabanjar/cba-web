export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { T } from "@/components/i18n";

export const metadata: Metadata = { title: "Schedule" };

// Halaman jadwal kerja. Isinya menyusul; untuk sekarang baru tempatnya di menu.
export default async function SchedulePage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Schedule</T></h2>
        <p className="text-xs text-gray-400 mt-0.5"><T>Jadwal kerja karyawan.</T></p>
      </div>
      <main className="px-4 sm:px-6 py-5 max-w-6xl">
        <div className="bg-white rounded-2xl border border-gray-200 px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-rose-400 text-white shadow-md shadow-brand/30">
            <CalendarClock size={26} />
          </span>
          <h3 className="mt-4 text-lg font-bold text-gray-900"><T>Segera Hadir</T></h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            <T>Halaman ini sedang disiapkan.</T>
          </p>
        </div>
      </main>
    </div>
  );
}
