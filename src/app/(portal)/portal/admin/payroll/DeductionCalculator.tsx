"use client";

import { useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { dayPenalty } from "@/lib/attendance-penalty";
import type { DayShift } from "@/lib/schedule";

// Kalkulator potongan mangkir, terlambat, dan pulang cepat (isi angka manual), memakai rumus yang sama
// dengan Proses Gaji:
// - Mangkir (PRORATA): dasar upah / hari kerja periode x hari mangkir.
// - Terlambat / pulang cepat (PER_JAM): dasar upah / hari bulan berjalan / jam per hari x jam dipotong.
//   Terlambat dipotong bila lebih dari 30 menit, dibulatkan ke bawah per 30 menit dari jam masuk shift;
//   pulang cepat dihitung dari jam pulang dibulatkan ke atas per 30 menit sampai jam pulang shift,
//   tanpa jam istirahat (lib/attendance-penalty).

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const num = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
const daysIn = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
type Row = { checkIn: string; checkOut: string };

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <h3 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-800"><T>{title}</T></h3>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>{children}{hint && <p className="text-[11px] text-gray-400"><T>{hint}</T></p>}</div>;
}

export default function DeductionCalculator() {
  const t = useT();
  const [base, setBase] = useState("4000000");
  const [month, setMonth] = useState(thisMonth);
  // Mangkir
  const [workDays, setWorkDays] = useState("21");
  const [absent, setAbsent] = useState("1");
  // Terlambat / pulang cepat
  const [shift, setShift] = useState({ start: "08:00", end: "16:00", breakStart: "12:00", breakEnd: "13:00", tolerance: "5" });
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [rows, setRows] = useState<Row[]>([{ checkIn: "08:40", checkOut: "16:00" }, { checkIn: "08:00", checkOut: "13:25" }]);

  const b = Number(base) || 0;
  const monthDays = daysIn(month || thisMonth());
  const wd = Number(workDays) || 0;
  const absentDays = Number(absent) || 0;
  const absentCut = wd ? (b / wd) * absentDays : 0;

  const day: DayShift = {
    code: "X", name: "Shift", color: "#000", isOff: false, startTime: shift.start, endTime: shift.end,
    breaks: shift.breakStart && shift.breakEnd ? [{ start: shift.breakStart, end: shift.breakEnd }] : [],
    lateTolerance: Number(shift.tolerance) || 0, earlyLeaveTolerance: 0,
  };
  const dateKey = `${month || thisMonth()}-01`;
  const at = (hhmm: string, nextDay: boolean) => new Date(new Date(`${dateKey}T${hhmm}:00+07:00`).getTime() + (nextDay ? 86_400_000 : 0));
  const crosses = shift.end <= shift.start;
  const results = rows.map((r) => {
    if (!r.checkIn) return null;
    const inNext = crosses && r.checkIn < shift.start && r.checkIn <= shift.end; // masuk lewat tengah malam (shift malam)
    const outNext = crosses ? (r.checkOut ? r.checkOut <= shift.end || r.checkOut < shift.start : false) : false;
    return dayPenalty(day, dateKey, at(r.checkIn, inNext), r.checkOut ? at(r.checkOut, outNext) : null);
  });
  const hours = Number(hoursPerDay) || 8;
  const lateHours = results.reduce((a, p) => a + (p?.lateHours ?? 0), 0);
  const earlyHours = results.reduce((a, p) => a + (p?.earlyHours ?? 0), 0);
  const hourly = monthDays && hours ? b / monthDays / hours : 0;
  const lateCut = hourly * lateHours;
  const earlyCut = hourly * earlyHours;
  const set = (i: number, patch: Partial<Row>) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-slate-500 text-white"><Calculator size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Kalkulator Potongan</T></h3>
          <p className="text-xs text-gray-400"><T>Hitung cepat potongan mangkir, terlambat, dan pulang cepat dengan rumus yang sama seperti Proses Gaji. Tidak menyimpan apa pun.</T></p>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 sm:grid-cols-3">
        <Field label="Dasar upah sebulan (Rp)" hint="Gaji pokok, upah tetap, atau dasar yang dipakai komponen potongan.">
          <Input type="number" value={base} onChange={(e) => setBase(e.target.value)} />
        </Field>
        <Field label="Bulan" hint={`${monthDays} ${t("hari kalender")}`}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Box title="Potongan Mangkir">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hari kerja dalam periode" hint="Jumlah hari kerja terjadwal karyawan bulan itu.">
              <Input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value)} />
            </Field>
            <Field label="Hari mangkir">
              <Input type="number" step="0.5" value={absent} onChange={(e) => setAbsent(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
            <p className="text-xs text-gray-500">{rp(b)} / {wd} <T>hari kerja</T> × {num(absentDays)} <T>hari</T></p>
            <p className="mt-1 text-lg font-bold text-gray-900">{rp(absentCut)}</p>
            <p className="text-[11px] text-gray-400"><T>Per hari</T>: {rp(wd ? b / wd : 0)}</p>
          </div>
        </Box>

        <Box title="Potongan Terlambat & Pulang Cepat">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Jam masuk shift"><Input type="time" value={shift.start} onChange={(e) => setShift({ ...shift, start: e.target.value })} /></Field>
            <Field label="Jam pulang shift"><Input type="time" value={shift.end} onChange={(e) => setShift({ ...shift, end: e.target.value })} /></Field>
            <Field label="Toleransi terlambat (menit)" hint="Hanya untuk status Terlambat (kondite).">
              <Input type="number" value={shift.tolerance} onChange={(e) => setShift({ ...shift, tolerance: e.target.value })} />
            </Field>
            <Field label="Istirahat mulai"><Input type="time" value={shift.breakStart} onChange={(e) => setShift({ ...shift, breakStart: e.target.value })} /></Field>
            <Field label="Istirahat selesai"><Input type="time" value={shift.breakEnd} onChange={(e) => setShift({ ...shift, breakEnd: e.target.value })} /></Field>
            <Field label="Jam kerja per hari" hint="Pembagi tarif per jam (aturan CBA: 8).">
              <Input type="number" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} />
            </Field>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <tr><th className="px-2 py-2">#</th><th className="px-2 py-2"><T>Masuk</T></th><th className="px-2 py-2"><T>Pulang</T></th><th className="px-2 py-2 text-right"><T>Terlambat</T></th><th className="px-2 py-2 text-right"><T>Pulang cepat</T></th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = results[i];
                  return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5"><input type="time" value={r.checkIn} onChange={(e) => set(i, { checkIn: e.target.value })} className="h-8 rounded-lg border border-gray-200 px-1.5" /></td>
                      <td className="px-2 py-1.5"><input type="time" value={r.checkOut} onChange={(e) => set(i, { checkOut: e.target.value })} className="h-8 rounded-lg border border-gray-200 px-1.5" /></td>
                      <td className="px-2 py-1.5 text-right">
                        {p ? <>{p.lateMinutes} <T>mnt</T>{p.late && <span className="ml-1 rounded bg-orange-100 px-1 text-[9px] font-semibold text-orange-700"><T>Telat</T></span>}<span className="block text-gray-400"><T>dipotong</T> {num(p.lateHours)} <T>jam</T></span></> : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">{p ? <><T>dipotong</T> {num(p.earlyHours)} <T>jam</T></> : "—"}</td>
                      <td className="px-1 py-1.5"><button type="button" aria-label={t("Hapus baris")} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-gray-400 hover:text-rose-600"><Trash2 size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setRows((x) => [...x, { checkIn: shift.start, checkOut: shift.end }])} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            <Plus size={12} /> <T>Tambah hari</T>
          </button>

          <div className="space-y-1 rounded-xl bg-gray-50 px-4 py-3 text-sm">
            <p className="text-xs text-gray-500"><T>Tarif per jam</T>: {rp(b)} / {monthDays} <T>hari</T> / {num(hours)} <T>jam</T> = <b>{rp(hourly)}</b></p>
            <p className="flex justify-between"><span><T>Terlambat</T> {num(lateHours)} <T>jam</T></span><b>{rp(lateCut)}</b></p>
            <p className="flex justify-between"><span><T>Pulang cepat</T> {num(earlyHours)} <T>jam</T></span><b>{rp(earlyCut)}</b></p>
            <p className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold text-gray-900"><span><T>Total</T></span><span>{rp(lateCut + earlyCut)}</span></p>
          </div>
          <p className="text-[11px] text-gray-400">
            <T>Terlambat dipotong bila lebih dari 30 menit, dibulatkan ke bawah per 30 menit. Pulang cepat dibulatkan ke atas per 30 menit sampai jam pulang shift, jam istirahat tidak dihitung.</T>
          </p>
        </Box>
      </div>

      <div className="flex justify-between rounded-2xl bg-ink px-5 py-4 text-white">
        <span className="text-sm"><T>Total potongan (mangkir + terlambat + pulang cepat)</T></span>
        <span className="text-xl font-bold">{rp(absentCut + lateCut + earlyCut)}</span>
      </div>
    </div>
  );
}
