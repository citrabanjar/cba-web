"use client";

import { Fragment, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, Play, Trash2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { parseHours, rupiah } from "@/lib/payroll";
import type { LineInputs, LineItem } from "@/lib/payroll-run";
import { deletePayrollDraft, finalizePayroll, generatePayroll, updatePayrollLine } from "./actions";

export type RunLine = {
  id: string; userId: string; name: string; employeeId: string; department: string | null;
  inputs: LineInputs; items: LineItem[]; gross: number; earnings: number; deductions: number; benefits: number;
  pph21: number; netPay: number; ptkp: string | null; terRate: number | null; warning: string | null;
};
export type NonRoutine = { code: string; name: string };
export type Run = {
  id: string; period: string; label: string; status: string; extraCodes: string[];
  finalizedBy: string | null; finalizedAt: string | null; lines: RunLine[];
};

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

function NumberCell({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setV(String(value)); } // ikut angka terbaru dari server
  return (
    <input type="number" min={0} value={v} disabled={disabled}
      onChange={(e) => setV(e.target.value)}
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
export default function RunTab({ runs, nonRoutine }: { runs: Run[]; nonRoutine: NonRoutine[] }) {
  const t = useT();
  const [period, setPeriod] = useState(() => runs.find((r) => r.status === "DRAFT")?.period ?? thisMonth());
  const run = runs.find((r) => r.period === period);
  const [extra, setExtra] = useState<string[]>(run?.extraCodes ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const final = run?.status === "FINAL";
  const lines = run?.lines ?? [];
  const total = (k: keyof Pick<RunLine, "earnings" | "deductions" | "pph21" | "netPay" | "benefits">) => lines.reduce((a, l) => a + l[k], 0);

  const act = (fn: () => Promise<{ error?: string; count?: number }>, ok: string) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: ok.replace("{n}", String(r.count ?? "")) });
    });
  };
  const save = (lineId: string, patch: Partial<LineInputs>) => act(() => updatePayrollLine(lineId, patch), "Dihitung ulang.");

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500"><T>Periode</T></p>
          <input type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setMsg(null); setExtra(runs.find((r) => r.period === e.target.value)?.extraCodes ?? []); }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm" />
        </div>
        {nonRoutine.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500"><T>Sertakan komponen tidak rutin</T></p>
            <div className="flex h-9 flex-wrap items-center gap-3">
              {nonRoutine.map((c) => (
                <label key={c.code} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={extra.includes(c.code)} disabled={final} className="h-4 w-4 accent-[var(--color-brand)]"
                    onChange={(e) => setExtra((x) => (e.target.checked ? [...x, c.code] : x.filter((k) => k !== c.code)))} />
                  {t(c.name)}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!final && (
            <button type="button" disabled={pending} onClick={() => act(() => generatePayroll(period, extra), "Gaji dihitung.")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85 disabled:opacity-50">
              <Play size={14} /> <T>{run ? "Hitung Ulang" : "Hitung Gaji"}</T>
            </button>
          )}
          {run && !final && (
            <>
              <button type="button" disabled={pending || lines.length === 0}
                onClick={() => { if (window.confirm(t("Finalkan periode ini? Angka dikunci dan slip gaji terbit untuk karyawan."))) act(() => finalizePayroll(run.id), "Final. {n} slip gaji terbit."); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <Lock size={14} /> <T>Finalkan & Terbitkan Slip</T>
              </button>
              <button type="button" disabled={pending}
                onClick={() => { if (window.confirm(t("Hapus draft periode ini?"))) act(() => deletePayrollDraft(run.id), "Draft dihapus."); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <Trash2 size={14} /> <T>Hapus Draft</T>
              </button>
            </>
          )}
        </div>
        {msg && <p className={`w-full rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
      </section>

      {!run ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-10 text-center text-sm text-gray-500">
          <T>Belum ada proses gaji untuk</T> {MONTHS[Number(period.slice(5)) - 1]} {period.slice(0, 4)}. <T>Klik Hitung Gaji.</T>
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
                      <td className="px-2 py-2 text-right"><NumberCell value={l.inputs.daysPresent} disabled={final} onSave={(v) => save(l.id, { daysPresent: v })} /></td>
                      <td className="px-2 py-2 text-right"><NumberCell value={l.inputs.absentDays} disabled={final} onSave={(v) => save(l.id, { absentDays: v })} /></td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-600">{l.inputs.tripDays ?? 0} / {l.inputs.trips ?? 0}</td>
                      <td className="px-2 py-2 text-right"><HoursCell value={l.inputs.otWork ?? []} disabled={final} onSave={(v) => save(l.id, { otWork: v })} /></td>
                      <td className="px-2 py-2 text-right"><HoursCell value={l.inputs.otRest ?? []} disabled={final} onSave={(v) => save(l.id, { otRest: v })} /></td>
                      <td className="px-2 py-2 text-right tabular-nums">{rupiah(l.earnings)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-600">{rupiah(l.deductions - l.pph21)}</td>
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
