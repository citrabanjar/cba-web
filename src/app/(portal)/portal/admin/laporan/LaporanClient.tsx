"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CalendarDays, ChevronRight, CalendarHeart, ClipboardList, Download, Filter, HandCoins, LayoutGrid, Loader2, Plane, Timer, Users, X, ClockAlert, Stethoscope } from "lucide-react";
import * as XLSX from "xlsx";
import { T, useT } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import { formatDate } from "@/lib/utils";
import { OT_STATUS } from "@/lib/overtime-status";
import type { RecapDay, RecapRow } from "@/lib/attendance-recap";
import type { ClaimReportRow, FixReportRow, LeaveReportRow, LoanReportRow, OvertimeReportRow, ReportStatus, SwapReportRow, TripReportRow } from "@/lib/report";

export type ReportKind = "semua" | "kehadiran" | "cuti" | "dinas" | "tukar" | "lupa" | "reimburse" | "lembur" | "pinjaman";
type Emp = { id: string; name: string; employeeId: string | null; department: string | null };
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const STATUS: Record<string, string> = { HADIR: "Hadir", IZIN: "Izin", SAKIT: "Sakit", ALPHA: "Alpha", CUTI: "Cuti", DINAS: "Dinas" };
const LEAVE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-50 text-amber-700" }, APPROVED: { label: "Disetujui", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Ditolak", cls: "bg-rose-50 text-rose-700" }, CANCELLED: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-600" },
};
const KINDS: [ReportKind, string, typeof LayoutGrid][] = [
  ["semua", "Semua", LayoutGrid], ["kehadiran", "Kehadiran", CalendarDays], ["cuti", "Cuti", CalendarHeart], ["dinas", "Dinas", Plane],
  ["tukar", "Tukar Shift", ArrowLeftRight], ["lupa", "Lupa Absen", ClockAlert], ["reimburse", "Reimbursement", Stethoscope], ["lembur", "Lembur", Timer], ["pinjaman", "Pinjaman", HandCoins],
];
const CLAIM_PILL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-50 text-amber-700" }, APPROVED: { label: "Menunggu gajian", cls: "bg-sky-50 text-sky-700" },
  PAID: { label: "Dibayar", cls: "bg-emerald-50 text-emerald-700" }, REJECTED: { label: "Ditolak", cls: "bg-rose-50 text-rose-700" }, CANCELLED: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-600" },
};
const CLAIM_LABEL = Object.fromEntries(Object.entries(CLAIM_PILL).map(([k, v]) => [k, v.label]));
const SWAP_STATUS: Record<string, { label: string; cls: string }> = {
  MENUNGGU_REKAN: { label: "Menunggu rekan", cls: "bg-amber-50 text-amber-700" }, MENUNGGU_ATASAN: { label: "Menunggu atasan", cls: "bg-amber-50 text-amber-700" },
  DISETUJUI: { label: "Disetujui", cls: "bg-emerald-50 text-emerald-700" }, DITOLAK: { label: "Ditolak", cls: "bg-rose-50 text-rose-700" }, DIBATALKAN: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-600" },
};
const LOAN_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-50 text-amber-700" }, DISETUJUI: { label: "Belum dicairkan", cls: "bg-sky-50 text-sky-700" },
  BERJALAN: { label: "Berjalan", cls: "bg-emerald-50 text-emerald-700" }, LUNAS: { label: "Lunas", cls: "bg-gray-100 text-gray-600" },
  DITOLAK: { label: "Ditolak", cls: "bg-rose-50 text-rose-700" }, BATAL: { label: "Batal", cls: "bg-gray-100 text-gray-600" },
};
// Sama dengan LOAN_STAGE di lib/report (lib itu memakai database, jadi tidak diimpor ke browser).
const LOAN_STAGE: Record<string, string> = { ATASAN: "Atasan", ADMIN: "Pemeriksaan Admin", PIMPINAN: "Pimpinan" };
const STATUS_TABS: [ReportStatus, string][] = [["", "Semua status"], ["menunggu", "Belum selesai"], ["disetujui", "Disetujui"], ["ditolak", "Ditolak / batal"]];
const rupiah = (n: number) => `Rp\u00a0${Math.round(n).toLocaleString("id-ID")}`;
const pill = (m: Record<string, { label: string; cls: string }>, st: string) => m[st] ?? { label: st, cls: "bg-gray-100 text-gray-600" };

