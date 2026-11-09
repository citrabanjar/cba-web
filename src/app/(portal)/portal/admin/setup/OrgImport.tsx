"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { importOrgParameters, type MasterKind } from "./actions";

const SHEETS: { kind: MasterKind; sheet: string; label: string; example: string[] }[] = [
  { kind: "branch", sheet: "Cabang", label: "Cabang", example: ["Banjarmasin", "Banjarbaru"] },
  { kind: "department", sheet: "Departemen", label: "Departemen", example: ["Produksi", "Keuangan"] },
  { kind: "position", sheet: "Jabatan", label: "Jabatan", example: ["Staff", "Supervisor"] },
];
type Existing = Record<MasterKind, string[]>;

// Template Parameter Organisasi: satu file Excel, sheet Cabang / Departemen / Jabatan (satu kolom Nama).
export default function OrgImport({ existing }: { existing: Existing }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Existing | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const known = (kind: MasterKind) => new Set(existing[kind].map((x) => x.toLowerCase()));

  function template() {
    const wb = XLSX.utils.book_new();
    for (const s of SHEETS) {
      // Isi yang sudah ada ikut dicantumkan supaya admin cukup menambah baris baru.
      const rows = existing[s.kind].length ? existing[s.kind] : s.example;
      const ws = XLSX.utils.aoa_to_sheet([["Nama"], ...rows.map((x) => [x])]);
      ws["!cols"] = [{ wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws, s.sheet);
    }
    const guide = XLSX.utils.aoa_to_sheet([
      ["Petunjuk"],
      ["Isi kolom Nama di sheet Cabang, Departemen, dan Jabatan. Satu baris = satu nama."],
      ["Nama yang sudah ada di portal dilewati (tidak dobel); hanya nama baru yang ditambahkan."],
      ["Upload ini tidak menghapus atau mengganti nama yang sudah ada. Ubah/hapus nama lewat halaman Organisasi."],
    ]);
    guide["!cols"] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
    XLSX.writeFile(wb, "template_parameter_organisasi.xlsx");
  }

  async function read(file: File) {
    setMsg(null);
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const out = { branch: [], department: [], position: [] } as Existing;
    for (const s of SHEETS) {
      const name = wb.SheetNames.find((n) => n.trim().toLowerCase() === s.sheet.toLowerCase());
      if (!name) continue;
      const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" });
      out[s.kind] = table.slice(1).map((r) => String(r[0] ?? "").trim()).filter(Boolean);
    }
    if (!SHEETS.some((s) => out[s.kind].length)) setMsg({ ok: false, text: "Sheet Cabang, Departemen, atau Jabatan tidak ditemukan / kosong." });
    setParsed(out);
  }

  function save() {
    if (!parsed) return;
    start(async () => {
      const { result } = await importOrgParameters(parsed);
      const added = SHEETS.map((s) => `${result[s.kind].added} ${t(s.label).toLowerCase()}`).join(", ");
      setMsg({ ok: true, text: `${t("Ditambahkan")}: ${added}.` });
      setParsed(null);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={template}><Download size={14} /> <T>Download Template</T></Button>
        <Button size="sm" className="gap-1.5" onClick={() => { setOpen(true); setParsed(null); setMsg(null); }}><Upload size={14} /> <T>Upload Parameter</T></Button>
      </div>
      {open && (
        <Dialog open onOpenChange={(o: boolean) => { if (!o) setOpen(false); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle><T>Upload Parameter Organisasi</T></DialogTitle></DialogHeader>
            <p className="-mt-2 text-xs text-gray-500"><T>Pakai template Excel (sheet Cabang, Departemen, Jabatan). Nama yang sudah ada dilewati; hanya nama baru yang ditambahkan.</T></p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={template}><Download size={14} /> <T>Download Template</T></Button>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-gray-50">
                <Upload size={14} /> <T>Pilih File Excel</T>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
              </label>
            </div>
            {parsed && (
              <div className="grid gap-3 sm:grid-cols-3">
                {SHEETS.map((s) => {
                  const k = known(s.kind);
                  const rows = parsed[s.kind];
                  const fresh = [...new Set(rows.map((x) => x.toLowerCase()))].filter((x) => !k.has(x));
                  return (
                    <div key={s.kind} className="rounded-xl border border-gray-200 p-3">
                      <p className="text-sm font-semibold text-gray-900"><T>{s.label}</T></p>
                      <p className="text-xs text-gray-500">{rows.length} <T>baris</T> · <b className="text-emerald-700">{fresh.length} <T>baru</T></b> · {rows.length - fresh.length} <T>sudah ada</T></p>
                      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                        {rows.map((x, i) => {
                          const key = x.toLowerCase();
                          const dup = rows.findIndex((y) => y.toLowerCase() === key) < i;
                          const skip = k.has(key) || dup;
                          return <li key={i} className={skip ? "text-gray-400" : "text-emerald-700"}>{skip ? "· " : "+ "}{x}{dup && <span className="ml-1">({t("dobel")})</span>}</li>;
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}><T>Tutup</T></Button>
              <Button disabled={pending || !parsed} className="gap-1.5" onClick={save}>{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
