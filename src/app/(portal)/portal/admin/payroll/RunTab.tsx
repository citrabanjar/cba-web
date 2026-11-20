"use client";

import { Fragment, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, Play, Trash2, Undo2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { useCanEdit, useIsSuperAdmin } from "@/components/portal/edit-access";
import { parseHours, rupiah } from "@/lib/payroll";
import { isSeparate, isWeekly, periodLabel, separatePeriod, weekStartOf } from "@/lib/payroll-run-period";
import type { BonusEntry } from "@/lib/payroll-bonus";
import type { LineInputs, LineItem } from "@/lib/payroll-run";
import { cancelPayrollFinal, deletePayrollDraft, finalizePayroll, generatePayroll, updatePayrollLine } from "./actions";
import { proposedText } from "@/lib/approval-text";
import { askConfirm, showNotice } from "@/components/portal/Confirm";

export type RunLine = {
  id: string; userId: string; name: string; employeeId: string; department: string | null;
  inputs: LineInputs; items: LineItem[]; gross: number; earnings: number; deductions: number; benefits: number;
  pph21: number; netPay: number; ptkp: string | null; terRate: number | null; warning: string | null;
};
export type NonRoutine = { code: string; name: string };
export type Run = {
  id: string; period: string; label: string; status: string; frequency: string; extraCodes: string[];
  finalizedBy: string | null; finalizedAt: string | null; note?: string | null; lines: RunLine[];
};

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

function NumberCell({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setV(String(value)); } // ikut angka terbaru dari server
  return (
    <input type="text" inputMode="numeric" autoComplete="off" value={v} disabled={disabled} onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
      onBlur={() => { if (Number(v) !== value) onSave(Number(v) || 0); }}
      className="h-8 w-20 rounded-lg border border-gray-200 bg-white px-2 text-right text-xs tabular-nums disabled:border-transparent disabled:bg-transparent" />
  );
}

// Jam lembur per pengajuan, mis. "4, 9" = dua pengajuan 4 jam dan 9 jam.
function HoursCell({ value, disabled, onSave }: { value: number[]; disabled: boolean; onSave: (v: number[]) => void }) {
  const text = value.join(", ");
  const [v, setV] = useState(text);
  const [prev, setPrev] = useState(text);
  if (prev !== text) { setPrev(text); setV(text); }
  return (
    <input type="text" inputMode="decimal" value={v} disabled={disabled} placeholder="4, 9"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const h = parseHours(v); if (h.join(", ") !== text) onSave(h); else setV(text); }}
      className="h-8 w-24 rounded-lg border border-gray-200 bg-white px-2 text-right text-xs tabular-nums disabled:border-transparent disabled:bg-transparent" />
  );
}

// Proses gaji bulanan: hitung draft dari komponen yang ditempel ke tiap karyawan; pilih komponen tidak rutin; isi jam lembur;
// lalu finalkan untuk mengunci angka dan menerbitkan slip gaji.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

type Freq = "BULANAN" | "MINGGUAN" | "TERPISAH";
const freqOf = (p: string): Freq => (isSeparate(p) ? "TERPISAH" : isWeekly(p) ? "MINGGUAN" : "BULANAN");
const BONUS_MODE_LABEL: Record<string, string> = { BULANAN: "ikut payroll bulanan", MINGGUAN: "ikut payroll mingguan", TERPISAH: "dibayar terpisah" };
const dmy = (d: string) => d.split("-").reverse().join("-");

