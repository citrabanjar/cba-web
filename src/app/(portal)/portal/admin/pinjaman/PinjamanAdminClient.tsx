"use client";

import { useState, useTransition } from "react";
import { HandCoins, Loader2, Plus, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import LoanCard, { type LoanView } from "@/components/portal/LoanCard";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { addMonths, buildSchedule, loanSummary, periodShort } from "@/lib/loans";
import { approveLoan, cancelLoan, createLoan, rejectLoan, saveSchedule } from "./actions";

export type AdminLoan = LoanView & { userId: string; name: string; employeeId: string; department: string | null };
export type LoanEmployee = { id: string; name: string; employeeId: string };

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

function useAct() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>, done: () => void) => {
    setError(null);
    start(async () => { const r = await fn(); if (r.error) setError(r.error); else done(); });
  };
  return { error, pending, act };
}

// Setujui pengajuan: jumlah, tenor, dan periode mulai bisa disesuaikan sebelum tabel angsuran dibuat.
function ApproveDialog({ loan, onClose }: { loan: AdminLoan; onClose: () => void }) {
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
        <DialogHeader><DialogTitle><T>Proses Pengajuan</T> · {loan.name}</DialogTitle></DialogHeader>
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
        <div className="space-y-1.5"><Label className="text-xs"><T>Catatan</T></Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={pending} className="text-rose-600"
            onClick={() => { if (window.confirm(t("Tolak pengajuan ini?"))) act(() => rejectLoan(loan.id, note), onClose); }}><T>Tolak</T></Button>
          <Button disabled={pending} className="gap-1.5" onClick={() => act(() => approveLoan(loan.id, { principal: Number(principal), tenor: Number(tenor), startPeriod: start, note }), onClose)}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Setujui & Buat Angsuran</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tambah pinjaman langsung oleh admin, termasuk saldo awal migrasi.
function CreateDialog({ employees, onClose }: { employees: LoanEmployee[]; onClose: () => void }) {
  const t = useT();
  const [emp, setEmp] = useState("");
  const [principal, setPrincipal] = useState("");
  const [tenor, setTenor] = useState("6");
  const [start, setStart] = useState(() => addMonths(thisMonth(), 1));
  const [purpose, setPurpose] = useState("");
  const [opening, setOpening] = useState(false);
  const [original, setOriginal] = useState("");
  const { error, pending, act } = useAct();
  const user = employees.find((e) => e.employeeId.toLowerCase() === emp.trim().toLowerCase());
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle><T>Tambah Pinjaman</T></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs"><T>Karyawan</T></Label>
            <EmployeeCombobox id="loan-emp" value={emp} onChange={setEmp} options={employees.map((e) => ({ value: e.employeeId, label: e.name }))} />
            {user && <p className="text-xs text-gray-500">{user.name}</p>}</div>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 px-3 py-2">
            <input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
            <span><span className="block text-sm font-medium text-gray-800"><T>Saldo awal migrasi</T></span>
              <span className="block text-[11px] text-gray-400"><T>Pinjaman dari aplikasi lama: isi sisa pinjaman dan sisa kali angsuran per tanggal migrasi.</T></span></span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label className="text-xs">{t(opening ? "Sisa pinjaman (Rp)" : "Jumlah (Rp)")}</Label><Input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">{t(opening ? "Sisa angsuran (kali)" : "Angsuran (kali)")}</Label><Input type="number" value={tenor} onChange={(e) => setTenor(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Mulai dipotong</T></Label><Input type="month" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          </div>
          {opening && <div className="space-y-1.5 sm:w-1/2"><Label className="text-xs"><T>Pinjaman semula (Rp)</T></Label><Input type="number" value={original} onChange={(e) => setOriginal(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label className="text-xs"><T>Keperluan</T></Label><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button disabled={pending || !user} className="gap-1.5"
            onClick={() => act(() => createLoan({ userId: user!.id, principal: Number(principal), tenor: Number(tenor), startPeriod: start, purpose, isOpening: opening, originalAmount: Number(original) || null }), onClose)}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ubah tabel angsuran: angsuran yang sudah terpotong terkunci; sisanya bebas diatur selama totalnya = sisa pinjaman.
function ScheduleDialog({ loan, onClose }: { loan: AdminLoan; onClose: () => void }) {
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
        <DialogHeader><DialogTitle><T>Tabel Angsuran</T> · {loan.name}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500">
          <T>Pinjaman</T> {formatRupiah(loan.principal)} · <T>sudah terpotong</T> {formatRupiah(loan.principal - remaining)} · <T>sisa</T> <b className="text-gray-900">{formatRupiah(remaining)}</b>
        </p>
        <div className="space-y-1.5">
          {paid.map((p) => (
            <div key={p.id} className="grid grid-cols-[32px_1fr_1fr_28px] items-center gap-2 text-sm text-gray-400">
              <span>{p.seq}</span><span>{periodShort(p.period)}</span><span className="text-right tabular-nums">{formatRupiah(p.amount)}</span>
              <span className="text-[10px] font-semibold text-emerald-600">✓</span>
            </div>
          ))}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[32px_1fr_1fr_28px] items-center gap-2">
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
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button disabled={pending || diff !== 0} className="gap-1.5" onClick={() => act(() => saveSchedule(loan.id, rows.map((r) => ({ period: r.period, amount: Number(r.amount) }))), onClose)}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Tabel</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PinjamanAdminClient({ loans, employees }: { loans: AdminLoan[]; employees: LoanEmployee[] }) {
  const t = useT();
  const [tab, setTab] = useState<"pengajuan" | "berjalan" | "selesai">(() => (loans.some((l) => l.status === "PENDING") ? "pengajuan" : "berjalan"));
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ kind: "approve" | "schedule"; loan: AdminLoan } | { kind: "create" } | null>(null);
  const [pending, start] = useTransition();
  const groups = {
    pengajuan: loans.filter((l) => l.status === "PENDING"),
    berjalan: loans.filter((l) => l.status === "BERJALAN"),
    selesai: loans.filter((l) => ["LUNAS", "DITOLAK", "BATAL"].includes(l.status)),
  };
  const list = groups[tab].filter((l) => !q || `${l.name} ${l.employeeId}`.toLowerCase().includes(q.toLowerCase()));
  const outstanding = groups.berjalan.reduce((a, l) => a + loanSummary(l.principal, l.installments).remaining, 0);
  const stats = [
    { label: "Pengajuan menunggu", value: String(groups.pengajuan.length), icon: HandCoins, tone: "from-amber-500 to-orange-400" },
    { label: "Pinjaman berjalan", value: String(groups.berjalan.length), icon: Wallet, tone: "from-sky-500 to-indigo-400" },
    { label: "Total sisa pinjaman", value: formatRupiah(outstanding), icon: Wallet, tone: "from-brand to-rose-400" },
  ];
  return (
    <main className="max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-gray-500"><T>{s.label}</T></p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}><s.icon size={15} /></span></div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2">
        {([["pengajuan", "Pengajuan"], ["berjalan", "Berjalan"], ["selesai", "Selesai"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <T>{l}</T> <span className="text-xs opacity-70">{groups[k].length}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama / ID")} className="h-9 w-48 pl-8" />
        </div>
        <button type="button" onClick={() => setDialog({ kind: "create" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
          <Plus size={14} /> <T>Tambah Pinjaman</T>
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-center text-sm text-gray-500 lg:col-span-2"><T>Tidak ada data.</T></p>}
        {list.map((l) => (
          <LoanCard key={l.id} loan={l}
            header={<p className="mb-1 text-sm font-semibold text-gray-900">{l.name} <span className="text-xs font-normal text-gray-400">{[l.employeeId, l.department].filter(Boolean).join(" · ")}</span></p>}
            actions={
              <div className="flex flex-col gap-1.5">
                {l.status === "PENDING" && <Button size="sm" onClick={() => setDialog({ kind: "approve", loan: l })}><T>Proses</T></Button>}
                {l.status === "BERJALAN" && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "schedule", loan: l })}><T>Ubah Angsuran</T></Button>}
                {l.status === "BERJALAN" && !l.installments.some((i) => i.status === "LUNAS") && (
                  <Button size="sm" variant="outline" disabled={pending} className="text-rose-600"
                    onClick={() => { if (window.confirm(t("Batalkan pinjaman ini?"))) start(async () => { const r = await cancelLoan(l.id); if (r.error) window.alert(t(r.error)); }); }}>
                    <T>Batalkan</T>
                  </Button>
                )}
              </div>
            } />
        ))}
      </div>
      {dialog?.kind === "approve" && <ApproveDialog loan={dialog.loan} onClose={() => setDialog(null)} />}
      {dialog?.kind === "schedule" && <ScheduleDialog loan={dialog.loan} onClose={() => setDialog(null)} />}
      {dialog?.kind === "create" && <CreateDialog employees={employees} onClose={() => setDialog(null)} />}
    </main>
  );
}
