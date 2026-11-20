"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, FileDown, Lock, Play, Trash2, Undo2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { useCanEdit, useIsSuperAdmin } from "@/components/portal/edit-access";
import { rupiah } from "@/lib/payroll";
import { isSeparate, isWeekly, periodLabel, separatePeriod, weeklyPayDate, weeklyPeriodForPay } from "@/lib/payroll-run-period";
import type { BonusEntry } from "@/lib/payroll-bonus";
import type { LineInputs, LineItem } from "@/lib/payroll-run";
import { buildTransferFile, getTransferDebit, cancelPayrollFinal, deletePayrollDraft, finalizePayroll, generatePayroll } from "./actions";
import { proposedText } from "@/lib/approval-text";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { TRANSFER_TEMPLATES } from "@/lib/bank-transfer";

export type RunLine = {
  id: string; userId: string; name: string; employeeId: string; department: string | null;
  daily?: boolean; // jadwal bayar Mingguan (gaji harian)
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

// Rincian komponen per karyawan: Tetap (gaji tetap bulanan, PPh 21) dan Tidak rutin (lembur, dinas, THR, pinjaman, potongan absen).
function ItemGroups({ items, fixed, empty }: { items: LineItem[]; fixed: Set<string>; empty: string }) {
  const t = useT();
  if (!items.length) return <p className="text-[11px] italic text-gray-400"><T>{empty}</T></p>;
  const isFixed = (i: LineItem) => i.code === "GP" || fixed.has(i.code);
  const groups = [["Tetap", items.filter(isFixed)], ["Tidak rutin", items.filter((i) => !isFixed(i))]] as const;
  return (
    <div className="space-y-2">
      {groups.filter(([, list]) => list.length).map(([label, list]) => (
        <div key={label}>
          <p className="mb-0.5 text-[10px] font-semibold text-gray-500"><T>{label}</T></p>
          {list.map((i) => (
            <div key={i.code} className="flex items-start justify-between gap-2 py-0.5" title={i.detail || undefined}>
              <span className="min-w-0 text-gray-700">{t(i.name)}</span>
              <span className="shrink-0 tabular-nums text-gray-900">{rupiah(i.amount)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Angka kehadiran & lembur hanya tampilan dari modul Kehadiran / Lembur; koreksi dilakukan di data sumbernya lalu Hitung Ulang.
const hoursText = (v: number[]) => (v.length ? v.map((x) => String(x).replace(".", ",")).join(", ") : "-");

// Proses gaji bulanan: hitung draft dari komponen yang ditempel ke tiap karyawan; pilih komponen tidak rutin; isi jam lembur;
// lalu finalkan untuk mengunci angka dan menerbitkan slip gaji.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

type Freq = "BULANAN" | "MINGGUAN" | "TERPISAH";
const freqOf = (p: string): Freq => (isSeparate(p) ? "TERPISAH" : isWeekly(p) ? "MINGGUAN" : "BULANAN");
const BONUS_MODE_LABEL: Record<string, string> = { BULANAN: "ikut payroll bulanan", MINGGUAN: "ikut payroll mingguan", TERPISAH: "dibayar terpisah" };
const dmy = (d: string) => d.split("-").reverse().join("-");
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default function RunTab({ runs, bonus, weekStartDay, fixedCodes = [], initialPeriod }: { initialPeriod?: string; fixedCodes?: string[]; runs: Run[]; bonus: BonusEntry[]; weekStartDay: number }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: tombol hitung/final/hapus & isian baris disembunyikan
  const superAdmin = useIsSuperAdmin(); // Batalkan Final hanya Super Admin
  const [undo, setUndo] = useState<string | null>(null);
  const [xfer, setXfer] = useState<{ template: string; date: string; debit: string } | null>(null); // isian Buat File Transfer // isian alasan Batalkan Final (null = tertutup)
  const separateList = bonus.filter((b) => b.mode === "TERPISAH");
  const [freq, setFreq] = useState<Freq>(() => (initialPeriod ? freqOf(initialPeriod) : "BULANAN"));
  const weekly = freq === "MINGGUAN";
  const [period, setPeriod] = useState(() => initialPeriod ?? runs.find((r) => r.status === "DRAFT" && freqOf(r.period) === "BULANAN")?.period ?? thisMonth());
  const switchFreq = (f: Freq) => {
    setFreq(f); setMsg(null);
    const draft = runs.find((r) => r.status === "DRAFT" && freqOf(r.period) === f)?.period;
    const next = separateList.find((b) => b.payDate >= today()) ?? separateList[separateList.length - 1];
    setPeriod(draft ?? (f === "MINGGUAN" ? weeklyPeriodForPay(today(), weekStartDay) : f === "TERPISAH" ? (next ? separatePeriod(next.payDate, next.code) : "") : thisMonth()));
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
  const fixed = new Set(fixedCodes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const final = run?.status === "FINAL";
  const lines = run?.lines ?? [];
  // Baris bisa dilipat: tertutup = total; terbuka = rincian komponen.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpened((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpen = lines.length > 0 && lines.every((l) => opened.has(l.id));
  const total = (k: keyof Pick<RunLine, "earnings" | "deductions" | "pph21" | "netPay" | "benefits">) => lines.reduce((a, l) => a + l[k], 0);

  const act = (fn: () => Promise<{ error?: string; count?: number; proposed?: string }>, ok: string) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.proposed) showNotice(proposedText(r.proposed));
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.proposed ? proposedText(r.proposed) : ok.replace("{n}", String(r.count ?? "")) });
    });
  };

  return (
    // Satu panel: pilihan periode + tombol, ringkasan total, lalu tabel (tanpa kartu bertumpuk).
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <section className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-800"><T>Jadwal bayar</T></p>
          <div className="flex h-9 gap-1 rounded-full bg-gray-100 p-1">
            {([["BULANAN", "Bulanan"], ["MINGGUAN", "Mingguan"], ["TERPISAH", "THR / Bonus terpisah"]] as const).map(([f, l]) => (
              <button key={f} type="button" onClick={() => switchFreq(f)}
                className={`rounded-full px-3 text-xs ${freq === f ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}><T>{l}</T></button>
            ))}
          </div>
        </div>
        {freq === "TERPISAH" ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-800"><T>THR / Bonus terpisah</T></p>
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
            <p className="text-xs font-semibold text-gray-800"><T>{weekly ? "Tanggal bayar (Senin)" : "Periode"}</T></p>
            {/* Mingguan: pilih tanggal gajian; tanggal selain Senin dibulatkan ke Senin sebelumnya. */}
            <input type={weekly ? "date" : "month"} value={weekly && period ? weeklyPayDate(period) : period}
              onChange={(e) => {
                const p = weekly && e.target.value ? weeklyPeriodForPay(e.target.value, weekStartDay) : e.target.value;
                setPeriod(p); setMsg(null);
              }}
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm" />
          </div>
        )}
        {run && (
          <span className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${final ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
>
            <span className={`h-1.5 w-1.5 rounded-full ${final ? "bg-emerald-500" : "bg-amber-500"}`} />
            <T>{final ? "Final" : "Draft"}</T>
          </span>
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
                <Lock size={14} /> <T>Finalkan</T>
              </button>
              <button type="button" disabled={pending}
                onClick={async () => { if (await askConfirm(t("Hapus draft periode ini?"))) act(() => deletePayrollDraft(run.id), "Draft dihapus."); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <Trash2 size={14} /> <T>Hapus Draft</T>
              </button>
            </>
          )}
          {canEdit && run && final && xfer === null && (
            <button type="button" disabled={pending}
              onClick={async () => setXfer({ template: TRANSFER_TEMPLATES[0].key, date: today(), debit: await getTransferDebit().catch(() => "") })}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
              <FileDown size={14} /> <T>Buat File Transfer</T>
            </button>
          )}
          {superAdmin && run && final && undo === null && (
            <button type="button" disabled={pending} onClick={() => setUndo("")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-200 px-4 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Undo2 size={14} /> <T>Batalkan Final</T>
            </button>
          )}
        </div>
        {canEdit && run && final && xfer !== null && (
          <div className="w-full space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-gray-500"><T>Template</T>
                <select value={xfer.template} onChange={(e) => setXfer({ ...xfer, template: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand">
                  {TRANSFER_TEMPLATES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-gray-500"><T>Tanggal transfer</T>
                <input type="date" value={xfer.date} min={today()} onChange={(e) => setXfer({ ...xfer, date: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand" />
              </label>
              <label className="block text-xs font-medium text-gray-500"><T>Rekening debit perusahaan</T>
                <input inputMode="numeric" value={xfer.debit} onChange={(e) => setXfer({ ...xfer, debit: e.target.value.replace(/\D/g, "") })}
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand" />
              </label>
            </div>
            <p className="text-[11px] text-gray-400"><T>Rekening Mandiri ditransfer In-House; bank lain lewat BI FAST. Karyawan dengan gaji bersih Rp 0 dan karyawan Cash dilewati.</T></p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={pending} onClick={() => setXfer(null)} className="h-8 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50"><T>Tutup</T></button>
              <button type="button" disabled={pending || !xfer.date || !xfer.debit}
                onClick={() => start(async () => {
                  const r = await buildTransferFile(run.id, { template: xfer.template, date: xfer.date, debitAccount: xfer.debit });
                  if (r.error || !r.content || !r.fileName) { void showNotice(r.error ? r.error.split("\n").map((x) => t(x)).join("\n") : t("Gagal membuat file."), "error"); return; }
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([r.content], { type: "text/plain" }));
                  a.download = r.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                  setXfer(null);
                  void showNotice([`${t("File transfer dibuat")}: ${r.count} ${t("karyawan")}, ${t("total")} ${rupiah(r.total ?? 0)}.`,
                    r.other ? `${r.other} ${t("ke bank lain lewat BI FAST.")}` : "", r.skipped ? `${r.skipped} ${t("karyawan dilewati (gaji bersih Rp 0).")}` : "",
                    r.cash?.length ? `${r.cash.length} ${t("karyawan dibayar Cash, tidak masuk file (dibayar Admin)")}: ${r.cash.join(", ")}.` : ""].filter(Boolean).join("\n"));
                })}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                <FileDown size={13} /> <T>Unduh File</T>
              </button>
            </div>
          </div>
        )}
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
      {((weekly && period) || scheduled.length > 0 || taxedHere.length > 0) && (
        <div className="space-y-0.5 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-700 sm:px-5">
          {weekly && period && (
            <p><T>Data</T> <b className="font-semibold text-gray-900">{dmy(period)} – {dmy(plusDays(period, 6))}</b> · <T>penghasilan</T> <b className="font-semibold text-gray-900">{MONTHS[Number(weeklyPayDate(period).slice(5, 7)) - 1]} {weeklyPayDate(period).slice(0, 4)}</b></p>
          )}
          {scheduled.length > 0 && <p><T>THR / Bonus dibayar di periode ini</T>: {scheduled.map((b) => `${b.code}${b.label ? ` (${b.label})` : ""} ${dmy(b.payDate)}`).join(", ")}</p>}
          {taxedHere.length > 0 && <p className="text-gray-500"><T>PPh 21 THR / Bonus yang dibayar mingguan / terpisah ikut di sini</T>: {taxedHere.map((b) => `${b.code} ${dmy(b.payDate)} (${t(BONUS_MODE_LABEL[b.mode])})`).join(", ")}</p>}
        </div>
      )}

      {!run ? (
        <p className="border-t border-gray-100 p-10 text-center text-sm text-gray-500">
          <T>Belum ada proses gaji untuk</T> {weekly ? periodLabel(period) : `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`}.{canEdit && <> <T>Klik Hitung Gaji.</T></>}
        </p>
      ) : (
        <>
          {/* Ringkasan: angka besar dengan garis pemisah tipis (bukan kartu). */}
          <div className="grid grid-cols-2 divide-gray-100 border-t border-gray-100 sm:grid-cols-4 sm:divide-x">
            {[
              ["Total pendapatan", rupiah(total("earnings")), "text-gray-900"],
              ["Total PPh 21", rupiah(total("pph21")), "text-gray-900"],
              ["Total gaji bersih", rupiah(total("netPay")), "text-emerald-700"],
              ["Biaya perusahaan", rupiah(total("earnings") + total("benefits")), "text-gray-900"],
            ].map(([l, v, c]) => (
              <div key={l} className="px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400"><T>{l}</T></p>
                <p className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          {run.note && (
            <p className="whitespace-pre-line border-t border-amber-100 bg-amber-50/60 px-5 py-2.5 text-xs text-amber-800">{run.note}</p>
          )}
          <div className="max-h-[calc(100vh-220px)] min-h-64 overflow-auto border-t border-gray-100">
            <table className="w-full min-w-[960px] text-xs">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="w-[22%] px-4 py-2.5">
                    {/* Buka / tutup semua baris, di kepala tabel. */}
                    <button type="button" onClick={() => setOpened(allOpen ? new Set() : new Set(lines.map((l) => l.id)))} title={t(allOpen ? "Tutup semua" : "Buka semua")}
                      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800">
                      <ChevronDown size={13} className={`transition-transform ${allOpen ? "rotate-180" : ""}`} /> <T>Karyawan</T>
                    </button>
                  </th>
                  <th className="w-[32%] px-3 py-2.5"><T>Pendapatan</T></th>
                  <th className="w-[30%] px-3 py-2.5"><T>Potongan</T></th>
                  <th className="w-[10%] px-3 py-2.5 text-right"><T>Gaji Bersih</T></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l) => {
                  const gp = l.items.find((i) => i.code === "GP");
                  const earn = l.items.filter((i) => i.kind === "PENDAPATAN");
                  const cut = l.items.filter((i) => i.kind === "POTONGAN");
                  const benefit = l.items.filter((i) => i.kind === "BENEFIT").reduce((a, i) => a + i.amount, 0);
                  // Ikut sebagian (karyawan bulanan di proses mingguan / THR terpisah): tanpa gaji pokok, jadi kehadiran tidak ditampilkan.
                  const facts = [
                    gp ? `${t("Hadir")} ${l.inputs.daysPresent}` : "",
                    gp && l.inputs.absentDays ? `${t("Mangkir")} ${l.inputs.absentDays}` : "",
                    l.inputs.tripDays ? `${t("Dinas")} ${l.inputs.tripDays} ${t("hari")}` : "",
                    (l.inputs.otWork ?? []).length ? `${t("Lembur HK")} ${hoursText(l.inputs.otWork ?? [])} ${t("jam")}` : "",
                    (l.inputs.otRest ?? []).length ? `${t("Lembur HL")} ${hoursText(l.inputs.otRest ?? [])} ${t("jam")}` : "",
                  ].filter(Boolean).join(" · ");
                  const isOpen = opened.has(l.id);
                  const sum = (list: LineItem[]) => list.reduce((a, i) => a + i.amount, 0);
                  // Tertutup: total saja; terbuka: rincian Tetap / Tidak rutin.
                  const brief = (list: LineItem[], empty: string) => list.length
                    ? <p className="tabular-nums text-gray-900">{rupiah(sum(list))}</p>
                    : <p className="text-[11px] italic text-gray-400"><T>{empty}</T></p>;
                  return (
                    <tr key={l.id} onClick={() => toggle(l.id)} className={`cursor-pointer align-top hover:bg-gray-50/60 ${isOpen ? "bg-gray-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                          <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />{l.name}
                          {!isOpen && l.warning && <span title={l.warning}><AlertTriangle size={12} className="text-amber-600" /></span>}
                        </p>
                        <p className="text-[10px] text-gray-400">{[l.employeeId, l.ptkp ?? "TK/0", l.department].filter(Boolean).join(" · ")}</p>
                        {isOpen && facts && <p className="mt-1 text-[10px] text-gray-500">{facts}</p>}
                        {isOpen && l.warning && <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700"><AlertTriangle size={10} />{l.warning}</p>}
                      </td>
                      <td className="px-3 py-3">{isOpen ? <ItemGroups items={earn} fixed={fixed} empty="Tidak ada pendapatan lain" /> : brief(earn, "Tidak ada pendapatan lain")}</td>
                      <td className="px-3 py-3">
                        {isOpen ? <ItemGroups items={cut} fixed={fixed} empty="Tidak ada potongan" /> : brief(cut, "Tidak ada potongan")}
                        {isOpen && benefit > 0 && <p className="mt-1.5 border-t border-dashed border-gray-200 pt-1 text-[10px] text-gray-400"><T>Benefit</T>: {rupiah(benefit)}</p>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="text-sm font-bold tabular-nums text-gray-900">{rupiah(l.netPay)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