export default function RunTab({ runs, bonus, weekStartDay }: { runs: Run[]; bonus: BonusEntry[]; weekStartDay: number }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: tombol hitung/final/hapus & isian baris disembunyikan
  const superAdmin = useIsSuperAdmin(); // Batalkan Final hanya Super Admin
  const [undo, setUndo] = useState<string | null>(null); // isian alasan Batalkan Final (null = tertutup)
  const separateList = bonus.filter((b) => b.mode === "TERPISAH");
  const [freq, setFreq] = useState<Freq>("BULANAN");
  const weekly = freq === "MINGGUAN";
  const [period, setPeriod] = useState(() => runs.find((r) => r.status === "DRAFT" && freqOf(r.period) === "BULANAN")?.period ?? thisMonth());
  const switchFreq = (f: Freq) => {
    setFreq(f); setMsg(null);
    const draft = runs.find((r) => r.status === "DRAFT" && freqOf(r.period) === f)?.period;
    const next = separateList.find((b) => b.payDate >= today()) ?? separateList[separateList.length - 1];
    setPeriod(draft ?? (f === "MINGGUAN" ? weekStartOf(today(), weekStartDay) : f === "TERPISAH" ? (next ? separatePeriod(next.payDate, next.code) : "") : thisMonth()));
  };
  const run = runs.find((r) => r.period === period);
  // THR / Bonus yang terjadwal dibayar di periode terpilih (Pengaturan -> Jadwal THR / Bonus).
  const range = (() => {
    if (freq === "TERPISAH") return null;
    if (weekly) { const a = new Date(`${period}T00:00:00Z`); return isNaN(a.getTime()) ? null : [period, new Date(a.getTime() + 6 * 86_400_000).toISOString().slice(0, 10)]; }
    return /^\d{4}-\d{2}$/.test(period) ? [`${period}-01`, `${period}-31`] : null;
  })();
  const scheduled = range ? bonus.filter((b) => b.payDate >= range[0] && b.payDate <= range[1] && (weekly ? b.mode !== "TERPISAH" : b.mode === "BULANAN")) : [];
  const taxedHere = range && !weekly ? bonus.filter((b) => b.payDate >= range[0] && b.payDate <= range[1] && b.mode !== "BULANAN") : [];
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const final = run?.status === "FINAL";
  const lines = run?.lines ?? [];
  const total = (k: keyof Pick<RunLine, "earnings" | "deductions" | "pph21" | "netPay" | "benefits">) => lines.reduce((a, l) => a + l[k], 0);

  const act = (fn: () => Promise<{ error?: string; count?: number; proposed?: string }>, ok: string) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.proposed) showNotice(proposedText(r.proposed));
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.proposed ? proposedText(r.proposed) : ok.replace("{n}", String(r.count ?? "")) });
    });
  };
  const save = (lineId: string, patch: Partial<LineInputs>) => act(() => updatePayrollLine(lineId, patch), "Dihitung ulang.");

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500"><T>Jadwal bayar</T></p>
          <div className="flex h-9 gap-1 rounded-full bg-gray-100 p-1">
            {([["BULANAN", "Bulanan"], ["MINGGUAN", "Mingguan"], ["TERPISAH", "THR / Bonus terpisah"]] as const).map(([f, l]) => (
              <button key={f} type="button" onClick={() => switchFreq(f)}
                className={`rounded-full px-3 text-xs ${freq === f ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`}><T>{l}</T></button>
            ))}
          </div>
        </div>
        {freq === "TERPISAH" ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500"><T>THR / Bonus terpisah</T></p>
            {separateList.length === 0 ? (
              <p className="flex h-9 items-center text-xs text-gray-400"><T>Belum ada jadwal “Dibayar terpisah” di Pengaturan → Jadwal THR / Bonus.</T></p>
            ) : (
              <select value={period} onChange={(e) => { setPeriod(e.target.value); setMsg(null); }} className="h-9 rounded-lg border border-gray-200 px-3 text-sm">
                {separateList.map((b) => (
                  <option key={b.id} value={separatePeriod(b.payDate, b.code)}>{b.code}{b.label ? ` · ${b.label}` : ""} · {dmy(b.payDate)}</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500"><T>Periode</T>{weekly && <span className="ml-1 font-normal text-gray-400">{periodLabel(period)}</span>}</p>
            <input type={weekly ? "date" : "month"} value={period}
              onChange={(e) => {
                const p = weekly && e.target.value ? weekStartOf(e.target.value, weekStartDay) : e.target.value;
                setPeriod(p); setMsg(null);
              }}
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm" />
          </div>
        )}
        {(scheduled.length > 0 || taxedHere.length > 0) && (
          <div className="space-y-1 text-xs text-gray-600">
            {scheduled.length > 0 && <p><T>THR / Bonus dibayar di periode ini</T>: {scheduled.map((b) => `${b.code}${b.label ? ` (${b.label})` : ""} ${dmy(b.payDate)}`).join(", ")}</p>}
            {taxedHere.length > 0 && <p className="text-gray-400"><T>PPh 21 THR / Bonus yang dibayar mingguan / terpisah ikut di sini</T>: {taxedHere.map((b) => `${b.code} ${dmy(b.payDate)} (${t(BONUS_MODE_LABEL[b.mode])})`).join(", ")}</p>}
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {canEdit && !final && period && (
            <button type="button" disabled={pending} onClick={() => act(() => generatePayroll(period), "Gaji dihitung.")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85 disabled:opacity-50">
              <Play size={14} /> <T>{run ? "Hitung Ulang" : "Hitung Gaji"}</T>
            </button>
          )}
          {canEdit && run && !final && (
            <>
              <button type="button" disabled={pending || lines.length === 0}
                onClick={async () => { if (await askConfirm(t("Finalkan periode ini? Angka dikunci dan slip gaji terbit untuk karyawan."))) act(() => finalizePayroll(run.id), "Final. {n} slip gaji terbit."); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <Lock size={14} /> <T>Finalkan & Terbitkan Slip</T>
              </button>
              <button type="button" disabled={pending}
                onClick={async () => { if (await askConfirm(t("Hapus draft periode ini?"))) act(() => deletePayrollDraft(run.id), "Draft dihapus."); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <Trash2 size={14} /> <T>Hapus Draft</T>
              </button>
            </>
          )}
          {superAdmin && run && final && undo === null && (
            <button type="button" disabled={pending} onClick={() => setUndo("")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-200 px-4 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Undo2 size={14} /> <T>Batalkan Final</T>
            </button>
          )}
        </div>
        {superAdmin && run && final && undo !== null && (
          <div className="w-full space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3">
            <p className="text-xs text-gray-600"><T>Periode kembali ke Draft: slip gaji ditarik, angsuran pinjaman dan reimbursement yang ikut terbayar dikembalikan.</T></p>
            <textarea value={undo} onChange={(e) => setUndo(e.target.value)} rows={2} placeholder={t("Alasan pembatalan...")}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            <div className="flex justify-end gap-2">
              <button type="button" disabled={pending} onClick={() => setUndo(null)} className="h-8 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50"><T>Tutup</T></button>
              <button type="button" disabled={pending || !undo.trim()}
                onClick={async () => {
                  if (!(await askConfirm(t("Batalkan final periode ini? Slip gaji karyawan untuk periode ini akan ditarik.")))) return;
                  const why = undo;
                  act(async () => { const r = await cancelPayrollFinal(run.id, why); if (!r.error) setUndo(null); return r; }, "Final dibatalkan. Periode kembali ke Draft.");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                <Undo2 size={13} /> <T>Batalkan Final</T>
              </button>
            </div>
          </div>
        )}
        {msg && <p className={`w-full rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
      </section>

      {!run ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-10 text-center text-sm text-gray-500">
          <T>Belum ada proses gaji untuk</T> {weekly ? periodLabel(period) : `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`}.{canEdit && <> <T>Klik Hitung Gaji.</T></>}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Status", final ? t("Final") : t("Draft"), final ? "text-emerald-700" : "text-amber-600"],
              ["Total pendapatan", rupiah(total("earnings")), "text-gray-900"],
              ["Total PPh 21", rupiah(total("pph21")), "text-gray-900"],
              ["Total gaji bersih", rupiah(total("netPay")), "text-emerald-700"],
              ["Biaya perusahaan", rupiah(total("earnings") + total("benefits")), "text-gray-900"],
            ].map(([l, v, c]) => (
              <div key={l} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500"><T>{l}</T></p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          {run.note && (
            <p className="whitespace-pre-line rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{run.note}</p>
          )}
          {final && run.finalizedAt && (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 size={15} /> <T>Final oleh</T> {run.finalizedBy ?? "—"} · {new Date(run.finalizedAt).toLocaleString("id-ID")}. <T>Slip gaji sudah terbit di menu Slip Gaji karyawan.</T>
            </p>
          )}
          <div className="max-h-[calc(100vh-260px)] min-h-64 overflow-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-wide text-gray-400">
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2"><T>Karyawan</T></th>
                  <th className="px-2 py-2 text-right"><T>Hadir</T></th>
                  <th className="px-2 py-2 text-right"><T>Mangkir</T></th>
                  <th className="px-2 py-2 text-right"><T>Dinas (hari / kali)</T></th>
                  <th className="px-2 py-2 text-right" title={t("Jam per pengajuan, pisahkan dengan koma")}><T>Lembur HK (jam)</T></th>
                  <th className="px-2 py-2 text-right" title={t("Jam per pengajuan, pisahkan dengan koma")}><T>Lembur HL (jam)</T></th>
                  <th className="px-2 py-2 text-right"><T>Pendapatan</T></th>
                  <th className="px-2 py-2 text-right"><T>Potongan</T></th>
                  <th className="px-2 py-2 text-right"><T>PPh 21</T></th>
                  <th className="px-3 py-2 text-right"><T>Gaji Bersih</T></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="hover:bg-gray-50/70">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="flex items-start gap-1.5 text-left">
                          <ChevronDown size={13} className={`mt-0.5 shrink-0 text-gray-400 transition-transform ${open === l.id ? "rotate-180" : ""}`} />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">{l.name}</span>
                            <span className="block text-[10px] text-gray-400">{[l.employeeId, l.ptkp ?? "TK/0", l.department].filter(Boolean).join(" · ")}</span>
                            {l.warning && <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700"><AlertTriangle size={10} />{l.warning}</span>}
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right"><NumberCell value={l.inputs.daysPresent} disabled={final || !canEdit} onSave={(v) => save(l.id, { daysPresent: v })} /></td>
                      <td className="px-2 py-2 text-right"><NumberCell value={l.inputs.absentDays} disabled={final || !canEdit} onSave={(v) => save(l.id, { absentDays: v })} /></td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-600">{l.inputs.tripDays ?? 0} / {l.inputs.trips ?? 0}</td>
                      <td className="px-2 py-2 text-right"><HoursCell value={l.inputs.otWork ?? []} disabled={final || !canEdit} onSave={(v) => save(l.id, { otWork: v })} /></td>
                      <td className="px-2 py-2 text-right"><HoursCell value={l.inputs.otRest ?? []} disabled={final || !canEdit} onSave={(v) => save(l.id, { otRest: v })} /></td>
                      <td className="px-2 py-2 text-right tabular-nums">{rupiah(l.earnings)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-600">{rupiah(l.items.filter((i) => i.kind === "POTONGAN" && i.code !== "PPH21").reduce((a, i) => a + i.amount, 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{rupiah(l.pph21)}{l.terRate !== null && <span className="block text-[10px] text-gray-400">TER {l.terRate}%</span>}</td>
                      <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-gray-900">{rupiah(l.netPay)}</td>
                    </tr>
                    {open === l.id && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="grid gap-4 md:grid-cols-3">
                            {(["PENDAPATAN", "POTONGAN", "BENEFIT"] as const).map((k) => (
                              <div key={k}>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                  <T>{k === "PENDAPATAN" ? "Pendapatan" : k === "POTONGAN" ? "Potongan" : "Benefit ditanggung perusahaan"}</T>
                                </p>
                                {l.items.filter((i) => i.kind === k).map((i) => (
                                  <p key={i.code} className="flex justify-between gap-2 py-0.5">
                                    <span className="min-w-0"><span className="text-gray-700">{t(i.name)}</span>{i.detail && <span className="block text-[10px] text-gray-400">{i.detail}</span>}</span>
                                    <span className="shrink-0 tabular-nums">{rupiah(i.amount)}</span>
                                  </p>
                                ))}
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] text-gray-500"><T>Bruto kena pajak</T>: {rupiah(l.gross)}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
