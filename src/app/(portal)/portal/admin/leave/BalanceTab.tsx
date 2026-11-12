"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { AlertCircle, CheckCircle2, Download, Loader2, Search, SlidersHorizontal, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import type { BalanceRow, LeaveBalanceSwitch } from "@/lib/leave-balance";
import { useCanEdit } from "@/components/portal/edit-access";
import { adjustLeaveBalance, importLeaveBalances, setLeaveBalanceActive, type BalanceImportRow } from "./actions";

const HEADERS = ["Employee ID", "Nama", "Kode Cuti", "Saldo (hari)", "Per Tanggal (YYYY-MM-DD)", "Keterangan"];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

// Isian tanggal dari Excel bisa berupa angka seri, objek tanggal, atau teks.
function toDateKey(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : "";
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s.slice(0, 10);
}

function ImportDialog({ rows, onClose }: { rows: BalanceRow[]; onClose: () => void }) {
  const [parsed, setParsed] = useState<BalanceImportRow[] | null>(null);
  const [result, setResult] = useState<{ error?: string; saved?: number; errors?: string[] } | null>(null);
  const [pending, start] = useTransition();

  // Template sudah berisi karyawan aktif dan jenis cutinya (CT untuk tetap, CMK untuk kontrak).
  function downloadTemplate() {
    const today = todayKey();
    const data = [HEADERS, ...rows.map((r) => [r.employeeId, r.name, r.code, "", today, ""])];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 30 }];
    const guide = XLSX.utils.aoa_to_sheet([
      ["Petunjuk import saldo cuti"],
      ["1. Isi kolom Saldo (hari) dengan sisa cuti dari aplikasi lama. Boleh pecahan, mis. 2.5."],
      ["2. Per Tanggal = tanggal saldo itu dihitung di aplikasi lama. Penambahan dan pemakaian sesudah tanggal ini dihitung portal."],
      ["3. Kode Cuti: CT = Cuti Tahunan (karyawan tetap), CMK = Cuti Masa Kontrak (karyawan kontrak)."],
      ["4. Baris dengan Saldo kosong dilewati. Import ulang mengganti saldo awal sebelumnya."],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Saldo Cuti");
    XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
    XLSX.writeFile(wb, "template_saldo_cuti.xlsx");
  }

  async function choose(file: File | undefined) {
    setResult(null);
    if (!file) return;
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const out: BalanceImportRow[] = [];
    for (const [i, r] of table.slice(1).entries()) {
      const [employeeId, , code, days, date, note] = r as unknown[];
      if (String(days ?? "").trim() === "" || !String(employeeId ?? "").trim()) continue;
      out.push({
        employeeId: String(employeeId).trim(), code: String(code ?? "").trim(),
        days: Number(String(days).replace(",", ".")), date: toDateKey(date), note: String(note ?? ""), line: i + 2,
      });
    }
    setParsed(out);
  }

  function save() {
    if (!parsed) return;
    start(async () => setResult(await importLeaveBalances(parsed)));
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle><T>Import Saldo Cuti</T></DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1 rounded-lg bg-gray-100 p-3 text-xs text-gray-700">
            <p><T>• Untuk memindahkan sisa cuti dari aplikasi lama (KantorKu).</T></p>
            <p><T>• Template sudah berisi karyawan aktif dan kode cutinya; cukup isi Saldo dan Per Tanggal.</T></p>
            <p><T>• Penambahan dan pemakaian sesudah Per Tanggal dihitung otomatis oleh portal.</T></p>
          </div>
          <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2"><Download size={15} /> <T>Download Template Saldo (.xlsx)</T></Button>
          <div className="space-y-1.5">
            <Label className="text-xs"><T>File saldo cuti</T></Label>
            <input type="file" accept=".xlsx,.xls,.csv" disabled={pending} onChange={(e) => choose(e.target.files?.[0])}
              className="w-full cursor-pointer text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white" />
          </div>
          {parsed && !result && (
            <p className="text-sm text-gray-700"><b>{parsed.length}</b> <T>baris saldo siap diimport.</T></p>
          )}
          {result?.saved !== undefined && (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 size={15} /> {result.saved} <T>saldo tersimpan.</T>
            </p>
          )}
          {result?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{result.error}</T></p>}
          {!!result?.errors?.length && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {result.errors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}><T>Tutup</T></Button>
          <Button onClick={save} disabled={pending || !parsed?.length || !!result} className="gap-1.5">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} <T>Import</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ row, onClose }: { row: BalanceRow; onClose: () => void }) {
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save() {
    setError(null);
    start(async () => {
      const r = await adjustLeaveBalance(row.userId, row.policyId, Number(days.replace(",", ".")), note);
      if (r.error) setError(r.error);
      else onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle><T>Koreksi Saldo</T> · {row.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{row.code} · <T>Saldo sekarang</T> <b>{fmt(row.balance)}</b> <T>hari</T></p>
          <div className="space-y-1.5"><Label className="text-xs"><T>Tambah / kurangi (hari, pakai minus untuk mengurangi)</T></Label>
            <Input value={days} placeholder="2 / -1" onChange={(e) => setDays(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Alasan</T></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tab Saldo Cuti: saldo tiap karyawan aktif untuk Cuti Tahunan (tetap) atau Cuti Masa Kontrak (kontrak).
export default function BalanceTab({ rows, balanceSwitch, superAdmin }: { rows: BalanceRow[]; balanceSwitch: LeaveBalanceSwitch; superAdmin: boolean }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: Import & Koreksi Saldo disembunyikan
  const [switching, startSwitch] = useTransition();
  const toggle = (on: boolean) => {
    const ask = on
      ? "Aktifkan saldo cuti? Saldo di tabel ini akan tampil di profil karyawan dan halaman Cuti karyawan."
      : "Nonaktifkan saldo cuti? Saldo di profil dan halaman Cuti karyawan kembali menjadi 0.";
    if (!window.confirm(t(ask))) return;
    startSwitch(async () => { const r = await setLeaveBalanceActive(on); if (r.error) window.alert(t(r.error)); });
  };
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [adjusting, setAdjusting] = useState<BalanceRow | null>(null);
  const shown = rows.filter((r) => !q || `${r.name} ${r.employeeId} ${r.department ?? ""} ${r.code}`.toLowerCase().includes(q.toLowerCase()));
  const withoutOpening = rows.filter((r) => r.opening === null).length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white"><Wallet size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Saldo Cuti</T></h3>
          <p className="text-xs text-gray-400"><T>Cuti Tahunan untuk karyawan tetap, Cuti Masa Kontrak untuk karyawan kontrak. Karyawan resign tidak punya saldo.</T></p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau ID...")} className="h-9 w-56 rounded-full bg-gray-50 pl-9" />
        </div>
        {canEdit && (
          <button type="button" onClick={() => setImporting(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <Upload size={14} /> <T>Import Saldo</T>
          </button>
        )}
      </div>
      {superAdmin ? (
        <label className={`mx-5 mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${balanceSwitch.active ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
          <input type="checkbox" checked={balanceSwitch.active} disabled={switching} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
          <span className="text-sm">
            <b className="text-gray-900"><T>Saldo cuti aktif</T></b>
            {balanceSwitch.active && balanceSwitch.activatedAt && <span className="ml-2 text-xs text-emerald-700"><T>sejak</T> {new Date(balanceSwitch.activatedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}{balanceSwitch.by ? ` · ${balanceSwitch.by}` : ""}</span>}
            <span className="block text-xs text-gray-500"><T>{balanceSwitch.active
              ? "Saldo tampil di profil karyawan dan halaman Cuti karyawan."
              : "Belum aktif: saldo di profil karyawan dan halaman Cuti karyawan masih 0. Upload dan cek saldo awal dulu, lalu centang kotak ini."}</T></span>
          </span>
        </label>
      ) : !balanceSwitch.active && (
        <p className="mx-5 mt-4 flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
          <AlertCircle size={15} /> <T>Saldo cuti belum diaktifkan Super Admin; saldo ditampilkan 0.</T>
        </p>
      )}
      {superAdmin && withoutOpening > 0 && (
        <p className="mx-5 mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertCircle size={15} /> {withoutOpening} <T>karyawan belum punya saldo awal dari aplikasi lama; saldonya dihitung dari tanggal masuk.</T>
        </p>
      )}
      <div className="max-h-[calc(100vh-260px)] min-h-64 overflow-auto p-2">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white text-left text-[11px] uppercase tracking-wide text-gray-400">
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2 font-semibold"><T>Karyawan</T></th>
              <th className="px-3 py-2 font-semibold"><T>Jenis</T></th>
              <th className="px-3 py-2 text-right font-semibold"><T>Saldo awal</T></th>
              <th className="px-3 py-2 text-right font-semibold"><T>Bertambah</T></th>
              <th className="px-3 py-2 text-right font-semibold"><T>Terpakai</T></th>
              <th className="px-3 py-2 text-right font-semibold"><T>Saldo</T></th>
              <th className="px-3 py-2 font-semibold"><T>Bertambah berikutnya</T></th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {shown.map((r) => (
              <tr key={`${r.userId}-${r.policyId}`} className="hover:bg-gray-50/70">
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-[11px] text-gray-400">{[r.employeeId, r.department].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.code === "CMK" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>{r.code}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {r.opening === null ? <span className="text-gray-300">—</span> : <>{fmt(r.opening)}<span className="block text-[10px] text-gray-400">{formatDate(new Date(r.openingDate!))}</span></>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">+{fmt(r.earned)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-700">{r.used ? `-${fmt(r.used)}` : "0"}</td>
                <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-gray-900">
                  {fmt(r.balance)}
                  {(r.adjusted !== 0 || r.expired > 0) && (
                    <span className="block text-[10px] font-normal text-gray-400">
                      {r.adjusted !== 0 && <>{t("koreksi")} {r.adjusted > 0 ? "+" : ""}{fmt(r.adjusted)} </>}
                      {r.expired > 0 && <>{t("hangus")} {fmt(r.expired)}</>}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.problem ? <span className="text-red-600"><T>{r.problem}</T></span>
                    : r.nextDate ? <>+{fmt(r.nextDays ?? 0)} <T>hari</T> · {formatDate(new Date(r.nextDate))}</> : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {canEdit && (
                    <button type="button" onClick={() => setAdjusting(r)} aria-label={t("Koreksi Saldo")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                      <SlidersHorizontal size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400"><T>Tidak ada karyawan.</T></td></tr>}
          </tbody>
        </table>
      </div>
      {importing && <ImportDialog rows={rows} onClose={() => setImporting(false)} />}
      {adjusting && <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />}
    </section>
  );
}
