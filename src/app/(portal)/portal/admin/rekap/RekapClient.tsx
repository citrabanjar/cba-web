"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Download, Filter, Loader2, Users, X } from "lucide-react";
import * as XLSX from "xlsx";
import { T, useT } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import { formatDate } from "@/lib/utils";
import type { RecapDay, RecapRow } from "@/lib/attendance-recap";

type Emp = { id: string; name: string; employeeId: string | null; department: string | null };
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const STATUS: Record<string, string> = { HADIR: "Hadir", IZIN: "Izin", SAKIT: "Sakit", ALPHA: "Alpha", CUTI: "Cuti", DINAS: "Dinas" };

export default function RekapClient({ from, to, picked, tooLong, employees, rows, days }: {
  from: string; to: string; picked: string[]; tooLong: boolean; employees: Emp[]; rows: RecapRow[]; days: RecapDay[];
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
  const apply = () => start(() => router.push(`/portal/admin/rekap?dari=${f.from}&sampai=${f.to}${sel.size ? `&karyawan=${[...sel].join(",")}` : ""}`));

  const total = (k: keyof RecapRow) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const leaveText = (r: RecapRow) => Object.entries(r.leaveByType).map(([k, v]) => `${k} ${num(v)}`).join(", ");

  const exportXlsx = () => {
    const head = ["ID Karyawan", "Nama", "Departemen", "Hari Kerja", "Hadir", "Terlambat (kali)", "Terlambat (menit)", "Pulang Cepat (kali)", "Pulang Cepat (jam)",
      "Tidak Absen Pulang", "Alpha", "Izin", "Sakit", "Cuti (hari)", "Rincian Cuti", "Dinas (hari)", "Lembur (kali)", "Lembur Hari Kerja (jam)", "Lembur Hari Libur (jam)"];
    const data = rows.map((r) => [r.employeeId ?? "", r.name, r.department ?? "", r.workDays, r.present, r.late, r.lateMinutes, r.early, r.earlyHours,
      r.noCheckout, r.alpha, r.izin, r.sakit, r.leaveDays, leaveText(r), r.tripDays, r.otCount, r.otWorkHours, r.otRestHours]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[`Rekap Kehadiran ${formatDate(from)} s/d ${formatDate(to)}`], [], head, ...data]);
    ws["!cols"] = head.map((h, i) => ({ wch: i === 1 ? 26 : i === 14 ? 30 : Math.max(10, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Rekap");
    if (days.length) {
      const dh = ["Tanggal", "Shift", "Masuk", "Pulang", "Status", "Terlambat (menit)", "Pulang Cepat (jam)", "Cuti", "Dinas", "Lembur", "Lembur Dibayar (jam)"];
      const dd = days.map((d) => [formatDate(d.date), d.shift, d.checkIn ?? "", d.checkOut ?? "", d.status ? STATUS[d.status] ?? d.status : "", d.lateMinutes || "", d.earlyHours || "",
        d.leave ?? "", d.trip ?? "", d.overtime ?? "", d.otPaid ?? ""]);
      const ws2 = XLSX.utils.aoa_to_sheet([[`${rows[0]?.name ?? ""} ${rows[0]?.employeeId ?? ""}`], [], dh, ...dd]);
      ws2["!cols"] = dh.map((h) => ({ wch: Math.max(11, h.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws2, "Harian");
    }
    XLSX.writeFile(wb, `rekap_kehadiran_${from}_${to}.xlsx`);
  };

  const th = "px-3 py-2 text-right font-medium";
  const td = "px-3 py-2 text-right tabular-nums";
  return (
    <div className="max-w-7xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-white"><T>Rekap Kehadiran</T></h1>
        <p className="mt-0.5 text-sm text-white/70"><T>Kehadiran, cuti, dinas, dan lembur dalam periode tertentu, untuk satu atau banyak karyawan.</T></p>
      </div>

      {/* Filter */}
      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44"><label className="mb-1 block text-xs font-medium text-gray-500"><T>Dari tanggal</T></label><DateInput value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
          <div className="w-44"><label className="mb-1 block text-xs font-medium text-gray-500"><T>Sampai tanggal</T></label><DateInput value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500"><T>Karyawan</T></label>
            <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">
              <Users size={15} className="text-gray-400" /> {sel.size ? <>{sel.size} <T>dipilih</T></> : <T>Semua karyawan</T>}
            </button>
          </div>
          <button type="button" disabled={loading || !f.from || !f.to} onClick={apply}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Filter size={15} />} <T>Tampilkan</T>
          </button>
          {rows.length > 0 && (
            <button type="button" onClick={exportXlsx} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <Download size={15} /> <T>Excel</T>
            </button>
          )}
        </div>
        {open && (
          <div className="rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau ID...")} className="h-9 min-w-40 flex-1 rounded-lg border border-gray-200 px-3 text-sm" />
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
                <option value="">{t("Semua departemen")}</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button type="button" onClick={() => setSel((s) => new Set([...s, ...shown.map((e) => e.id)]))} className="text-xs font-medium text-brand hover:underline"><T>Pilih semua yang tampil</T></button>
              {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline"><X size={12} /> <T>Kosongkan (semua karyawan)</T></button>}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {shown.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50">
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
                  <span className="flex-1">{e.name} <span className="text-xs text-gray-400">{e.employeeId}{e.department ? ` · ${e.department}` : ""}</span></span>
                </label>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400"><T>Kosongkan pilihan karyawan untuk menampilkan semua. Pilih satu karyawan untuk melihat rincian per hari.</T></p>
      </section>

      {/* Ringkasan per karyawan */}
      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <ClipboardList size={16} className="text-brand" />
          <h3 className="flex-1 text-sm font-semibold text-gray-800"><T>Rekap</T> {formatDate(from)} – {formatDate(to)}</h3>
          <span className="text-xs text-gray-500">{rows.length} <T>karyawan</T></span>
        </div>
        {tooLong ? (
          <p className="px-5 py-8 text-center text-sm text-rose-600"><T>Rentang tanggal paling lama 1 tahun.</T></p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Tidak ada data.</T></p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium"><T>Karyawan</T></th>
                  <th className={th}><T>Hari kerja</T></th><th className={th}><T>Hadir</T></th><th className={th}><T>Terlambat</T></th>
                  <th className={th}><T>Pulang cepat</T></th><th className={th}><T>Tdk absen pulang</T></th><th className={th}>Alpha</th>
                  <th className={th}><T>Izin / Sakit</T></th><th className={th}><T>Cuti</T></th><th className={th}><T>Dinas</T></th>
                  <th className={th}><T>Lembur HK</T></th><th className={th}><T>Lembur HL</T></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2"><p className="font-medium text-gray-800">{r.name}</p><p className="text-[11px] text-gray-400">{r.employeeId}{r.department ? ` · ${r.department}` : ""}</p></td>
                    <td className={td}>{r.workDays}</td>
                    <td className={td}>{r.present}</td>
                    <td className={td}>{r.late ? <>{r.late}<span className="text-[11px] text-gray-400"> · {r.lateMinutes} <T>mnt</T></span></> : "-"}</td>
                    <td className={td}>{r.early ? <>{r.early}<span className="text-[11px] text-gray-400"> · {num(r.earlyHours)} <T>jam</T></span></> : "-"}</td>
                    <td className={td}>{r.noCheckout || "-"}</td>
                    <td className={`${td} ${r.alpha ? "font-semibold text-rose-600" : ""}`}>{r.alpha || "-"}</td>
                    <td className={td}>{r.izin + r.sakit ? `${r.izin} / ${r.sakit}` : "-"}</td>
                    <td className={td} title={leaveText(r)}>{r.leaveDays ? num(r.leaveDays) : "-"}</td>
                    <td className={td}>{r.tripDays || "-"}</td>
                    <td className={td}>{r.otWorkHours ? `${num(r.otWorkHours)} ${t("jam")}` : "-"}</td>
                    <td className={td}>{r.otRestHours ? `${num(r.otRestHours)} ${t("jam")}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 font-semibold text-gray-800">
                  <tr>
                    <td className="px-4 py-2"><T>Total</T></td>
                    <td className={td}>{total("workDays")}</td><td className={td}>{total("present")}</td><td className={td}>{total("late")}</td>
                    <td className={td}>{total("early")}</td><td className={td}>{total("noCheckout")}</td><td className={td}>{total("alpha")}</td>
                    <td className={td}>{total("izin")} / {total("sakit")}</td><td className={td}>{num(total("leaveDays"))}</td><td className={td}>{total("tripDays")}</td>
                    <td className={td}>{num(total("otWorkHours"))}</td><td className={td}>{num(total("otRestHours"))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="border-t border-gray-100 px-5 py-2 text-[11px] text-gray-400">
          <T>Cuti = cuti disetujui dalam hari kerja (setengah hari = 0,5). Lembur = jam dibayar (per 1 jam penuh sampai absen pulang, di luar istirahat). HK = hari kerja, HL = hari libur / OFF.</T>
        </p>
      </section>

      {/* Rincian harian (1 karyawan) */}
      {days.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-800"><T>Rincian per hari</T> · {rows[0]?.name}</div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium"><T>Tanggal</T></th><th className="px-3 py-2 font-medium"><T>Shift</T></th>
                  <th className="px-3 py-2 font-medium"><T>Masuk</T></th><th className="px-3 py-2 font-medium"><T>Pulang</T></th>
                  <th className="px-3 py-2 font-medium"><T>Status</T></th><th className="px-3 py-2 font-medium"><T>Keterangan</T></th>
                  <th className="px-3 py-2 font-medium"><T>Lembur</T></th>
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
                      <td className="px-3 py-2">{d.overtime ? <>{d.overtime} <span className="text-[11px] text-gray-500">· {d.otPaid} {t("jam dibayar")}</span></> : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
