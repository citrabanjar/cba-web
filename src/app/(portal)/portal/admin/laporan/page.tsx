export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { buildRecap } from "@/lib/attendance-recap";
import { buildLeaveReport, buildLoanReport, buildOvertimeReport, buildSwapReport, buildTripReport, type ReportStatus } from "@/lib/report";
import LaporanClient, { type ReportKind } from "./LaporanClient";

export const metadata: Metadata = { title: "Laporan" };
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const KINDS: ReportKind[] = ["semua", "kehadiran", "cuti", "dinas", "tukar", "lembur", "pinjaman"];
const STATUSES: ReportStatus[] = ["menunggu", "disetujui", "ditolak"];

// Panel Admin → TIME → Laporan: pilih rentang tanggal, karyawan (satu / banyak / semua), dan jenis laporan.
export default async function LaporanPage({ searchParams }: { searchParams: Promise<{ dari?: string; sampai?: string; karyawan?: string; jenis?: string; status?: string; tahap?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "absensi")) redirect("/portal/dashboard");

  const sp = await searchParams;
  const today = todayWib();
  const sampai = isDate(sp.sampai) ? sp.sampai! : today;
  const dari = isDate(sp.dari) ? sp.dari! : `${sampai.slice(0, 7)}-01`;
  const canLoan = hasMenu(access, "pinjaman");
  const asked = KINDS.includes(sp.jenis as ReportKind) ? (sp.jenis as ReportKind) : "semua";
  const kind = asked === "pinjaman" && !canLoan ? "semua" : asked;
  // Status hanya untuk laporan per pengajuan; tahap hanya untuk pinjaman.
  const status = kind !== "semua" && kind !== "kehadiran" && STATUSES.includes(sp.status as ReportStatus) ? (sp.status as ReportStatus) : "";
  const stage = kind === "pinjaman" && ["ATASAN", "ADMIN", "PIMPINAN", "SELESAI"].includes(sp.tahap ?? "") ? sp.tahap! : "";
  const from = new Date(`${dari <= sampai ? dari : sampai}T00:00:00Z`), to = new Date(`${dari <= sampai ? sampai : dari}T00:00:00Z`);
  const tooLong = to.getTime() - from.getTime() > 366 * 86_400_000;

  const employees = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, OR: [{ isActive: true }, { resignDate: { gte: from } }] },
    orderBy: { name: "asc" }, select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
  });
  // karyawan = daftar id dipisah koma; kosong = semua karyawan.
  const picked = (sp.karyawan ?? "").split(",").filter((id) => employees.some((e) => e.id === id));
  const ids = picked.length ? picked : employees.map((e) => e.id);
  const recap = !tooLong && (kind === "semua" || kind === "kehadiran") ? await buildRecap(ids, from, to, ids.length === 1) : { rows: [], days: [] };
  const ok = !tooLong || status === "menunggu";
  const leaves = ok && kind === "cuti" ? await buildLeaveReport(ids, from, to, status) : [];
  const overtimes = ok && kind === "lembur" ? await buildOvertimeReport(ids, from, to, status) : [];
  const trips = ok && kind === "dinas" ? await buildTripReport(ids, from, to, status) : [];
  const swaps = ok && kind === "tukar" ? await buildSwapReport(ids, from, to, status) : [];
  const loans = ok && kind === "pinjaman" ? await buildLoanReport(ids, from, to, status, stage) : [];

  return (
    <LaporanClient
      kind={kind} status={status} stage={stage} canLoan={canLoan} from={from.toISOString().slice(0, 10)} to={to.toISOString().slice(0, 10)} picked={picked} tooLong={tooLong}
      employees={employees.map((e) => ({ id: e.id, name: e.name, employeeId: e.employeeId, department: e.department?.name ?? null }))}
      rows={recap.rows} days={recap.days} leaves={leaves} overtimes={overtimes} trips={trips} swaps={swaps} loans={loans}
      // Nama karyawan membuka profil bila punya akses Data Karyawan.
      canProfile={hasMenu(access, "karyawan")}
    />
  );
}
