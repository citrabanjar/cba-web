"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoanCard, { type LoanView } from "@/components/portal/LoanCard";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { LOAN_GROUPS, addMonths, buildSchedule, loanSummary, periodShort } from "@/lib/loans";
import { approveLoan, cancelLoan, markDisbursed, rejectLoan, saveSchedule } from "@/app/(portal)/portal/admin/pinjaman/actions";

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function useAct() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>, done: () => void) => {
    setError(null);
    start(async () => { const r = await fn(); if (r.error) setError(r.error); else done(); });
  };
  return { error, pending, act };
}
const ErrorBox = ({ error }: { error: string | null }) => (error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p> : null);

// Proses pengajuan: jumlah, tenor, dan periode mulai bisa disesuaikan sebelum disetujui.
function ApproveDialog({ loan, onClose }: { loan: LoanView; onClose: () => void }) {
  const t = useT();
  const [principal, setPrincipal] = useState(String(loan.principal));
  const [tenor, setTenor] = useState(String(loan.tenor));
  const [start, setStart] = useState(loan.startPeriod);
  const [note, setNote] = useState("");
  const { error, pending, act } = useAct();
  const preview = Number(principal) > 0 && Number(tenor) > 0 ? buildSchedule(Number(principal), Number(tenor), start) : [];
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle><T>Proses Pengajuan</T> · <T>Pinjaman ke-</T>{loan.seqNo}</DialogTitle></DialogHeader>
        {loan.purpose && <p className="-mt-2 text-sm text-gray-600">{loan.purpose}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs"><T>Jumlah (Rp)</T></Label><Input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Angsuran (kali)</T></Label><Input type="number" value={tenor} onChange={(e) => setTenor(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Mulai dipotong</T></Label><Input type="month" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        </div>
        {preview.length > 0 && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {formatRupiah(preview[0].amount)} x {preview.length} · {periodShort(preview[0].period)} – {periodShort(preview[preview.length - 1].period)}
            {preview[preview.length - 1].amount !== preview[0].amount && <> · <T>terakhir</T> {formatRupiah(preview[preview.length - 1].amount)}</>}
          </p>
        )}
        <p className="text-[11px] text-gray-400"><T>Setelah disetujui, tandai Dicairkan saat uang sudah diberikan; angsuran baru dipotong setelah dicairkan.</T></p>
        <div className="space-y-1.5"><Label className="text-xs"><T>Catatan</T></Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <ErrorBox error={error} />
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={pending} className="text-rose-600"
            onClick={() => { if (window.confirm(t("Tolak pengajuan ini?"))) act(() => rejectLoan(loan.id, note), onClose); }}><T>Tolak</T></Button>
          <Button disabled={pending} className="gap-1.5" onClick={() => act(() => approveLoan(loan.id, { principal: Number(principal), tenor: Number(tenor), startPeriod: start, note }), onClose)}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Setujui</T>
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
  const spread = () => {
    if (!rows.length) return;
    const fresh = buildSchedule(remaining, rows.length, rows[0].period);
    setRows(rows.map((r, i) => ({ period: r.period, amount: String(fresh[i].amount) })));
  };
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle><T>Ubah Sisa Angsuran</T> · <T>Pinjaman ke-</T>{loan.seqNo}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500">
          <T>Pinjaman</T> {formatRupiah(loan.principal)} · <T>sudah terpotong</T> {formatRupiah(loan.principal - remaining)} · <T>sisa</T> <b className="text-gray-900">{formatRupiah(remaining)}</b>
        </p>
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
              <Input type="number" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} className="h-8 text-right" />
              <button type="button" aria-label={t("Hapus baris")} className="rounded p-1 text-gray-400 hover:text-rose-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            onClick={() => setRows((x) => [...x, { period: x.length ? addMonths(x[x.length - 1].period, 1) : addMonths(thisMonth(), 1), amount: String(Math.max(0, diff)) }])}>
            <Plus size={12} /> <T>Tambah angsuran</T>
          </button>
          <button type="button" className="font-medium text-brand hover:underline" onClick={spread}><T>Ratakan sisa ke semua angsuran</T></button>
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
  return (
    <div className="flex flex-col gap-1.5">
      {loan.status === "PENDING" && <Button size="sm" onClick={() => onOpen("approve")}><T>Proses</T></Button>}
      {loan.status === "DISETUJUI" && <Button size="sm" onClick={() => onOpen("disburse")}><T>Tandai Dicairkan</T></Button>}
      {["DISETUJUI", "BERJALAN"].includes(loan.status) && <Button size="sm" variant="outline" onClick={() => onOpen("schedule")}><T>Ubah Sisa Angsuran</T></Button>}
      {canCancel && (
        <Button size="sm" variant="outline" disabled={pending} className="text-rose-600"
          onClick={() => { if (window.confirm(t("Batalkan pinjaman ini?"))) start(async () => { const r = await cancelLoan(loan.id); if (r.error) window.alert(t(r.error)); }); }}>
          <T>Batalkan</T>
        </Button>
      )}
    </div>
  );
}

export function LoanDialog({ kind, loan, onClose }: { kind: "approve" | "disburse" | "schedule"; loan: LoanView; onClose: () => void }) {
  if (kind === "approve") return <ApproveDialog loan={loan} onClose={onClose} />;
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
      {dialog && <LoanDialog kind={dialog.kind} loan={dialog.loan} onClose={() => setDialog(null)} />}
    </div>
  );
}
