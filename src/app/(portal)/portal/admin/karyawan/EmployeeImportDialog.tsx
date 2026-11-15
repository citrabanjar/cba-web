"use client";

// Import Data Karyawan dari Excel (Pengaturan -> Import Data). Template berisi data yang sudah ada;
// baris dengan ID yang sudah ada di portal dilewati.
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importEmployees, exportEmployeeTemplateRows, type ImportResult } from "./actions";
import { downloadTemplate, parseEmployeeFile, type ParsedFile } from "@/lib/employee-import";
import { matchRegion } from "@/lib/wilayah-match";
import type { MasterOptions } from "@/lib/master-data";
import { T } from "@/components/i18n";

export default function EmployeeImportDialog({ master, employeeIds, onClose }: {
  master: MasterOptions; employeeIds: string[]; onClose: (changed: boolean) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [matching, setMatching] = useState(false);
  const [regionStat, setRegionStat] = useState<{ matched: number; missed: string[] } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const p = parseEmployeeFile(ev.target?.result as ArrayBuffer, master, new Set(employeeIds));
      setParsed(p);
      setRegionStat(null);
      setImportResult(null);
      // Cocokkan wilayah alamat KTP ke data Kemendagri; yang tidak ketemu tetap diimport dengan wilayah kosong.
      if (p.rows.length) {
        setMatching(true);
        Promise.all(p.rows.map(async (r) => {
          const filled = !!(r.addressVillage || r.addressDistrict || r.addressCity || r.addressProvince);
          const m = filled ? await matchRegion({ village: r.addressVillage, district: r.addressDistrict, city: r.addressCity, province: r.addressProvince }).catch(() => null) : null;
          const postal = /^\d{5}$/.test(r.addressPostal ?? "") ? r.addressPostal : m?.postal || undefined;
          return { row: { ...r, addressRegion: m?.code, addressRegionName: m?.name, addressPostal: postal }, filled, ok: !!m };
        })).then((list) => {
          setParsed({ ...p, rows: list.map((x) => x.row) });
          setRegionStat({
            matched: list.filter((x) => x.ok).length,
            missed: list.filter((x) => x.filled && !x.ok).map((x) => `${x.row.employeeId}: ${[x.row.addressVillage, x.row.addressDistrict, x.row.addressCity, x.row.addressProvince].filter(Boolean).join(", ")}`),
          });
        }).finally(() => setMatching(false));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleImport() {
    if (!parsed?.rows.length || parsed.orgMissing.length || matching) return;
    startTransition(async () => {
      const { results } = await importEmployees(parsed.rows);
      setImportResult(results);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function closeImport() {
    onClose(!!importResult?.some((r) => r.status === "ok"));
  }


  return (
  <Dialog open onOpenChange={(open: boolean) => { if (!open) closeImport(); }}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle><T>Import Data Karyawan</T></DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-1">
        <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-700 space-y-1">
          <p><T>• Cabang, departemen, dan jabatan pada berkas wajib telah terdaftar di Parameter Organisasi; lakukan Import Parameter Organisasi terlebih dahulu.</T></p>
          <p><T>• Gunakan templat portal atau berkas ekspor KantorKu; ketentuan pengisian tercantum pada sheet Petunjuk.</T></p>
          <p><T>• Karyawan dengan ID yang telah terdaftar dilewati; perubahan datanya dilakukan melalui menu Data Karyawan. Baris yang tidak valid tidak diimport.</T></p>
          <p><T>• Nomor urut ditetapkan otomatis berdasarkan Tanggal Masuk, dan gaji awal berlaku sejak Tanggal Masuk.</T></p>
        </div>

        <Button variant="outline" disabled={downloading} className="w-full gap-2"
          onClick={async () => {
            // File berisi data karyawan yang sudah ada (+ baris kosong untuk karyawan baru).
            setDownloading(true);
            try { downloadTemplate((await exportEmployeeTemplateRows()).rows); }
            catch { downloadTemplate(); }
            finally { setDownloading(false); }
          }}>
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} <T>Download Template Excel (.xlsx)</T>
        </Button>
        <p className="-mt-2 text-[11px] text-gray-500"><T>Templat memuat data karyawan yang telah terdaftar sebagai acuan; tambahkan karyawan baru pada baris di bawahnya.</T></p>

        <div className="space-y-1.5">
          <Label className="text-xs"><T>Pilih File Excel</T></Label>
          <input ref={fileRef} type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileChange}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand file:text-white file:text-xs file:font-medium hover:file:bg-brand-dark cursor-pointer" />
        </div>

        {parsed && (
          <div className="space-y-2 text-xs">
            {parsed.sheet && (
              <p className="text-gray-600">
                <T>Sheet</T> <span className="font-semibold">{parsed.sheet}</span>:{" "}
                {parsed.rows.length} <T>karyawan siap diimport,</T>{" "}
                {parsed.rows.filter((r) => !r.isActive).length} <T>berstatus nonaktif.</T>
                {!!parsed.existing && <> {parsed.existing} <T>baris sudah ada di portal (dilewati).</T></>}
              </p>
            )}
            {parsed.errors.length > 0 && (
              <div className="bg-red-50 text-red-700 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                {parsed.errors.map((e) => <p key={e}>{e}</p>)}
              </div>
            )}
            {parsed.orgMissing.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                <p className="font-semibold"><T>Import diblokir: parameter organisasi berikut belum terdaftar.</T></p>
                <p className="mt-1">{parsed.orgMissing.join(" · ")}</p>
                <p className="mt-1">
                  <T>Daftarkan terlebih dahulu melalui</T>{" "}
                  <Link href="/portal/admin/setup" className="font-semibold underline"><T>menu Organisasi</T></Link>{" "}
                  <T>atau Import Parameter Organisasi, atau perbaiki penulisannya pada berkas, lalu pilih berkas kembali.</T>
                </p>
              </div>
            )}
            {(matching || regionStat) && (
              <div className="rounded-lg bg-sky-50 p-3 text-sky-900">
                {matching ? <p><T>Mencocokkan wilayah dengan data Kemendagri…</T></p> : regionStat && (
                  <>
                    <p><T>Wilayah alamat KTP dikenali</T>: <b>{regionStat.matched}</b> <T>dari</T> {parsed.rows.length} <T>karyawan</T>.</p>
                    {regionStat.missed.length > 0 && (
                      <div className="mt-1 max-h-24 overflow-y-auto text-amber-800">
                        <p className="font-semibold"><T>Tidak ketemu (tetap diimport, wilayah dikosongkan untuk diisi manual):</T></p>
                        {regionStat.missed.map((m) => <p key={m}>{m}</p>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {parsed.unknown.length > 0 && (
              <p className="text-gray-500">
                <T>Kolom yang tidak dipakai:</T> {parsed.unknown.join(", ")}
              </p>
            )}
            {parsed.rows.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {parsed.rows.slice(0, 10).map((r) => (
                  <div key={r.employeeId} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                    <span className="font-mono text-gray-500 w-16 shrink-0">{r.employeeId}</span>
                    <span className="text-gray-700 flex-1 truncate">{r.name}</span>
                    <span className="text-gray-400 shrink-0">{r.employmentStatus}</span>
                  </div>
                ))}
                {parsed.rows.length > 10 && (
                  <p className="text-gray-400 text-center"><T>... dan</T> {parsed.rows.length - 10} <T>lainnya</T></p>
                )}
              </div>
            )}
          </div>
        )}

        {importResult && (
          <div className="bg-green-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
              <CheckCircle2 size={16} /> <T>Import selesai</T>
            </div>
            <p className="text-xs text-green-600">
              {importResult.filter((r) => r.status === "ok").length} <T>karyawan berhasil diimport</T>
            </p>
            {importResult.filter((r) => r.status === "skip" || r.warning).map((r) => (
              <p key={r.employeeId} className="text-xs text-amber-700">
                {r.employeeId}: <T>{r.reason ?? r.warning}</T>
              </p>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={closeImport}><T>Tutup</T></Button>
        <Button size="sm" onClick={handleImport} disabled={isPending || !parsed?.rows.length || !!parsed?.orgMissing.length} className="gap-2">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {isPending ? <T>{"Mengimport..."}</T> : `Import ${parsed?.rows.length ?? 0} Karyawan`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
}
