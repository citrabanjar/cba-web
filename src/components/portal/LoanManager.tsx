"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoanCard, { type LoanView } from "@/components/portal/LoanCard";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { formatRupiah } from "@/lib/utils";
import { LOAN_GROUPS, loanStageOf, addMonths, buildSchedule, buildScheduleByAmount, loanSummary, periodShort } from "@/lib/loans";
import { cancelLoan, deleteLoan, markDisbursed, saveSchedule, submitLoanReview } from "@/app/(portal)/portal/admin/pinjaman/actions";
import { toast } from "@/components/portal/Toast";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { proposedText } from "@/lib/approval-text";

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function useAct() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string; proposed?: string }>, done: () => void) => {
    setError(null);
    start(async () => { const r = await fn(); if (r.error) setError(r.error); else { if (r.proposed) showNotice(proposedText(r.proposed)); done(); } });
  };
  return { error, pending, act };
}
const ErrorBox = ({ error }: { error: string | null }) => (error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p> : null);

// Proses pengajuan: jumlah, tenor, dan periode mulai bisa disesuaikan sebelum disetujui.
// Bisa digabung dengan pinjaman yang masih berjalan: sisa pinjaman lama + pinjaman baru jadi satu pinjaman,
// dengan potongan per bulan atau jumlah angsuran sesuai permintaan.
function ApproveDialog({ loan, running, onClose }: { loan: LoanView; running: LoanView[]; onClose: () => void }) {
  const t = useT();
  // Permohonan hitung ulang dari karyawan menjadi isian awal; Admin boleh menyesuaikan.
  const req = loan.flow?.request?.mergeIds.length ? loan.flow.request : null;
  const [principal, setPrincipal] = useState(String(req?.principal ?? loan.principal));
  const [tenor, setTenor] = useState(String(req?.tenor ?? loan.tenor));
  const [start, setStart] = useState(loan.startPeriod);
  const [note, setNote] = useState("");
  const [merge, setMerge] = useState(!!req && running.some((l) => req.mergeIds.includes(l.id)));
  const [picked, setPicked] = useState<string[]>(() => (req ? running.filter((l) => req.mergeIds.includes(l.id)) : running).map((l) => l.id));
  const [mode, setMode] = useState<"amount" | "count">(req && !req.installment ? "count" : "amount");
  const [amount, setAmount] = useState(req?.installment ? String(req.installment) : "");
  const { error, pending, act } = useAct();
  const unpaidOf = (l: LoanView) => l.installments.filter((i) => i.status !== "LUNAS").sort((a, b) => a.period.localeCompare(b.period));
  const restOf = (l: LoanView) => unpaidOf(l).reduce((a, i) => a + i.amount, 0);
  const monthlyOf = (l: LoanView) => unpaidOf(l)[0]?.amount ?? 0;
  const oldMonthly = running.reduce((a, l) => a + monthlyOf(l), 0);
  const merged = merge ? running.filter((l) => picked.includes(l.id)) : [];
  const cash = Number(principal) || 0;
  const total = cash + merged.reduce((a, l) => a + restOf(l), 0);
  const byAmount = mode === "amount" && Number(amount) > 0;
  const preview = total > 0
    ? byAmount ? buildScheduleByAmount(total, Number(amount), start) : Number(tenor) > 0 ? buildSchedule(total, Number(tenor), start) : []
    : [];
  const approve = () => act(() => submitLoanReview(loan.id, {
    principal: cash, tenor: Number(tenor), startPeriod: start, note,
    installment: byAmount ? Number(amount) : undefined, mergeIds: merged.map((l) => l.id),
  }), () => { toast(t("Terkirim ke pimpinan untuk diputus"), "ok"); onClose(); });
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle><T>Pemeriksaan Pengajuan</T> · <T>Pinjaman ke-</T>{loan.seqNo}</DialogTitle></DialogHeader>
        {loan.purpose && <p className="-mt-2 text-sm text-gray-600">{loan.purpose}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs"><T>{merge ? "Dana baru yang dicairkan" : "Jumlah (Rp)"}</T></Label><Input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Mulai dipotong</T></Label><Input type="month" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        </div>

        {/* Pinjaman yang masih berjalan selalu ditampilkan sebagai bahan pertimbangan; bisa digabung ke pinjaman ini. */}
        {running.length > 0 && (
          <div className="space-y-2 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600"><T>Pinjaman yang sedang berjalan</T></p>
            <div className="space-y-1">
              {running.map((l) => {
                const unpaid = unpaidOf(l);
                const on = merge && picked.includes(l.id);
                return (
                  <label key={l.id} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${on ? "bg-indigo-50" : "bg-gray-50"} ${merge ? "cursor-pointer" : ""}`}>
                    {merge && <input type="checkbox" checked={picked.includes(l.id)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
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
            </div>
            <p className="flex justify-between text-xs text-gray-600"><T>Potongan pinjaman saat ini per bulan</T> <b>{formatRupiah(oldMonthly)}</b></p>
            <label className="flex cursor-pointer items-center gap-2 border-t border-gray-100 pt-2 text-sm font-medium text-gray-800">
              <input type="checkbox" checked={merge} onChange={(e) => { setMerge(e.target.checked); if (e.target.checked) setMode("amount"); }} className="h-4 w-4 accent-[var(--color-brand)]" />
              <T>Gabungkan dengan pinjaman yang masih berjalan</T>
            </label>
            {merge && (
              <>
                <p className="flex justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900"><T>Total pinjaman gabungan</T> <b>{formatRupiah(total)}</b></p>
                <p className="text-[11px] text-gray-400"><T>Pinjaman lama ditutup (Digabung); sisa angsurannya pindah ke pinjaman ini. Potongan baru berjalan setelah ditandai Dicairkan.</T></p>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs"><T>Atur angsuran</T></Label>
          <div className="flex gap-1 rounded-xl bg-gray-50 p-1 text-sm">
            {([["amount", "Potongan per bulan (Rp)"], ["count", "Jumlah angsuran (kali)"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 rounded-lg px-3 py-1.5 ${mode === k ? "bg-ink font-semibold text-white" : "text-gray-600"}`}><T>{l}</T></button>
            ))}
          </div>
          {mode === "amount"
            ? <Input type="number" value={amount} placeholder={t("Contoh: 1000000")} onChange={(e) => setAmount(e.target.value)} />
            : <Input type="number" value={tenor} onChange={(e) => setTenor(e.target.value)} />}
        </div>
        {preview.length > 0 && (() => {
          // Potongan per bulan sesudah disetujui: digabung = angsuran baru menggantikan angsuran pinjaman yang digabung;
          // tidak digabung = angsuran baru ditambah angsuran pinjaman lama yang tetap berjalan.
          const keep = running.filter((l) => !merged.includes(l)).reduce((a, l) => a + monthlyOf(l), 0);
          const after = preview[0].amount + keep;
          let left = total;
          return (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-600"><T>Angsuran baru</T></p>
              <p className="text-sm text-gray-800">
                <b>{formatRupiah(preview[0].amount)}</b><T>/bulan</T> x {preview.length} · {periodShort(preview[0].period)} – {periodShort(preview[preview.length - 1].period)}
                {preview[preview.length - 1].amount !== preview[0].amount && <span className="text-gray-500"> · <T>angsuran terakhir</T> {formatRupiah(preview[preview.length - 1].amount)}</span>}
              </p>
              {running.length > 0 && (
                <p className="flex justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span><T>Total potongan pinjaman per bulan</T>: {formatRupiah(oldMonthly)} → </span><b>{formatRupiah(after)}</b>
                </p>
              )}
              {preview.length > 120 && <p className="text-xs text-rose-600"><T>Jumlah angsuran paling banyak 120 kali; naikkan potongan per bulan.</T></p>}
              <p className="text-[11px] font-semibold text-gray-500"><T>Jadwal angsuran baru</T></p>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase text-gray-400">
                    <tr><th className="px-2 py-1 text-left"><T>Ke-</T></th><th className="px-2 py-1 text-left"><T>Periode</T></th><th className="px-2 py-1 text-right"><T>Nominal</T></th><th className="px-2 py-1 text-right"><T>Sisa</T></th></tr>
                  </thead>
                  <tbody>
                    {preview.map((x, i) => {
                      left -= x.amount;
                      return (
                        <tr key={i} className="border-t border-gray-50 text-gray-700">
                          <td className="px-2 py-1">{i + 1}</td><td className="px-2 py-1">{periodShort(x.period)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatRupiah(x.amount)}</td><td className="px-2 py-1 text-right tabular-nums text-gray-400">{formatRupiah(Math.max(0, left))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
        <p className="text-[11px] text-gray-400"><T>Periksa dokumen fisik pengajuan, lalu kirim ke pimpinan. Keputusan setuju atau tolak ada di pimpinan; setelah disetujui, tandai Dicairkan saat uang sudah diberikan.</T></p>
        <div className="space-y-1.5"><Label className="text-xs"><T>Catatan pemeriksaan untuk pimpinan</T></Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Misalnya: dokumen lengkap")} /></div>
        <ErrorBox error={error} />
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}><T>Batal</T></Button>
          <Button disabled={pending || (merge && merged.length === 0) || preview.length > 120} className="gap-1.5" onClick={approve}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Kirim ke Pimpinan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tandai pinjaman sudah dicairkan (uang diberikan/ditransfer manual).
function DisburseDialog({ loan, onClose }: { loan: LoanView; onClose: () => void }) {
  const [date, setDate] = useState(today());
  const { error, pending, act } = useAct();
  const first = loan.installments.find((i) => i.status !== "LUNAS");
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle><T>Tandai Dicairkan</T> · <T>Pinjaman ke-</T>{loan.seqNo}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-sm text-gray-600"><T>Uang pinjaman</T> {formatRupiah(loan.principal)} <T>sudah diberikan ke karyawan.</T></p>
        <div className="space-y-1.5 sm:w-1/2"><Label className="text-xs"><T>Tanggal dicairkan</T></Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {first && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"><T>Angsuran pertama dipotong di Proses Gaji</T> {periodShort(first.period)} · {formatRupiah(first.amount)}. <T>Ubah sisa angsuran bila perlu digeser.</T></p>}
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button disabled={pending} className="gap-1.5" onClick={() => act(() => markDisbursed(loan.id, date), onClose)}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Tandai Dicairkan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ubah sisa angsuran: yang sudah terpotong lewat Proses Gaji terkunci; sisanya bebas diatur selama totalnya = sisa pinjaman.
function ScheduleDialog({ loan, onClose }: { loan: LoanView; onClose: () => void }) {
  const t = useT();
  const paid = loan.installments.filter((i) => i.status === "LUNAS");
  const remaining = loanSummary(loan.principal, loan.installments).remaining;
  const [rows, setRows] = useState(() => loan.installments.filter((i) => i.status !== "LUNAS").map((i) => ({ period: i.period, amount: String(i.amount) })));
  const { error, pending, act } = useAct();
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const diff = Math.round(remaining - total);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Nominal yang diubah berlaku juga untuk angsuran sesudahnya; jumlah angsuran menyesuaikan dan
  // angsuran terakhir = sisanya. Dijalankan saat kolom ditinggalkan (atau Enter), bukan tiap ketikan.
  const [follow, setFollow] = useState(true);
  const [before, setBefore] = useState("");
  const cascade = (i: number) => {
    const each = Math.round(Number(rows[i]?.amount) || 0);
    if (!follow || each < 1 || rows[i].amount === before) return;
    let rest = remaining - rows.slice(0, i + 1).reduce((a, r) => a + (Number(r.amount) || 0), 0);
    if (rest < 0) return; // melebihi sisa pinjaman: biarkan, selisihnya terlihat di bawah
    const next = rows.slice(0, i + 1);
    while (rest > 0) {
      const amount = Math.min(each, rest);
      const period = rows[next.length]?.period ?? addMonths(next[next.length - 1].period, 1);
      next.push({ period, amount: String(amount) });
      rest -= amount;
    }
    setRows(next);
    setBefore(rows[i].amount);
  };
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle><T>Ubah Sisa Angsuran</T> · <T>Pinjaman ke-</T>{loan.seqNo}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500">
          <T>Pinjaman</T> {formatRupiah(loan.principal)} · <T>sudah terpotong</T> {formatRupiah(loan.principal - remaining)} · <T>sisa</T> <b className="text-gray-900">{formatRupiah(remaining)}</b>
        </p>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
          <span><T>Angsuran sesudahnya ikut nominal yang diubah</T> <span className="text-gray-400">· <T>jumlah angsuran menyesuaikan, angsuran terakhir = sisanya. Matikan untuk mengubah satu bulan saja.</T></span></span>
        </label>
        <div className="space-y-1.5">
          {paid.map((p) => (
            <div key={p.id} className="grid grid-cols-[32px_1fr_1fr_60px] items-center gap-2 text-sm text-gray-400">
              <span>{p.seq}</span><span>{periodShort(p.period)}</span><span className="text-right tabular-nums">{formatRupiah(p.amount)}</span>
              <span className="text-[10px] font-semibold text-emerald-600"><T>Terpotong</T></span>
            </div>
          ))}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[32px_1fr_1fr_60px] items-center gap-2">
              <span className="text-sm text-gray-500">{paid.length + i + 1}</span>
              <Input type="month" value={r.period} onChange={(e) => set(i, { period: e.target.value })} className="h-8" />
              <Input type="number" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} className="h-8 text-right"
                onFocus={() => setBefore(r.amount)} onBlur={() => cascade(i)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cascade(i); } }} />
              <button type="button" aria-label={t("Hapus baris")} className="rounded p-1 text-gray-400 hover:text-rose-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <p className={`rounded-lg px-3 py-2 text-xs ${diff === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          <T>Total angsuran belum terpotong</T>: {formatRupiah(total)} {diff === 0 ? `· ${t("sudah sama dengan sisa pinjaman")}` : `· ${t("selisih")} ${formatRupiah(diff)}`}
        </p>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button disabled={pending || diff !== 0} className="gap-1.5" onClick={() => act(() => saveSchedule(loan.id, rows.map((r) => ({ period: r.period, amount: Number(r.amount) }))), onClose)}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tombol aksi untuk satu pinjaman, sesuai statusnya.
export function LoanActions({ loan, onOpen }: { loan: LoanView; onOpen: (kind: "approve" | "disburse" | "schedule") => void }) {
  const t = useT();
  const [pending, start] = useTransition();
  const canCancel = ["DISETUJUI", "BERJALAN"].includes(loan.status) && !loan.installments.some((i) => i.status === "LUNAS");
  const canEdit = useCanEdit("pinjaman"); // hak lihat saja: tombol proses pinjaman disembunyikan
  if (!canEdit) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {loanStageOf(loan.status, loan.stage) === "ADMIN" && <Button size="sm" onClick={() => onOpen("approve")}><T>Periksa</T></Button>}
      {loan.status === "DISETUJUI" && <Button size="sm" onClick={() => onOpen("disburse")}><T>Tandai Dicairkan</T></Button>}
      {["DISETUJUI", "BERJALAN"].includes(loan.status) && <Button size="sm" variant="outline" onClick={() => onOpen("schedule")}><T>Ubah Sisa Angsuran</T></Button>}
      {canCancel && (
        <Button size="sm" variant="outline" disabled={pending} className="text-rose-600"
          onClick={async () => { if (await askConfirm(t("Batalkan pinjaman ini?"))) start(async () => { const r = await cancelLoan(loan.id); if (r.error) toast(r.error, "error"); else if (r.proposed) showNotice(proposedText(r.proposed)); }); }}>
          <T>Batalkan</T>
        </Button>
      )}
      <DeleteLoanButton loan={loan} />
    </div>
  );
}

// Hapus pinjaman yang dibatalkan/ditolak supaya daftar tetap bersih.
export function DeleteLoanButton({ loan }: { loan: { id: string; status: string; seqNo: number } }) {
  const t = useT();
  const [pending, start] = useTransition();
  const canEdit = useCanEdit("pinjaman");
  if (!canEdit || !["BATAL", "DITOLAK"].includes(loan.status)) return null;
  return (
    <Button size="sm" variant="outline" disabled={pending} className="gap-1.5 text-rose-600"
      onClick={async () => {
        if (!await askConfirm(`${t("Hapus permanen Pinjaman ke-")}${loan.seqNo}? ${t("Data yang dihapus tidak bisa dikembalikan.")}`)) return;
        start(async () => { const r = await deleteLoan(loan.id); if (r.error) toast(r.error, "error"); else if (r.proposed) showNotice(proposedText(r.proposed)); });
      }}>
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} <T>Hapus</T>
    </Button>
  );
}

export function LoanDialog({ kind, loan, running = [], onClose }: { kind: "approve" | "disburse" | "schedule"; loan: LoanView; running?: LoanView[]; onClose: () => void }) {
  if (kind === "approve") return <ApproveDialog loan={loan} running={running} onClose={onClose} />;
  if (kind === "disburse") return <DisburseDialog loan={loan} onClose={onClose} />;
  return <ScheduleDialog loan={loan} onClose={onClose} />;
}

// Tab Pinjaman di profil karyawan: ringkasan + daftar pinjaman karyawan itu beserta aksinya.
export default function ProfileLoans({ loans }: { loans: LoanView[] }) {
  const [dialog, setDialog] = useState<{ kind: "approve" | "disburse" | "schedule"; loan: LoanView } | null>(null);
  const month = thisMonth();
  const running = loans.filter((l) => l.status === "BERJALAN");
  const outstanding = running.reduce((a, l) => a + loanSummary(l.principal, l.installments).remaining, 0);
  const dueThisMonth = running.flatMap((l) => l.installments).filter((i) => i.period === month && i.status !== "LUNAS").reduce((a, i) => a + i.amount, 0);
  const next = running.flatMap((l) => l.installments).filter((i) => i.status !== "LUNAS" && i.period > month).sort((a, b) => a.period.localeCompare(b.period))[0];
  const stats = [
    ["Pinjaman berjalan", String(running.length)],
    ["Total sisa pinjaman", formatRupiah(outstanding)],
    ["Angsuran bulan ini", formatRupiah(dueThisMonth)],
    ["Angsuran berikutnya", next ? `${periodShort(next.period)} · ${formatRupiah(running.flatMap((l) => l.installments).filter((i) => i.period === next.period && i.status !== "LUNAS").reduce((a, i) => a + i.amount, 0))}` : "—"],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500"><T>{l}</T></p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{v}</p>
          </div>
        ))}
      </div>
      {loans.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-center text-sm text-gray-500"><T>Belum ada pinjaman.</T></p>}
      {LOAN_GROUPS.map((g) => {
        const list = loans.filter((l) => (g.statuses as readonly string[]).includes(l.status));
        if (!list.length) return null;
        return (
          <section key={g.key} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>{g.label}</T> <span className="text-gray-300">{list.length}</span></h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((l) => <LoanCard key={l.id} loan={l} actions={<LoanActions loan={l} onOpen={(kind) => setDialog({ kind, loan: l })} />} />)}
            </div>
          </section>
        );
      })}
      {dialog && <LoanDialog kind={dialog.kind} loan={dialog.loan} running={loans.filter((l) => l.status === "BERJALAN" && l.id !== dialog.loan.id)} onClose={() => setDialog(null)} />}
    </div>
  );
}
