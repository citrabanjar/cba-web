"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowUpRight, ChevronDown, Download, HandCoins, Loader2, Search, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoanCard, { type LoanView } from "@/components/portal/LoanCard";
import { DeleteLoanButton } from "@/components/portal/LoanManager";
import { useCanEdit } from "@/components/portal/edit-access";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { LOAN_GROUPS, LOAN_STATUS, addMonths, isPeriod, loanSummary, periodShort } from "@/lib/loans";
import { importOpeningLoans, type OpeningRow } from "./actions";

export type AdminLoan = LoanView & { userId: string; name: string; employeeId: string; department: string | null };
export type LoanEmployee = { employeeId: string; name: string };

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const HEAD = ["Employee ID", "Sisa Pinjaman", "Sisa Angsuran (kali)", "Angsuran per Bulan", "Mulai Dipotong (YYYY-MM)", "Pinjaman Semula", "Keterangan"];
// Kolom dibaca menurut nama header (file template lama tanpa "Angsuran per Bulan" tetap terbaca).
const COLS = { id: "employee id", remaining: "sisa pinjaman", tenor: "sisa angsuran", installment: "angsuran per bulan", start: "mulai dipotong", original: "pinjaman semula", note: "keterangan" } as const;
const OLD_POS: Record<keyof typeof COLS, number> = { id: 0, remaining: 1, tenor: 2, installment: -1, start: 3, original: 4, note: 5 };
// Baris contoh di template ditandai "CONTOH" di kolom Keterangan dan otomatis dilewati saat upload.
const EXAMPLE_NOTE = "CONTOH - hapus atau timpa baris ini";
const isExample = (note: unknown) => String(note ?? "").trim().toUpperCase().startsWith("CONTOH");

