export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { buildRecap } from "@/lib/attendance-recap";
import RekapClient from "./RekapClient";

export const metadata: Metadata = { title: "Rekap Kehadiran" };
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

// Panel Admin -> TIME -> Rekap: rekap kehadiran, cuti, dinas, dan lembur untuk rentang tanggal, satu / banyak karyawan.
export default async function RekapPage({ searchParams }: { searchParams: Promise<{ dari?: string; sampai?: string; karyawan?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "absensi")) redirect("/portal/dashboard");

  const sp = await searchParams;
  const today = todayWib();
  const sampai = isDate(sp.sampai) ? sp.sampai! : today;
  const dari = isDate(sp.dari) ? sp.dari! : `${sampai.slice(0, 7)}-01`;
  const from = new Date(`${dari <= sampai ? dari : sampai}T00:00:00Z`), to = new Date(`${dari <= sampai ? sampai : dari}T00:00:00Z`);
  const tooLong = to.getTime() - from.getTime() > 366 * 86_400_000;

  const employees = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, OR: [{ isActive: true }, { resignDate: { gte: from } }] },
    orderBy: { name: "asc" }, select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
  });
  // karyawan = daftar id dipisah koma; kosong = semua karyawan.
  const picked = (sp.karyawan ?? "").split(",").filter((id) => employees.some((e) => e.id === id));
  const ids = picked.length ? picked : employees.map((e) => e.id);
  const { rows, days } = tooLong ? { rows: [], days: [] } : await buildRecap(ids, from, to, ids.length === 1);

  return (
    <RekapClient
      from={from.toISOString().slice(0, 10)} to={to.toISOString().slice(0, 10)} picked={picked} tooLong={tooLong}
      employees={employees.map((e) => ({ id: e.id, name: e.name, employeeId: e.employeeId, department: e.department?.name ?? null }))}
      rows={rows} days={days}
    />
  );
}
