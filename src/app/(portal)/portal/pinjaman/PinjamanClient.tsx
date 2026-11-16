"use client";

import { useState, useTransition } from "react";
import { HandCoins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { addMonths, buildSchedule, buildScheduleByAmount, periodShort } from "@/lib/loans";
import LoanCard, { type LoanView } from "@/components/portal/LoanCard";
import { cancelLoanRequest, requestLoan } from "./actions";
import { askConfirm } from "@/components/portal/Confirm";

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export default function PinjamanClient({ loans }: { loans: LoanView[] }) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [tenor, setTenor] = useState("6");
  const [start, setStart] = useState(() => addMonths(thisMonth(), 1));
  const [purpose, setPurpose] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  // Pinjaman yang masih berjalan: karyawan bisa memohon hitung ulang angsuran (pinjaman baru digabung dengan sisanya).
  const running = loans.filter((l) => l.status === "BERJALAN");
  const [recalc, setRecalc] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => running.map((l) => l.id));
  const [mode, setMode] = useState<"amount" | "count">("amount");
  const [each, setEach] = useState("");
  const unpaidOf = (l: LoanView) => l.installments.filter((i) => i.status !== "LUNAS").sort((a, b) => a.period.localeCompare(b.period));
  const restOf = (l: LoanView) => unpaidOf(l).reduce((a, i) => a + i.amount, 0);
  const monthlyOf = (l: LoanView) => unpaidOf(l)[0]?.amount ?? 0;
  const oldMonthly = running.reduce((a, l) => a + monthlyOf(l), 0);
  const merged = recalc ? running.filter((l) => picked.includes(l.id)) : [];
  const total = (Number(amount) || 0) + merged.reduce((a, l) => a + restOf(l), 0);
  const byAmount = merged.length > 0 && mode === "amount";
  // Jadwal baru dihitung saat tombol Simulasi diklik (bukan setiap ketikan). Isian berubah = simulasi harus diulang sebelum Ajukan.
  const inputKey = JSON.stringify([amount, tenor, start, merged.map((l) => l.id), byAmount, each]);
  const [simKey, setSimKey] = useState<string | null>(null);
  const simulated = simKey === inputKey;
  const preview = !simulated || total <= 0 ? []
    : byAmount ? (Number(each) > 0 ? buildScheduleByAmount(total, Number(each), start) : []) : Number(tenor) > 0 ? buildSchedule(total, Number(tenor), start) : [];
  const after = preview.length ? preview[0].amount + running.filter((l) => !merged.includes(l)).reduce((a, l) => a + monthlyOf(l), 0) : 0;
  const hasPending = loans.some((l) => l.status === "PENDING");

  function submit() {
    setMsg(null);
    run(async () => {
      const r = await requestLoan({
        amount: Number(amount), tenor: Number(tenor), startPeriod: start, purpose,
        ...(merged.length ? { recalc: { mergeIds: merged.map((l) => l.id), installment: byAmount ? Number(each) : undefined } } : {}),
      });
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: "Pengajuan terkirim. Menunggu persetujuan." }); setAmount(""); setPurpose(""); setRecalc(false); setEach(""); setSimKey(null); }
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-white"><HandCoins size={17} /></span>
          <div><h3 className="font-semibold text-gray-900"><T>Ajukan Pinjaman</T></h3>
            <p className="text-xs text-gray-400"><T>Tanpa bunga. Pengajuan disetujui atasan langsung, diperiksa Admin, lalu diputus pimpinan. Angsuran dipotong dari gaji setiap bulan setelah pinjaman dicairkan.</T></p></div>
        </div>
        {hasPending ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><T>Masih ada pengajuan yang menunggu persetujuan.</T></p>
        ) : (
          <div className="space-y-3">
            {/* Hitung ulang: isian jangka waktu / angsuran pindah ke kotak pinjaman berjalan. */}
            <div className={`grid gap-3 ${merged.length ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              <div className="space-y-1.5"><Label className="text-xs"><T>Jumlah pinjaman (Rp)</T></Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              {!merged.length && (
                <div className="space-y-1.5"><Label className="text-xs"><T>Jangka waktu (bulan)</T></Label>
                  <Input type="number" min={1} max={120} value={tenor} onChange={(e) => setTenor(e.target.value)} /></div>
              )}
              <div className="space-y-1.5"><Label className="text-xs"><T>Mulai dipotong</T></Label>
                <Input type="month" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Keperluan</T></Label>
              <textarea value={purpose} rows={2} onChange={(e) => setPurpose(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" /></div>
            {running.length > 0 && (
              <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-600"><T>Pinjaman yang sedang berjalan</T></p>
                {running.map((l) => {
                  const unpaid = unpaidOf(l);
                  return (
                    <label key={l.id} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recalc && picked.includes(l.id) ? "bg-indigo-50" : "bg-gray-50"} ${recalc ? "cursor-pointer" : ""}`}>
                      {recalc && <input type="checkbox" checked={picked.includes(l.id)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 text-gray-800"><span><T>Pinjaman ke-</T>{l.seqNo}</span><span><T>sisa</T> <b>{formatRupiah(restOf(l))}</b></span></span>
                        <span className="block text-[11px] text-gray-500">
                          {formatRupiah(monthlyOf(l))}<T>/bulan</T> · {unpaid.length}x <T>lagi</T>
                          {unpaid.length > 0 && <> · <T>s/d</T> {periodShort(unpaid[unpaid.length - 1].period)}</>}
                        </span>
                      </span>
                    </label>
                  );
                })}
                <p className="flex justify-between text-xs text-gray-600"><T>Potongan pinjaman saat ini per bulan</T> <b>{formatRupiah(oldMonthly)}</b></p>
                <label className="flex cursor-pointer items-start gap-2 border-t border-gray-100 pt-2 text-sm font-medium text-gray-800">
                  <input type="checkbox" checked={recalc} onChange={(e) => setRecalc(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
                  <span><T>Ajukan hitung ulang angsuran</T>
                    <span className="block text-[11px] font-normal text-gray-500"><T>Pinjaman baru digabung dengan sisa pinjaman yang dipilih, lalu angsurannya dihitung ulang.</T></span></span>
                </label>
                {recalc && (
                  <div className="space-y-2">
                    <div className="flex gap-1 rounded-full bg-gray-100 p-1">
                      {([["amount", "Berdasarkan angsuran"], ["count", "Berdasarkan jangka waktu"]] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setMode(k)}
                          className={`h-8 flex-1 rounded-full text-xs ${mode === k ? "bg-ink font-semibold text-white" : "text-gray-500"}`}><T>{label}</T></button>
                      ))}
                    </div>
                    {mode === "amount" ? (
                      <div className="space-y-1.5"><Label className="text-xs"><T>Angsuran per bulan yang diinginkan (Rp)</T></Label>
                        <Input type="number" min={0} value={each} onChange={(e) => setEach(e.target.value)} placeholder={t("Contoh: 1000000")} /></div>
                    ) : (
                      <div className="space-y-1.5"><Label className="text-xs"><T>Jangka waktu yang diinginkan (bulan)</T></Label>
                        <Input type="number" min={1} max={120} value={tenor} onChange={(e) => setTenor(e.target.value)} /></div>
                    )}
                    {!merged.length && <p className="text-[11px] text-rose-600"><T>Pilih minimal satu pinjaman berjalan untuk digabung.</T></p>}
                  </div>
                )}
              </div>
            )}
            {preview.length > 0 && (
                <div className="space-y-2 rounded-xl border border-gray-200 p-3 text-xs text-gray-600">
                  <p className="font-semibold text-gray-700"><T>{merged.length ? "Simulasi angsuran baru (hasil hitung ulang)" : "Simulasi angsuran pinjaman baru"}</T></p>
                  {merged.length > 0 && <p className="flex justify-between gap-2"><span><T>Total pinjaman gabungan</T></span><b>{formatRupiah(total)}</b></p>}
                  {preview.length <= 120 && (
                    <>
                      <p className="flex justify-between gap-2"><span><T>Angsuran per bulan</T></span><span><b>{formatRupiah(preview[0].amount)}</b>
                        {preview[preview.length - 1].amount !== preview[0].amount && <> (<T>terakhir</T> {formatRupiah(preview[preview.length - 1].amount)})</>}</span></p>
                      <p className="flex justify-between gap-2"><span><T>Jangka waktu</T></span><b>{preview.length} <T>bulan</T></b></p>
                      <p className="flex justify-between gap-2"><span><T>Periode potongan</T></span><b>{periodShort(preview[0].period)} – {periodShort(preview[preview.length - 1].period)}</b></p>
                    </>
                  )}
                  {running.length > 0 && (
                    <>
                      <p className="flex justify-between gap-2 rounded-md bg-amber-50 px-2 py-1 text-amber-900"><span><T>Total potongan pinjaman per bulan</T></span><span>{formatRupiah(oldMonthly)} → <b>{formatRupiah(after)}</b></span></p>
                      {!merged.length && <p className="text-[11px] text-gray-500"><T>Jika disetujui, angsuran pinjaman baru ditambahkan ke potongan pinjaman yang sudah berjalan.</T></p>}
                    </>
                  )}
                  {preview.length > 120 && <p className="text-rose-600"><T>Jumlah angsuran paling banyak 120 kali; naikkan potongan per bulan.</T></p>}
                </div>
            )}
            {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
            {!simulated && <p className="text-xs text-gray-500"><T>Klik Simulasi Angsuran untuk melihat ringkasan angsuran sebelum mengajukan.</T></p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={pending || total <= 0} onClick={() => setSimKey(inputKey)}><T>Simulasi Angsuran</T></Button>
              <Button onClick={submit} disabled={pending || !simulated || preview.length === 0 || preview.length > 120} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Ajukan</T></Button>
            </div>
          </div>
        )}
        {hasPending && msg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><T>{msg.text}</T></p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700"><T>Pinjaman Saya</T></h3>
        {loans.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-center text-sm text-gray-500"><T>Belum ada pinjaman.</T></p>}
        {loans.map((l) => (
          <LoanCard key={l.id} loan={l} actions={l.status === "PENDING" ? (
            <Button variant="outline" size="sm" disabled={pending}
              onClick={async () => { if (await askConfirm(t("Batalkan pengajuan ini?"))) run(async () => { await cancelLoanRequest(l.id); }); }}>
              <T>Batalkan</T>
            </Button>
          ) : undefined} />
        ))}
      </section>
    </main>
  );
}