// Upload saldo awal pinjaman dari aplikasi lama (Super Admin): template → pratinjau → simpan.
function UploadDialog({ employees, onClose }: { employees: LoanEmployee[]; onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<(OpeningRow & { name?: string; problem?: string })[]>([]);
  const [examples, setExamples] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const known = new Map(employees.map((e) => [e.employeeId.toLowerCase(), e.name]));
  const bad = rows.filter((r) => r.problem).length;

  function template() {
    const sample = [HEAD, [employees[0]?.employeeId ?? "D001", 7350000, "", 1000000, addMonths(thisMonth(), 1), 12000000, EXAMPLE_NOTE]];
    const sheet = XLSX.utils.aoa_to_sheet(sample);
    sheet["!cols"] = HEAD.map(() => ({ wch: 24 }));
    // Catatan di sel A2 (muncul saat disorot) bahwa baris ini hanya contoh.
    const a2 = sheet["A2"];
    if (a2) {
      const c: XLSX.Comments = [{ a: "Petunjuk", t: "Baris ini CONTOH. Hapus atau timpa dengan data asli; baris berketerangan CONTOH tidak ikut diupload." }];
      c.hidden = true;
      a2.c = c;
    }
    const guide = XLSX.utils.aoa_to_sheet([
      ["Petunjuk"], ["Baris 2 di sheet Saldo Pinjaman adalah CONTOH (Keterangan diawali CONTOH). Hapus atau timpa dengan data asli; baris CONTOH otomatis dilewati saat upload."],
      ["Satu baris = satu pinjaman yang masih berjalan per tanggal migrasi. Satu karyawan boleh lebih dari satu baris."],
      ["Sisa Pinjaman = pokok yang belum dibayar. Sisa Angsuran = berapa kali lagi dipotong."],
      ["Angsuran per Bulan (opsional) = potongan tetap per bulan seperti di aplikasi lama. Kalau diisi, jumlah angsuran dihitung otomatis dan sisanya di angsuran terakhir (mis. sisa 7.350.000 dengan 1.000.000 = 1.000.000 x 7 + 350.000). Kalau kosong, Sisa Pinjaman dibagi rata ke Sisa Angsuran."],
      ["Mulai Dipotong = bulan potongan berikutnya, format YYYY-MM (mis. 2026-12)."], ["Pinjaman Semula dan Keterangan boleh dikosongkan."],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Saldo Pinjaman");
    XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
    XLSX.writeFile(wb, "template_saldo_awal_pinjaman.xlsx");
  }
  async function read(file: File) {
    setMsg(null);
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    // Excel sering mengubah "2026-12" menjadi tanggal; terima tanggal, YYYY-MM, atau MM/YYYY.
    const period = (v: unknown) => {
      if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
      const s = String(v ?? "").trim();
      let m = /^(\d{4})[-/.](\d{1,2})/.exec(s);
      if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
      m = /^(\d{1,2})[-/.](\d{4})$/.exec(s);
      return m ? `${m[2]}-${m[1].padStart(2, "0")}` : s;
    };
    const num = (v: unknown) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
    const head = (table[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
    const byName = Object.fromEntries((Object.keys(COLS) as (keyof typeof COLS)[]).map((k) => [k, head.findIndex((h) => h.startsWith(COLS[k]))])) as Record<keyof typeof COLS, number>;
    const at = byName.id >= 0 ? byName : OLD_POS;
    const cell = (r: unknown[], k: keyof typeof COLS) => (at[k] >= 0 ? r[at[k]] : "");
    const filled = table.slice(1).filter((r) => String(cell(r, "id") ?? "").trim());
    setExamples(filled.filter((r) => isExample(cell(r, "note"))).length);
    const parsed = filled.filter((r) => !isExample(cell(r, "note"))).map((r) => {
      const row: OpeningRow = {
        employeeId: String(cell(r, "id")).trim(), remaining: num(cell(r, "remaining")), tenor: num(cell(r, "tenor")),
        installment: num(cell(r, "installment")) || null, startPeriod: period(cell(r, "start")), original: num(cell(r, "original")) || null, note: String(cell(r, "note") ?? ""),
      };
      // Dengan Angsuran per Bulan, jumlah angsuran dihitung dari sisa pinjaman.
      if (row.installment) row.tenor = Math.ceil(row.remaining / row.installment - 1e-9);
      const name = known.get(row.employeeId.toLowerCase());
      const problem = !name ? "Employee ID tidak ditemukan" : row.remaining < 1000 ? "Sisa pinjaman kosong"
        : row.installment && row.installment < 1000 ? "Angsuran per bulan minimal 1.000"
        : row.tenor < 1 || row.tenor > 120 ? (row.installment ? "Angsuran per bulan terlalu kecil (lebih dari 120 kali)" : "Sisa angsuran 1-120")
        : !isPeriod(row.startPeriod) ? "Mulai dipotong harus YYYY-MM" : undefined;
      return { ...row, name, problem };
    });
    setRows(parsed);
  }
  function save() {
    start(async () => {
      const r = await importOpeningLoans(rows.map((x) => ({ employeeId: x.employeeId, remaining: x.remaining, tenor: x.tenor, installment: x.installment, startPeriod: x.startPeriod, original: x.original, note: x.note })));
      if (r.error) setMsg({ ok: false, text: r.error, list: r.errors });
      else { setMsg({ ok: true, text: `${r.count} ${t("pinjaman saldo awal tersimpan.")}` }); setRows([]); }
    });
  }
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle><T>Upload Saldo Awal Pinjaman</T></DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500"><T>Pinjaman yang masih berjalan di aplikasi lama per tanggal migrasi. Setelah disimpan langsung berstatus Berjalan dan muncul di tab Pinjaman profil karyawan.</T></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={template}><Download size={14} /> <T>Download Template</T></Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-gray-50">
            <Upload size={14} /> <T>Pilih File Excel</T>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
          </label>
        </div>
        {examples > 0 && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">{examples} <T>baris contoh (Keterangan CONTOH) dilewati.</T></p>}
        {rows.length > 0 && (
          <div className="max-h-80 overflow-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-left text-[10px] uppercase text-gray-400">
                <tr><th className="px-3 py-2">ID</th><th className="px-3 py-2"><T>Nama</T></th><th className="px-3 py-2 text-right"><T>Sisa</T></th><th className="px-3 py-2 text-right"><T>Kali</T></th><th className="px-3 py-2"><T>Mulai</T></th><th className="px-3 py-2"><T>Cek</T></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={i} className={r.problem ? "bg-rose-50/60" : ""}>
                    <td className="px-3 py-1.5">{r.employeeId}</td><td className="px-3 py-1.5">{r.name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(r.remaining)}</td><td className="px-3 py-1.5 text-right">{r.installment ? <>{formatRupiah(r.installment)} x {r.tenor}{r.remaining - r.installment * (r.tenor - 1) !== r.installment && <span className="block text-[10px] text-gray-400"><T>terakhir</T> {formatRupiah(r.remaining - r.installment * (r.tenor - 1))}</span>}</> : r.tenor}</td>
                    <td className="px-3 py-1.5">{r.startPeriod}</td>
                    <td className={`px-3 py-1.5 ${r.problem ? "text-rose-700" : "text-emerald-700"}`}>{r.problem ? t(r.problem) : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            <T>{msg.text}</T>{msg.list && <ul className="mt-1 list-disc pl-5 text-xs">{msg.list.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Tutup</T></Button>
          <Button disabled={pending || !rows.length || bad > 0} className="gap-1.5" onClick={save}>
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T> {rows.length ? `(${rows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Daftar semua pinjaman semua karyawan. Proses, pencairan, dan perubahan angsuran dilakukan di tab Pinjaman profil karyawan.
export default function PinjamanAdminClient({ loans, employees, isSuper }: { loans: AdminLoan[]; employees: LoanEmployee[]; isSuper: boolean }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: Upload & Hapus disembunyikan
  const [tab, setTab] = useState<string>(() => (loans.some((l) => ["PENDING", "DISETUJUI"].includes(l.status)) ? "menunggu" : "berjalan"));
  const [q, setQ] = useState("");
  const [upload, setUpload] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const inGroup = (key: string) => loans.filter((l) => (LOAN_GROUPS.find((g) => g.key === key)!.statuses as readonly string[]).includes(l.status));
  const list = inGroup(tab).filter((l) => !q || `${l.name} ${l.employeeId}`.toLowerCase().includes(q.toLowerCase()));
  const running = inGroup("berjalan");
  const outstanding = running.reduce((a, l) => a + loanSummary(l.principal, l.installments).remaining, 0);
  const stats = [
    { label: "Pengajuan menunggu", value: String(loans.filter((l) => l.status === "PENDING").length), icon: HandCoins, tone: "from-amber-500 to-orange-400" },
    { label: "Menunggu pencairan", value: String(loans.filter((l) => l.status === "DISETUJUI").length), icon: HandCoins, tone: "from-violet-500 to-fuchsia-400" },
    { label: "Pinjaman berjalan", value: String(running.length), icon: Wallet, tone: "from-sky-500 to-indigo-400" },
    { label: "Total sisa pinjaman", value: formatRupiah(outstanding), icon: Wallet, tone: "from-brand to-rose-400" },
  ];
  return (
    <main className="max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-gray-500"><T>{s.label}</T></p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}><s.icon size={15} /></span></div>
            <p className="mt-2 text-xl font-bold tracking-tight text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2">
        {LOAN_GROUPS.map((g) => (
          <button key={g.key} type="button" onClick={() => setTab(g.key)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm ${tab === g.key ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <T>{g.label}</T> <span className="text-xs opacity-70">{inGroup(g.key).length}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama / ID")} className="h-9 w-48 pl-8" />
        </div>
        {isSuper && canEdit && (
          <button type="button" onClick={() => setUpload(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <Upload size={14} /> <T>Upload Saldo Awal</T>
          </button>
        )}
      </div>
      {/* Daftar ringkas; klik satu baris untuk membuka rinciannya (hanya satu yang terbuka). */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {list.length === 0 && <p className="p-8 text-center text-sm text-gray-500"><T>Tidak ada data.</T></p>}
        {list.length > 0 && (
          <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1.2fr_1.3fr_100px_20px] gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:grid">
            <span><T>Karyawan</T></span><span className="text-right"><T>Jumlah</T></span><span className="text-right"><T>Sisa</T></span>
            <span><T>Angsuran berikutnya</T></span><span><T>Status</T></span><span />
          </div>
        )}
        {list.map((l) => {
          const s = loanSummary(l.principal, l.installments);
          const st = LOAN_STATUS[l.status] ?? { label: l.status, tone: "bg-gray-100 text-gray-600" };
          const pct = l.principal ? Math.min(100, Math.round((s.paid / l.principal) * 100)) : 0;
          const isOpen = openId === l.id;
          return (
            <div key={l.id} className="border-b border-gray-100 last:border-b-0">
              <button type="button" onClick={() => setOpenId(isOpen ? null : l.id)} aria-expanded={isOpen}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-gray-50 md:grid-cols-[minmax(0,2.2fr)_1fr_1.2fr_1.3fr_100px_20px] ${isOpen ? "bg-gray-50" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-gray-900">{l.name}</span>
                  <span className="block truncate text-xs text-gray-400">
                    {[l.employeeId, l.department].filter(Boolean).join(" · ")}
                    {l.seqNo > 0 && <> · <T>Pinjaman ke-</T>{l.seqNo}</>}
                    {l.isOpening && <> · <span className="text-violet-600"><T>Saldo awal migrasi</T></span></>}
                  </span>
                </span>
                <span className="hidden text-right tabular-nums text-gray-700 md:block">{formatRupiah(l.principal)}</span>
                <span className="text-right md:block">
                  <span className="block font-semibold tabular-nums text-gray-900">{formatRupiah(s.remaining)}</span>
                  <span className="mt-1 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-gray-100"><span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="hidden text-xs text-gray-600 md:block">{s.next ? <>{periodShort(s.next.period)} · {formatRupiah(s.next.amount)}</> : "—"}</span>
                <span className="hidden md:block"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tone}`}><T>{st.label}</T></span></span>
                <ChevronDown size={16} className={`hidden text-gray-400 transition-transform md:block ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="bg-gray-50 px-3 pb-3">
                  <LoanCard loan={l}
                    actions={<div className="flex flex-col items-end gap-1.5">
                      <Link href={`/portal/admin/karyawan/${l.userId}?tab=pinjaman`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        <T>{["PENDING", "DISETUJUI", "BERJALAN"].includes(l.status) ? "Kelola di profil" : "Lihat profil"}</T> <ArrowUpRight size={13} />
                      </Link>
                      {canEdit && (!l.isOpening || isSuper) && <DeleteLoanButton loan={l} />}
                    </div>} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {upload && <UploadDialog employees={employees} onClose={() => setUpload(false)} />}
    </main>
  );
}
