"use client";

import { useState, useTransition } from "react";
import { HandCoins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { addMonths, buildSchedule, periodShort } from "@/lib/loans";
import LoanCard, { type LoanView } from "@/components/portal/LoanCard";
import { cancelLoanRequest, requestLoan } from "./actions";

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export default function PinjamanClient({ loans }: { loans: LoanView[] }) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [tenor, setTenor] = useState("6");
  const [start, setStart] = useState(() => addMonths(thisMonth(), 1));
  const [purpose, setPurpose] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const preview = Number(amount) > 0 && Number(tenor) > 0 ? buildSchedule(Number(amount), Number(tenor), start) : [];
  const hasPending = loans.some((l) => l.status === "PENDING");

  function submit() {
    setMsg(null);
    run(async () => {
      const r = await requestLoan({ amount: Number(amount), tenor: Number(tenor), startPeriod: start, purpose });
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: "Pengajuan terkirim. Menunggu persetujuan admin." }); setAmount(""); setPurpose(""); }
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-white"><HandCoins size={17} /></span>
          <div><h3 className="font-semibold text-gray-900"><T>Ajukan Pinjaman</T></h3>
            <p className="text-xs text-gray-400"><T>Tanpa bunga. Angsuran dipotong dari gaji setiap bulan setelah disetujui admin.</T></p></div>
        </div>
        {hasPending ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><T>Masih ada pengajuan yang menunggu persetujuan.</T></p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label className="text-xs"><T>Jumlah pinjaman (Rp)</T></Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs"><T>Jumlah angsuran (bulan)</T></Label>
                <Input type="number" min={1} max={120} value={tenor} onChange={(e) => setTenor(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs"><T>Mulai dipotong</T></Label>
                <Input type="month" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Keperluan</T></Label>
              <textarea value={purpose} rows={2} onChange={(e) => setPurpose(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" /></div>
            {preview.length > 0 && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <T>Perkiraan angsuran</T>: <b>{formatRupiah(preview[0].amount)}</b> x {preview.length} <T>bulan</T>
                {preview[preview.length - 1].amount !== preview[0].amount && <> (<T>terakhir</T> {formatRupiah(preview[preview.length - 1].amount)})</>}
                {" · "}{periodShort(preview[0].period)} – {periodShort(preview[preview.length - 1].period)}
              </p>
            )}
            {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
            <div className="flex justify-end">
              <Button onClick={submit} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Ajukan</T></Button>
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
              onClick={() => { if (window.confirm(t("Batalkan pengajuan ini?"))) run(async () => { await cancelLoanRequest(l.id); }); }}>
              <T>Batalkan</T>
            </Button>
          ) : undefined} />
        ))}
      </section>
    </main>
  );
}
