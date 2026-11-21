"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { importPriorTaxSlips, type PriorTaxImportRow } from "./prior-tax-import-actions";

// Kolom template, urutan sama dengan isian manual di profil karyawan -> Payroll -> PPh 21 Pindahan.
const HEADERS = ["ID Karyawan", "Nama Karyawan", "Tahun Pajak", "Nomor BPA1", "Pemberi Kerja Sebelumnya", "Penghasilan Neto", "PPh 21 Dipotong"];
const num = (v: unknown) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

// Dialog Import PPh 21 Pindahan (Pengaturan -> Import Data).
export default function PriorTaxImport({ onClose }: { onClose: (changed: boolean) => void }) {
  const t = useT();
  const [rows, setRows] = useState<PriorTaxImportRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, start] = useTransition();

  function template() {
    const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ["K001", "CONTOH NAMA", year, "1234567890", "PT CONTOH SEBELUMNYA", 45000000, 1250000]]);
    ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 32 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "PPh 21 Pindahan");
    const guide = XLSX.utils.aoa_to_sheet([
      ["Petunjuk"],
      ["Isi satu baris per karyawan pindahan (pindah dari pemberi kerja lain di tahun pajak yang sama). Hapus baris contoh."],
      ["ID Karyawan wajib sama dengan Employee ID di portal. Nama Karyawan hanya untuk memudahkan, tidak dibaca."],
      ["Tahun Pajak, Nomor BPA1, dan Penghasilan Neto wajib. PPh 21 Dipotong isi 0 bila tidak ada."],
      ["Angka ditulis tanpa Rp dan tanpa titik, contoh 45000000."],
      ["Data dengan ID Karyawan, Tahun Pajak, dan Nomor BPA1 yang sama diperbarui; selain itu ditambahkan."],
      ["Data dipakai saat hitung ulang PPh 21 Desember / bulan keluar dan 1721-A1."],
    ]);
    guide["!cols"] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
    XLSX.writeFile(wb, "template_pph21_pindahan.xlsx");
  }

  async function read(file: File) {
    setMsg(null);
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const name = wb.SheetNames.find((n) => n.trim().toLowerCase() === "pph 21 pindahan") ?? wb.SheetNames[0];
    const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" });
    const head = (table[0] ?? []).map((h) => String(h).trim().toLowerCase());
    const col = (label: string) => head.indexOf(label.toLowerCase());
    const missing = HEADERS.filter((h) => h !== "Nama Karyawan" && col(h) < 0);
    if (missing.length) { setRows(null); setMsg({ ok: false, text: `${t("Kolom tidak ditemukan")}: ${missing.join(", ")}` }); return; }
    const out: PriorTaxImportRow[] = [];
    table.slice(1).forEach((r, i) => {
      const id = String(r[col("ID Karyawan")] ?? "").trim();
      if (!id) return;
      out.push({
        line: i + 2, employeeId: id, year: num(r[col("Tahun Pajak")]), slipNumber: String(r[col("Nomor BPA1")] ?? "").trim(),
        employerName: String(r[col("Pemberi Kerja Sebelumnya")] ?? "").trim(), net: num(r[col("Penghasilan Neto")]), pph21: num(r[col("PPh 21 Dipotong")]),
      });
    });
    if (!out.length) setMsg({ ok: false, text: "File tidak berisi data." });
    setRows(out.length ? out : null);
  }

  function save() {
    if (!rows) return;
    start(async () => {
      try {
        const r = await importPriorTaxSlips(rows);
        setChanged(changed || r.created + r.updated > 0);
        setMsg({ ok: r.errors.length === 0, text: `${t("Ditambahkan")} ${r.created}, ${t("diperbarui")} ${r.updated}${r.errors.length ? `, ${t("gagal")} ${r.errors.length}` : ""}.`, errors: r.errors });
        setRows(null);
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Import gagal." });
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(changed); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle><T>Upload PPh 21 Pindahan</T></DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500"><T>Data BPA1 pemberi kerja sebelumnya untuk karyawan pindahan. Isinya sama dengan isian PPh 21 Pindahan di profil karyawan.</T></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={template}><Download size={14} /> <T>Download Template</T></Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-gray-50">
            <Upload size={14} /> <T>Pilih File Excel</T>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
          </label>
        </div>
        {rows && (
          <div className="max-h-72 overflow-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>{["ID Karyawan", "Tahun Pajak", "Nomor BPA1", "Pemberi Kerja Sebelumnya", "Penghasilan Neto", "PPh 21 Dipotong"].map((h) => <th key={h} className="px-3 py-1.5 text-left font-medium"><T>{h}</T></th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-1.5">{r.employeeId}</td>
                    <td className="px-3 py-1.5">{r.year || "—"}</td>
                    <td className="px-3 py-1.5">{r.slipNumber || "—"}</td>
                    <td className="px-3 py-1.5">{r.employerName || "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums">{rp(r.net)}</td>
                    <td className="px-3 py-1.5 tabular-nums">{rp(r.pph21)}</td>
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
          <Button disabled={pending || !rows} className="gap-1.5" onClick={save}>{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
