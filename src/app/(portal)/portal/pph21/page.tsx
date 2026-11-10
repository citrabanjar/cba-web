export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { T } from "@/components/i18n";
import { availableYears, build1721A1 } from "@/lib/form1721a1";
import A1Document from "./A1Document";

export const metadata: Metadata = { title: "PPh 21" };
const wibYear = () => new Date(Date.now() + 7 * 3600_000).getUTCFullYear();

// PPh 21 karyawan: bukti potong 1721-A1 per tahun, tersedia setelah proses akhir tahun selesai
// (Proses Gaji Desember final, atau bulan keluar final untuk karyawan yang berhenti).
export default async function Pph21Page({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  const years = await availableYears(session.user.id);
  const { tahun } = await searchParams;
  const year = years.includes(Number(tahun)) ? Number(tahun) : years[0];
  const form = year ? await build1721A1(session.user.id, year) : null;
  const thisYear = wibYear();

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4 print:hidden">
        <h2 className="font-bold text-gray-800"><T>PPh 21</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Bukti pemotongan PPh 21 tahunan (1721-A1) untuk pelaporan SPT Tahunan.</T></p>
      </div>
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 print:max-w-none print:p-0">
        {years.length > 1 && (
          <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-1.5 print:hidden">
            {years.map((y) => (
              <Link key={y} href={`/portal/pph21?tahun=${y}`}
                className={`inline-flex h-9 items-center rounded-full px-4 text-sm ${y === year ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>{y}</Link>
            ))}
          </div>
        )}
        {!years.includes(thisYear) && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 print:hidden">
            <T>Bukti potong 1721-A1 tahun</T> {thisYear} <T>tersedia setelah Proses Gaji Desember</T> {thisYear} <T>selesai (final).</T>
          </p>
        )}
        {form ? <A1Document form={form} /> : (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
            <Receipt size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="font-medium text-gray-500"><T>Belum ada bukti potong 1721-A1</T></p>
            <p className="mt-1 text-xs text-gray-400"><T>Bukti potong terbit setelah proses gaji akhir tahun selesai.</T></p>
          </div>
        )}
      </div>
    </div>
  );
}