// Nama karyawan: tautan ke tab profil sesuai jenis laporan (bila punya akses Data Karyawan) —
// Kehadiran / Semua → Kehadiran, Cuti → Kehadiran (Riwayat Cuti), Lembur → kalender kehadiran di tanggal lembur.
function EmpName({ id, name, employeeId, department, canProfile, tab, date, exempt }: {
  id: string; name: string; employeeId: string | null; department: string | null; canProfile: boolean; tab: "absensi" | "cuti"; date?: string;
  exempt?: boolean; // Bebas Absen
}) {
  return (
    <>
      {canProfile
        ? <Link href={`/portal/admin/karyawan/${id}?tab=${tab}${date ? `&tanggal=${date}` : ""}`} className="font-medium text-gray-800 hover:text-brand hover:underline">{name}</Link>
        : <span className="font-medium text-gray-800">{name}</span>}
      {exempt && <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><T>Bebas Absen</T></span>}
      <p className="text-[11px] text-gray-400">{employeeId}{department ? ` · ${department}` : ""}</p>
    </>
  );
}

export default function LaporanClient({ kind, status = "", stage = "", canLoan = false, from, to, picked, tooLong, employees, rows, days, leaves, overtimes, trips = [], swaps = [], loans = [], fixes = [], claims = [], pending = {}, canProfile }: {
  kind: ReportKind; status?: ReportStatus; stage?: string; canLoan?: boolean; from: string; to: string; picked: string[]; tooLong: boolean; employees: Emp[];
  rows: RecapRow[]; days: RecapDay[]; leaves: LeaveReportRow[]; overtimes: OvertimeReportRow[];
  trips?: TripReportRow[]; swaps?: SwapReportRow[]; loans?: LoanReportRow[]; fixes?: FixReportRow[]; claims?: ClaimReportRow[]; canProfile: boolean;
  pending?: Partial<Record<ReportKind, number>>; // jumlah belum selesai per modul (daftar kiri)
}) {
  const t = useT();
  const router = useRouter();
  const [loading, start] = useTransition();
  const [f, setF] = useState({ from, to });
  const [sel, setSel] = useState<Set<string>>(new Set(picked));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [open, setOpen] = useState(false);
  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[], [employees]);
  const shown = employees.filter((e) => (!dept || e.department === dept) && (!q || `${e.name} ${e.employeeId ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Ganti jenis: status ikut dibawa (papan kerja "Belum selesai" tetap); tahap hanya untuk pinjaman.
  const go = (k: ReportKind, st: ReportStatus = status, tahap = "") => start(() => router.push(
    `/portal/admin/laporan?jenis=${k}&dari=${f.from}&sampai=${f.to}${st && k !== "semua" && k !== "kehadiran" ? `&status=${st}` : ""}${tahap ? `&tahap=${tahap}` : ""}${sel.size ? `&karyawan=${[...sel].join(",")}` : ""}`));
  const perItem = kind !== "semua" && kind !== "kehadiran";

  const total = (k: keyof RecapRow) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const leaveText = (r: RecapRow) => Object.entries(r.leaveByType).map(([k, v]) => `${k} ${num(v)}`).join(", ");
  const count = kind === "cuti" ? leaves.length : kind === "lembur" ? overtimes.length : kind === "dinas" ? trips.length : kind === "tukar" ? swaps.length : kind === "lupa" ? fixes.length : kind === "reimburse" ? claims.length : kind === "pinjaman" ? loans.length : rows.length;
  const kindLabel = t(KINDS.find((k) => k[0] === kind)![1]);
  const title = status === "menunggu" || (stage && stage !== "SELESAI")
    ? `${kindLabel} ${t("belum selesai")}${stage && stage !== "SELESAI" ? ` · ${t("tahap")} ${t(LOAN_STAGE[stage])}` : ""}`
    : `${t("Laporan")} ${kindLabel}${stage === "SELESAI" ? ` ${t("selesai diputus")}` : ""} ${formatDate(from)} – ${formatDate(to)}`;

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const sheet = (name: string, head: string[], data: (string | number)[][]) => {
      const ws = XLSX.utils.aoa_to_sheet([[title], [], head, ...data]);
      ws["!cols"] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    if (kind === "cuti") {
      sheet("Cuti", ["ID Karyawan", "Nama", "Departemen", "Jenis", "Mulai", "Selesai", "Hari", "Status", "Alasan", "Delegasi", "Diputus oleh"],
        leaves.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", r.policy, formatDate(r.start), formatDate(r.end), r.days, LEAVE_STATUS[r.status]?.label ?? r.status, r.reason, r.delegate ?? "", r.decidedBy ?? ""]));
    } else if (kind === "dinas") {
      sheet("Dinas", ["ID Karyawan", "Nama", "Departemen", "Tujuan", "Keperluan", "Mulai", "Selesai", "Hari", "Status", "Penyetuju / Diputus oleh"],
        trips.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", r.destination, r.purpose, formatDate(r.start), formatDate(r.end), r.days, LEAVE_STATUS[r.status]?.label ?? r.status, r.turn ?? r.decidedBy ?? ""]));
    } else if (kind === "tukar") {
      sheet("Tukar Shift", ["ID Karyawan", "Pemohon", "Departemen", "Rekan", "Tanggal", "Shift pemohon", "Shift rekan", "Alasan", "Status", "Penyetuju / Diputus oleh"],
        swaps.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", r.partner, formatDate(r.date), r.requesterShift, r.partnerShift, r.reason ?? "", SWAP_STATUS[r.status]?.label ?? r.status, r.turn ?? r.decidedBy ?? ""]));
    } else if (kind === "reimburse") {
      sheet("Reimbursement", ["ID Karyawan", "Nama", "Departemen", "Tanggal berobat", "Klinik / RS / Apotek", "Kuitansi", "Dibayarkan", "Status", "Penyetuju / Disetujui oleh"],
        claims.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", formatDate(r.date), r.provider, r.amount, r.payout, CLAIM_LABEL[r.status] ?? r.status, r.turn ?? r.decidedBy ?? ""]));
    } else if (kind === "lupa") {
      sheet("Lupa Absen", ["ID Karyawan", "Nama", "Departemen", "Tanggal", "Jam masuk", "Jam pulang", "Alasan", "Status", "Penyetuju / Diputus oleh"],
        fixes.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", formatDate(r.date), r.checkIn ?? "", r.checkOut ?? "", r.reason, LEAVE_STATUS[r.status]?.label ?? r.status, r.turn ?? r.decidedBy ?? ""]));
    } else if (kind === "pinjaman") {
      sheet("Pinjaman", ["ID Karyawan", "Nama", "Departemen", "Diajukan", "Jumlah", "Tenor", "Potongan mulai", "Keperluan", "Status", "Tahap", "Diputus oleh"],
        loans.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", formatDate(r.createdAt.slice(0, 10)), r.principal, r.tenor, r.startPeriod, r.purpose ?? "", LOAN_STATUS[r.status]?.label ?? r.status, r.stage ? LOAN_STAGE[r.stage] ?? r.stage : "", r.decidedBy ?? ""]));
    } else if (kind === "lembur") {
      sheet("Lembur", ["ID Karyawan", "Nama", "Departemen", "Tanggal", "Hari", "Jam", "Sumber", "Uraian", "Status", "Jam efektif", "Absen pulang", "Jam dibayar", "Cek fisik", "Konfirmasi atasan"],
        overtimes.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", formatDate(r.date), r.rest ? "Hari libur" : "Hari kerja", `${r.start}-${r.end}`, r.source, r.reason ?? "",
          OT_STATUS[r.status]?.label ?? r.status, r.planned, r.checkOut ?? "", r.paid ?? "", r.check ?? "", r.verify ?? ""]));
    } else {
      const head = kind === "kehadiran"
        ? ["ID Karyawan", "Nama", "Departemen", "Hari Kerja", "Hadir", "Terlambat (kali)", "Terlambat (menit)", "Pulang Cepat (kali)", "Pulang Cepat (jam)", "Tidak Absen Pulang", "Alpha", "Izin", "Sakit", "Dinas (hari)"]
        : ["ID Karyawan", "Nama", "Departemen", "Hari Kerja", "Hadir", "Terlambat (kali)", "Terlambat (menit)", "Pulang Cepat (kali)", "Pulang Cepat (jam)", "Tidak Absen Pulang", "Alpha", "Izin", "Sakit", "Cuti (hari)", "Rincian Cuti", "Dinas (hari)", "Lembur (kali)", "Lembur Hari Kerja (jam)", "Lembur Hari Libur (jam)"];
      sheet("Laporan", head, rows.map((r) => {
        const base = [r.employeeId ?? "", r.name, r.department ?? "", r.workDays, r.present, r.late, r.lateMinutes, r.early, r.earlyHours, r.noCheckout, r.alpha, r.izin, r.sakit];
        return kind === "kehadiran" ? [...base, r.tripDays] : [...base, r.leaveDays, leaveText(r), r.tripDays, r.otCount, r.otWorkHours, r.otRestHours];
      }));
      if (days.length) {
        sheet("Harian", ["Tanggal", "Shift", "Masuk", "Pulang", "Status", "Terlambat (menit)", "Pulang Cepat (jam)", "Cuti", "Dinas", "Lembur", "Lembur Dibayar (jam)"],
          days.map((d) => [formatDate(d.date), d.shift, d.checkIn ?? "", d.checkOut ?? "", d.status ? STATUS[d.status] ?? d.status : "", d.lateMinutes || "", d.earlyHours || "", d.leave ?? "", d.trip ?? "", d.overtime ?? "", d.otPaid ?? ""]));
      }
    }
    XLSX.writeFile(wb, `laporan_${kind}_${from}_${to}.xlsx`);
  };

  const th = "px-3 py-2 text-right font-medium";
  const td = "px-3 py-2 text-right tabular-nums";
  const thl = "px-3 py-2 text-left font-medium";
  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Laporan</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Papan kerja Admin: pekerjaan yang belum selesai dan laporan kehadiran, cuti, dinas, tukar shift, lupa absen, reimbursement, lembur, serta pinjaman untuk rentang tanggal dan karyawan yang dipilih.</T></p>
      </div>

      <main className="max-w-7xl px-4 py-5 sm:px-6">
        {/* Pola standar portal: daftar modul di kiri, filter & isi laporan di kanan (di HP daftar di atas). */}
        <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {KINDS.filter(([k]) => k !== "pinjaman" || canLoan).map(([k, label, Icon]) => {
            const on = kind === k;
            const n = pending[k] ?? 0;
            return (
              <button key={k} type="button" disabled={loading} onClick={() => go(k)}
                className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? "bg-gradient-to-br from-brand to-rose-400 text-white" : "bg-gray-100 text-gray-500"}`}>
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{label}</T></span>
                  {n > 0 && <span className="block truncate text-[11px] font-medium text-amber-600">{n} <T>belum selesai</T></span>}
                </span>
                <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-5">
        {/* Filter rentang & karyawan */}
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44"><label className="mb-1 block text-xs font-medium text-gray-500"><T>Dari tanggal</T></label><DateInput value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
            <div className="w-44"><label className="mb-1 block text-xs font-medium text-gray-500"><T>Sampai tanggal</T></label><DateInput value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500"><T>Karyawan</T></label>
              <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">
                <Users size={15} className="text-gray-400" /> {sel.size ? <>{sel.size} <T>dipilih</T></> : <T>Semua karyawan</T>}
              </button>
            </div>
            <button type="button" disabled={loading || !f.from || !f.to} onClick={() => go(kind)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Filter size={15} />} <T>Tampilkan</T>
            </button>
            {count > 0 && (
              <button type="button" onClick={exportXlsx} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <Download size={15} /> <T>Excel</T>
              </button>
            )}
          </div>
          {open && (
            <div className="rounded-xl border border-gray-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau ID...")} className="h-9 min-w-40 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
                  <option value="">{t("Semua departemen")}</option>
                  {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button type="button" onClick={() => setSel((s) => new Set([...s, ...shown.map((e) => e.id)]))} className="text-xs font-medium text-brand hover:underline"><T>Pilih semua yang tampil</T></button>
                {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline"><X size={12} /> <T>Kosongkan (semua karyawan)</T></button>}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {shown.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50">
                    <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-[#BE353F]" />
                    <span className="flex-1">{e.name} <span className="text-xs text-gray-400">{e.employeeId}{e.department ? ` · ${e.department}` : ""}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {perItem && (
            <div className="flex flex-wrap items-center gap-1">
              {STATUS_TABS.map(([st, label]) => (
                <button key={st || "semua"} type="button" disabled={loading} onClick={() => go(kind, st)}
                  className={`h-8 rounded-full px-3 text-xs font-semibold ${status === st && !stage ? (st === "menunggu" ? "bg-amber-500 text-white" : "bg-ink text-white") : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  <T>{label}</T>
                </button>
              ))}
              {stage && (
                <button type="button" onClick={() => go(kind, status)} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand/10 px-3 text-xs font-semibold text-brand">
                  <T>Tahap</T>: <T>{stage === "SELESAI" ? "Selesai diputus" : LOAN_STAGE[stage]}</T> <X size={12} />
                </button>
              )}
            </div>
          )}
          {(status === "menunggu" || (stage && stage !== "SELESAI")) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><T>Belum selesai: semua pengajuan yang belum diputus ditampilkan tanpa melihat rentang tanggal.</T></p>
          )}
          <p className="text-[11px] text-gray-400"><T>Kosongkan pilihan karyawan untuk menampilkan semua. Pilih satu karyawan untuk melihat rincian per hari (Semua / Kehadiran).</T>{canProfile && <> <T>Klik nama untuk membuka profil karyawan (Kehadiran / Cuti sesuai jenis laporan).</T></>}</p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
            <ClipboardList size={16} className="text-brand" />
            <h3 className="flex-1 text-sm font-semibold text-gray-800">{title}</h3>
            <span className="text-xs text-gray-500">{count} <T>{perItem ? (kind === "lembur" ? "lembur" : "pengajuan") : "karyawan"}</T></span>
          </div>
          {tooLong && status !== "menunggu" ? (
            <p className="px-5 py-8 text-center text-sm text-rose-600"><T>Rentang tanggal paling lama 1 tahun.</T></p>
          ) : count === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Tidak ada data.</T></p>
          ) : kind === "cuti" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Karyawan</T></th><th className={thl}><T>Jenis</T></th><th className={thl}><T>Tanggal</T></th><th className={th}><T>Hari</T></th><th className={thl}><T>Status</T></th><th className={thl}><T>Alasan</T></th><th className={thl}><T>Delegasi</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaves.map((r) => {
                    const st = LEAVE_STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="cuti" id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{t(r.policy)}{r.halfDay && <span className="text-[11px] text-gray-400"> · ½ <T>hari</T></span>}</td>
                        <td className="px-3 py-2">{formatDate(r.start)}{r.end !== r.start && <> – {formatDate(r.end)}</>}</td>
                        <td className={td}>{num(r.days)}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>{(r.turn || r.decidedBy) && <p className="mt-0.5 text-[11px] text-gray-400">{r.turn ? r.turn : r.decidedBy}</p>}</td>
                        <td className="max-w-64 truncate px-3 py-2 text-gray-600" title={r.reason}>{r.reason}</td>
                        <td className="px-3 py-2 text-gray-600">{r.delegate ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : kind === "dinas" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Karyawan</T></th><th className={thl}><T>Tujuan</T></th><th className={thl}><T>Tanggal</T></th><th className={th}><T>Hari</T></th><th className={thl}><T>Status</T></th><th className={thl}><T>Keperluan</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {trips.map((r) => {
                    const st = pill(LEAVE_STATUS, r.status);
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="cuti" id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{r.destination}</td>
                        <td className="px-3 py-2">{formatDate(r.start)}{r.end !== r.start && <> – {formatDate(r.end)}</>}</td>
                        <td className={td}>{r.days}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>{(r.turn || r.decidedBy) && <p className="mt-0.5 text-[11px] text-gray-400">{r.turn ? r.turn : r.decidedBy}</p>}</td>
                        <td className="max-w-64 truncate px-3 py-2 text-gray-600" title={r.purpose}>{r.purpose}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : kind === "tukar" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Pemohon</T></th><th className={thl}><T>Rekan</T></th><th className={thl}><T>Tanggal</T></th><th className={thl}><T>Shift</T></th><th className={thl}><T>Status</T></th><th className={thl}><T>Alasan</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {swaps.map((r) => {
                    const st = pill(SWAP_STATUS, r.status);
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="absensi" date={r.date} id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{r.partner}</td>
                        <td className="px-3 py-2">{formatDate(r.date)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.requesterShift} ⇄ {r.partnerShift}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>{(r.turn || r.decidedBy) && <p className="mt-0.5 text-[11px] text-gray-400">{r.turn ? r.turn : r.decidedBy}</p>}</td>
                        <td className="max-w-64 truncate px-3 py-2 text-gray-600" title={r.reason ?? ""}>{r.reason ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : kind === "reimburse" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Karyawan</T></th><th className={thl}><T>Tanggal berobat</T></th><th className={thl}><T>Klinik / RS / Apotek</T></th><th className={th}><T>Kuitansi</T></th><th className={th}><T>Dibayarkan</T></th><th className={thl}><T>Status</T></th><th className={thl}><T>Lampiran</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {claims.map((r) => {
                    const st = pill(CLAIM_PILL, r.status);
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="cuti" id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{formatDate(r.date)}</td>
                        <td className="max-w-56 truncate px-3 py-2 text-gray-700" title={r.provider}>{r.provider}</td>
                        <td className={td}>{rupiah(r.amount)}</td>
                        <td className={td}>{rupiah(r.payout)}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>{(r.turn || r.decidedBy) && <p className="mt-0.5 text-[11px] text-gray-400">{r.turn ? r.turn : r.decidedBy}</p>}</td>
                        <td className="px-3 py-2 text-[11px]">{r.files.map((f) => <a key={f.id} href={`/api/reimburse-file/${f.id}`} target="_blank" rel="noreferrer" className="mr-2 text-brand hover:underline">{f.name}</a>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : kind === "lupa" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Karyawan</T></th><th className={thl}><T>Tanggal</T></th><th className={thl}><T>Jam masuk</T></th><th className={thl}><T>Jam pulang</T></th><th className={thl}><T>Status</T></th><th className={thl}><T>Alasan</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fixes.map((r) => {
                    const st = pill(LEAVE_STATUS, r.status);
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="absensi" date={r.date} id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{formatDate(r.date)}</td>
                        <td className="px-3 py-2 tabular-nums">{r.checkIn ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 tabular-nums">{r.checkOut ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>{(r.turn || r.decidedBy) && <p className="mt-0.5 text-[11px] text-gray-400">{r.turn ? r.turn : r.decidedBy}</p>}</td>
                        <td className="max-w-64 truncate px-3 py-2 text-gray-600" title={r.reason}>{r.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : kind === "pinjaman" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Karyawan</T></th><th className={thl}><T>Diajukan</T></th><th className={th}><T>Jumlah</T></th><th className={th}><T>Tenor</T></th><th className={thl}><T>Status</T></th><th className={thl}><T>Keperluan</T></th><th className={thl} /></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loans.map((r) => {
                    const st = pill(LOAN_STATUS, r.status);
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="cuti" id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{formatDate(r.createdAt.slice(0, 10))}</td>
                        <td className={td}>{rupiah(r.principal)}</td>
                        <td className={td}>{r.tenor}x<p className="text-[11px] text-gray-400"><T>mulai</T> {r.startPeriod}</p></td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>{(r.stage || r.decidedBy) && <p className="mt-0.5 text-[11px] text-gray-400">{r.stage ? <><T>Tahap</T>: <T>{LOAN_STAGE[r.stage] ?? r.stage}</T></> : r.decidedBy}</p>}</td>
                        <td className="max-w-56 truncate px-3 py-2 text-gray-600" title={r.purpose ?? ""}>{r.purpose ?? "-"}</td>
                        <td className="px-3 py-2 text-right">
                          {(r.status === "PENDING" || r.status === "DISETUJUI") && (
                            <Link href={`/portal/admin/pinjaman${r.stage ? `?tahap=${r.stage}` : ""}`} className="text-xs font-semibold text-brand hover:underline"><T>Proses</T> →</Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 font-semibold text-gray-800">
                  <tr><td className="px-4 py-2" colSpan={2}><T>Total</T></td><td className={td}>{rupiah(loans.reduce((a, r) => a + r.principal, 0))}</td><td colSpan={4} /></tr>
                </tfoot>
              </table>
            </div>
          ) : kind === "lembur" ? (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className={`${thl} pl-4`}><T>Karyawan</T></th><th className={thl}><T>Tanggal</T></th><th className={thl}><T>Jam lembur</T></th><th className={thl}><T>Uraian</T></th><th className={thl}><T>Status</T></th><th className={th}><T>Pulang</T></th><th className={th}><T>Dibayar</T></th><th className={thl}><T>Cek fisik</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {overtimes.map((r) => {
                    const st = OT_STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
                    return (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="absensi" date={r.date} id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} /></td>
                        <td className="px-3 py-2">{formatDate(r.date)}<p className="text-[11px] text-gray-400"><T>{r.rest ? "Hari libur" : "Hari kerja"}</T></p></td>
                        <td className="px-3 py-2">{r.start}–{r.end}<p className="text-[11px] text-gray-400">{num(r.planned)} <T>jam</T> · {r.source === "Pengajuan" ? t("Pengajuan karyawan") : r.source}</p></td>
                        <td className="max-w-56 truncate px-3 py-2 text-gray-600" title={r.reason ?? ""}>{r.reason ?? "-"}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span></td>
                        <td className={td}>{r.checkOut ?? "-"}</td>
                        <td className={`${td} font-semibold`}>{r.paid === null ? "-" : `${num(r.paid)} ${t("jam")}`}</td>
                        <td className="px-3 py-2 text-[11px] text-gray-500">{r.check ?? "-"}{r.verify && <p className={r.verify.startsWith("Menunggu") ? "font-semibold text-amber-700" : ""}><T>{r.verify}</T></p>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 font-semibold text-gray-800">
                  <tr><td className="px-4 py-2" colSpan={6}><T>Total jam dibayar</T></td><td className={td}>{num(overtimes.reduce((a, r) => a + (r.paid ?? 0), 0))} <T>jam</T></td><td /></tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium"><T>Karyawan</T></th>
                    <th className={th}><T>Hari kerja</T></th><th className={th}><T>Hadir</T></th><th className={th}><T>Terlambat</T></th>
                    <th className={th}><T>Pulang cepat</T></th><th className={th}><T>Tdk absen pulang</T></th><th className={th}>Alpha</th>
                    <th className={th}><T>Izin / Sakit</T></th>
                    {kind === "semua" && <th className={th}><T>Cuti</T></th>}
                    <th className={th}><T>Dinas</T></th>
                    {kind === "semua" && <><th className={th}><T>Lembur HK</T></th><th className={th}><T>Lembur HL</T></th></>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.userId} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2"><EmpName canProfile={canProfile} tab="absensi" date={from} id={r.userId} name={r.name} employeeId={r.employeeId} department={r.department} exempt={r.exempt} /></td>
                      <td className={td}>{r.workDays}</td>
                      <td className={td}>{r.present}</td>
                      <td className={td}>{r.late ? <>{r.late}<span className="text-[11px] text-gray-400"> · {r.lateMinutes} <T>mnt</T></span></> : "-"}</td>
                      <td className={td}>{r.early ? <>{r.early}<span className="text-[11px] text-gray-400"> · {num(r.earlyHours)} <T>jam</T></span></> : "-"}</td>
                      <td className={td}>{r.noCheckout || "-"}</td>
                      <td className={`${td} ${r.alpha ? "font-semibold text-rose-600" : ""}`}>{r.alpha || "-"}</td>
                      <td className={td}>{r.izin + r.sakit ? `${r.izin} / ${r.sakit}` : "-"}</td>
                      {kind === "semua" && <td className={td} title={leaveText(r)}>{r.leaveDays ? num(r.leaveDays) : "-"}</td>}
                      <td className={td}>{r.tripDays || "-"}</td>
                      {kind === "semua" && <>
                        <td className={td}>{r.otWorkHours ? `${num(r.otWorkHours)} ${t("jam")}` : "-"}</td>
                        <td className={td}>{r.otRestHours ? `${num(r.otRestHours)} ${t("jam")}` : "-"}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 && (
                  <tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 font-semibold text-gray-800">
                    <tr>
                      <td className="px-4 py-2"><T>Total</T></td>
                      <td className={td}>{total("workDays")}</td><td className={td}>{total("present")}</td><td className={td}>{total("late")}</td>
                      <td className={td}>{total("early")}</td><td className={td}>{total("noCheckout")}</td><td className={td}>{total("alpha")}</td>
                      <td className={td}>{total("izin")} / {total("sakit")}</td>
                      {kind === "semua" && <td className={td}>{num(total("leaveDays"))}</td>}
                      <td className={td}>{total("tripDays")}</td>
                      {kind === "semua" && <><td className={td}>{num(total("otWorkHours"))}</td><td className={td}>{num(total("otRestHours"))}</td></>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <p className="border-t border-gray-100 px-5 py-2 text-[11px] text-gray-400">
            <T>{kind === "dinas" ? "Pengajuan dinas luar yang tanggalnya beririsan dengan rentang. Keputusan tetap di penyetuju lewat Notifikasi." : kind === "tukar" ? "Pengajuan tukar shift yang tanggal tukarnya di dalam rentang. Keputusan di rekan dan atasan lewat Notifikasi." : kind === "reimburse" ? "Pengajuan reimbursement pengobatan yang tanggal berobatnya di dalam rentang. Yang disetujui dibayarkan di Proses Gaji berikutnya." : kind === "lupa" ? "Pengajuan lupa absen yang tanggal absennya di dalam rentang. Diputus atasan lewat Notifikasi; setelah disetujui jam langsung tercatat di kehadiran." : kind === "pinjaman" ? "Pengajuan pinjaman yang dibuat di dalam rentang (saldo awal tidak termasuk). Klik Proses untuk memeriksa dokumen atau mencairkan di menu Pinjaman Karyawan." : kind === "cuti" ? "Pengajuan cuti yang tanggalnya beririsan dengan rentang (disetujui, ditolak, dibatalkan)." : kind === "lembur" ? "Jam dibayar per 1 jam penuh sampai absen pulang, di luar istirahat. Cek fisik oleh security bila shiftnya beririsan." : "Cuti = cuti disetujui dalam hari kerja (setengah hari = 0,5). Lembur = jam dibayar (per 1 jam penuh sampai absen pulang, di luar istirahat). HK = hari kerja, HL = hari libur / OFF."}</T>
            {status === "" && kind !== "semua" && kind !== "kehadiran" && <> <T>Pada Semua status, pengajuan yang belum selesai selalu ikut tampil walau tanggalnya di luar rentang.</T></>}
          </p>
        </section>

        {/* Rincian harian (1 karyawan, laporan Semua / Kehadiran) */}
        {days.length > 0 && (kind === "semua" || kind === "kehadiran") && (
          <section className="rounded-2xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-800"><T>Rincian per hari</T> · {rows[0]?.name}</div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium"><T>Tanggal</T></th><th className="px-3 py-2 font-medium"><T>Shift</T></th>
                    <th className="px-3 py-2 font-medium"><T>Masuk</T></th><th className="px-3 py-2 font-medium"><T>Pulang</T></th>
                    <th className="px-3 py-2 font-medium"><T>Status</T></th><th className="px-3 py-2 font-medium"><T>Keterangan</T></th>
                    {kind === "semua" && <th className="px-3 py-2 font-medium"><T>Lembur</T></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {days.map((d) => {
                    const note = [d.lateMinutes ? `${t("terlambat")} ${d.lateMinutes} ${t("mnt")}` : "", d.earlyHours ? `${t("pulang cepat")} ${num(d.earlyHours)} ${t("jam")}` : "",
                      d.leave ? `${t("Cuti")}: ${d.leave}` : "", d.trip ? `${t("Dinas")}: ${d.trip}` : ""].filter(Boolean).join(" · ");
                    const off = d.shift === "OFF" || d.shift.startsWith("Libur");
                    return (
                      <tr key={d.date} className={off ? "bg-gray-50/70 text-gray-400" : ""}>
                        <td className="px-4 py-2">{formatDate(d.date)}</td>
                        <td className="px-3 py-2">{d.shift}</td>
                        <td className="px-3 py-2 tabular-nums">{d.checkIn ?? "-"}</td>
                        <td className="px-3 py-2 tabular-nums">{d.checkOut ?? (d.checkIn ? <span className="text-amber-600"><T>belum</T></span> : "-")}</td>
                        <td className={`px-3 py-2 ${d.status === "ALPHA" ? "font-semibold text-rose-600" : ""}`}>{d.status ? <T>{STATUS[d.status] ?? d.status}</T> : "-"}</td>
                        <td className={`px-3 py-2 ${d.lateMinutes || d.earlyHours ? "text-amber-700" : ""}`}>{note || "-"}</td>
                        {kind === "semua" && <td className="px-3 py-2">{d.overtime ? <>{d.overtime} <span className="text-[11px] text-gray-500">· {d.otPaid} {t("jam dibayar")}</span></> : "-"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        </div>
        </div>
      </main>
    </div>
  );
}
