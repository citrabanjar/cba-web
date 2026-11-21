"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { toDate, type PayColumn } from "@/lib/employee-import";
import { importSalaryRaises, salaryTemplate, type SalaryImportRow } from "./salary-import-actions";

// Kolom template. "Gaji Pokok Lama" hanya informasi (bisa dipakai rumus Excel), tidak dibaca saat import.
const BEFORE = ["ID Karyawan", "Nama Karyawan", "Departemen", "Tanggal Berlaku", "Gaji Pokok Lama", "Gaji Pokok", "Gaji Harian", "Pengali Bulanan"];
const AFTER = ["Catatan"];
const SHEET = "Kenaikan Gaji";
const num = (v: unknown) => { const s = String(v ?? "").trim(); if (!s) return null; const n = Number(typeof v === "number" ? v : s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const key = (s: unknown) => String(s ?? "").trim().toLowerCase();

// Tanggal 1 bulan depan (WIB), DD-MM-YYYY: tanggal berlaku bawaan di template.
function nextMonth() {
  const d = new Date(Date.now() + 7 * 3600_000);
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `01-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${n.getUTCFullYear()}`;
}

// Dialog Import Kenaikan Gaji Massal (Pengaturan -> Import Data).
export default function SalaryRaiseImport({ onClose }: { onClose: (changed: boolean) => void }) {
  const t = useT();
  const [rows, setRows] = useState<SalaryImportRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, start] = useTransition();
  const [pay, setPay] = useState<PayColumn[]>([]);

  function template() {
    setMsg(null);
    start(async () => {
      try {
        const data = await salaryTemplate();
        setPay(data.pay);
        const date = nextMonth();
        const head = [...BEFORE, ...data.pay.map((p) => p.name), ...AFTER];
        const body = data.rows.map((r) => [
          r.employeeId, r.name, r.department, date, r.basic || "", r.harian ? "" : r.basic || "", r.harian ? r.daily ?? "" : "", r.harian ? r.factor ?? 25 : "",
          ...data.pay.map((p) => r.pay[p.code] || ""), "",
        ]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
        ws["!cols"] = head.map((h, i) => ({ wch: i === 1 ? 28 : i === 2 ? 18 : Math.max(14, h.length + 2) }));
        // Tanggal Berlaku sebagai teks supaya Excel tidak mengubah formatnya.
        for (let r = 1; r <= body.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 3 })]; if (c) { c.t = "s"; c.z = "@"; } }
        XLSX.utils.book_append_sheet(wb, ws, SHEET);
        const guide = XLSX.utils.aoa_to_sheet([
          ["Petunjuk"],
          ["Template sudah berisi gaji yang berlaku saat ini untuk semua karyawan aktif. Ubah angka karyawan yang naik gaji saja."],
          ["Baris yang angkanya tidak diubah dilewati (tidak membuat riwayat gaji baru). Baris karyawan yang tidak naik boleh dihapus."],
          ["Tanggal Berlaku: DD-MM-YYYY, contoh 01-01-2027. Sudah diisi tanggal 1 bulan depan; ubah bila perlu."],
          ["Gaji Pokok Lama hanya informasi dan tidak dibaca. Bisa dipakai rumus, misalnya naik 5%: =E2*1,05 di kolom Gaji Pokok."],
          ["Karyawan jadwal bayar Mingguan: isi Gaji Harian dan Pengali Bulanan; kolom Gaji Pokok diabaikan (gaji bulanan = harian x pengali)."],
          ["Kolom komponen (tunjangan / potongan) berisi nominal per bulan. Kosongkan atau 0 bila karyawan tidak lagi mendapat komponen itu."],
          ["Kolom komponen yang dihapus dari file tidak mengubah komponen itu. Komponen lain di gaji karyawan ikut terbawa apa adanya."],
          ["Angka ditulis tanpa Rp dan tanpa titik, contoh 5500000."],
          ["Setiap baris disimpan sebagai Penyesuaian Gaji di profil karyawan (riwayat gaji baru). Admin dengan approval: tiap karyawan diajukan ke atasan."],
        ]);
        guide["!cols"] = [{ wch: 120 }];
        XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
        XLSX.writeFile(wb, "template_kenaikan_gaji.xlsx");
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Template gagal dibuat." });
      }
    });
  }

  async function read(file: File) {
    setMsg(null);
    // raw: teks tanggal (DD-MM-YYYY) tidak ditebak sebagai format bulan-hari Amerika.
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true });
    const name = wb.SheetNames.find((n) => key(n) === key(SHEET)) ?? wb.SheetNames[0];
    const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true });
    const head = (table[0] ?? []).map(key);
    const col = (label: string) => head.indexOf(key(label));
    const missing = ["ID Karyawan", "Tanggal Berlaku", "Gaji Pokok"].filter((h) => col(h) < 0);
    if (missing.length) { setRows(null); setMsg({ ok: false, text: `${t("Kolom tidak ditemukan")}: ${missing.join(", ")}` }); return; }
    // Kolom komponen: nama komponen, "Nama (KODE)", atau kodenya.
    const cols = pay.length ? pay : (await salaryTemplate()).pay;
    if (!pay.length) setPay(cols);
    const payAt = cols.flatMap((p) => {
      const at = head.findIndex((h) => [key(p.name), key(`${p.name} (${p.code})`), key(p.code)].includes(h));
      return at >= 0 ? [{ at, code: p.code }] : [];
    });
    const out: SalaryImportRow[] = [];
    table.slice(1).forEach((r, i) => {
      const id = String(r[col("ID Karyawan")] ?? "").trim();
      if (!id) return;
      const raw = r[col("Tanggal Berlaku")];
      out.push({
        line: i + 2, employeeId: id, effectiveDate: toDate(raw) ?? "",
        basic: num(r[col("Gaji Pokok")]) ?? 0,
        daily: col("Gaji Harian") >= 0 ? num(r[col("Gaji Harian")]) ?? 0 : 0,
        factor: col("Pengali Bulanan") >= 0 ? num(r[col("Pengali Bulanan")]) ?? 0 : 0,
        pay: Object.fromEntries(payAt.map((x) => [x.code, num(r[x.at])])),
        note: col("Catatan") >= 0 ? String(r[col("Catatan")] ?? "").trim() : "",
      });
    });
    if (!out.length) setMsg({ ok: false, text: "File tidak berisi data." });
    setRows(out.length ? out : null);
  }

  function save() {
    if (!rows) return;
    start(async () => {
      try {
        const r = await importSalaryRaises(rows);
        setChanged(changed || r.saved + r.proposed > 0);
        const parts = [`${t("Disimpan")} ${r.saved}`];
        if (r.proposed) parts.push(`${t("diajukan untuk approval")} ${r.proposed}`);
        parts.push(`${t("tidak berubah")} ${r.skipped}`);
        if (r.errors.length) parts.push(`${t("gagal")} ${r.errors.length}`);
        setMsg({ ok: r.errors.length === 0, text: `${parts.join(", ")}.`, errors: r.errors });
        setRows(null);
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Import gagal." });
      }
    });
  }

  const shown = pay.filter((p) => rows?.some((r) => p.code in r.pay));
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(changed); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle><T>Upload Kenaikan Gaji Massal</T></DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500"><T>Template berisi gaji yang berlaku saat ini. Ubah angka karyawan yang naik gaji; baris yang tidak diubah dilewati. Setiap perubahan dicatat sebagai riwayat gaji baru.</T></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={template}>
            {pending && !rows ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} <T>Download Template</T>
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-gray-50">
            <Upload size={14} /> <T>Pilih File Excel</T>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
          </label>
        </div>
        {rows && (
          <div className="max-h-72 overflow-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  {["ID Karyawan", "Tanggal Berlaku", "Gaji Pokok", "Gaji Harian"].map((h) => <th key={h} className="px-3 py-1.5 text-left font-medium"><T>{h}</T></th>)}
                  {shown.map((p) => <th key={p.code} className="px-3 py-1.5 text-left font-medium">{p.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-1.5">{r.employeeId}</td>
                    <td className="px-3 py-1.5">{r.effectiveDate ? r.effectiveDate.split("-").reverse().join("-") : "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums">{r.basic ? rp(r.basic) : "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums">{r.daily ? `${rp(r.daily)} × ${r.factor || "—"}` : "—"}</td>
                    {shown.map((p) => <td key={p.code} className="px-3 py-1.5 tabular-nums">{r.pay[p.code] ? rp(r.pay[p.code]!) : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            <p><T>{msg.text}</T></p>
            {!!msg.errors?.length && <ul className="mt-1 list-disc pl-5 text-xs">{msg.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(changed)}><T>Tutup</T></Button>
          <Button disabled={pending || !rows} className="gap-1.5" onClick={save}>{pending && rows && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
