"use client";

import { Printer } from "lucide-react";
import { T, useT } from "@/components/i18n";
import type { A1Rows, Form1721A1 } from "@/lib/form1721a1";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const rp = (n: number) => Math.round(n).toLocaleString("id-ID");

// Susunan baris formulir 1721-A1 (Bukti Pemotongan PPh Pasal 21 bagi Pegawai Tetap).
const SECTIONS: { title: string; rows: [keyof A1Rows, string, string?][] }[] = [
  { title: "Penghasilan Bruto", rows: [
    ["r1", "Gaji / pensiun atau THT/JHT"],
    ["r2", "Tunjangan PPh"],
    ["r3", "Tunjangan lainnya, uang lembur, dan sebagainya"],
    ["r4", "Honorarium dan imbalan lain sejenisnya"],
    ["r5", "Premi asuransi yang dibayar pemberi kerja"],
    ["r6", "Penerimaan dalam bentuk natura dan kenikmatan lainnya yang dikenakan pemotongan PPh 21"],
    ["r7", "Tantiem, bonus, gratifikasi, jasa produksi, dan THR"],
    ["r8", "Jumlah penghasilan bruto (1 s.d. 7)", "total"],
  ] },
  { title: "Pengurangan", rows: [
    ["r9", "Biaya jabatan / biaya pensiun"],
    ["r10", "Iuran terkait pensiun atau hari tua (JHT/JP karyawan)"],
    ["r11", "Jumlah pengurangan (9 s.d. 10)", "total"],
  ] },
  { title: "Penghitungan PPh Pasal 21", rows: [
    ["r12", "Jumlah penghasilan neto (8 − 11)"],
    ["r13", "Penghasilan neto masa pajak sebelumnya"],
    ["r14", "Jumlah penghasilan neto untuk penghitungan PPh 21 setahun / disetahunkan"],
    ["r15", "Penghasilan tidak kena pajak (PTKP)"],
    ["r16", "Penghasilan kena pajak setahun / disetahunkan"],
    ["r17", "PPh 21 atas penghasilan kena pajak setahun / disetahunkan"],
    ["r18", "PPh 21 yang telah dipotong masa pajak sebelumnya"],
    ["r19", "PPh 21 terutang", "total"],
    ["r20", "PPh 21 yang telah dipotong dan dilunasi", "total"],
  ] },
];

export default function A1Document({ form: f }: { form: Form1721A1 }) {
  const t = useT();
  let no = 0;
  return (
    <div className="space-y-3">
      <div className="flex justify-end print:hidden">
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85">
          <Printer size={15} /> <T>Cetak / Simpan PDF</T>
        </button>
      </div>
      <article className="rounded-2xl border border-gray-200 bg-white p-6 text-xs text-gray-800 print:rounded-none print:border-0 print:p-0">
        <header className="border-b-2 border-gray-800 pb-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500"><T>Formulir 1721-A1</T></p>
          <h1 className="text-base font-bold uppercase"><T>Bukti Pemotongan Pajak Penghasilan Pasal 21 bagi Pegawai Tetap</T></h1>
          <p className="mt-1 text-gray-600"><T>Nomor</T>: <b className="tabular-nums">{f.number}</b> · <T>Tahun Pajak</T> {f.year} · <T>Masa Perolehan</T> {t(MONTHS[f.monthFrom - 1])} – {t(MONTHS[f.monthTo - 1])}</p>
        </header>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <section>
            <p className="mb-1 font-bold uppercase text-gray-600"><T>Identitas Pemotong</T></p>
            <Info label="NPWP Pemotong" value={f.employer.npwp} />
            <Info label="Nama Pemotong" value={f.employer.name} />
          </section>
          <section>
            <p className="mb-1 font-bold uppercase text-gray-600"><T>Identitas Penerima Penghasilan</T></p>
            <Info label="NPWP" value={f.employee.npwp} />
            <Info label="NIK" value={f.employee.nik} />
            <Info label="Nama" value={f.employee.name} />
            <Info label="Alamat" value={f.employee.address} />
            <Info label="Jenis Kelamin" value={f.employee.gender} />
            <Info label="Status PTKP" value={f.employee.ptkp} />
            <Info label="Jabatan" value={f.employee.position} />
          </section>
        </div>

        <p className="mt-4 font-bold uppercase text-gray-600"><T>Rincian Penghasilan dan Penghitungan PPh Pasal 21</T></p>
        <p className="text-gray-500"><T>Kode objek pajak</T>: 21-100-01 · <T>Pegawai tetap</T></p>
        <table className="mt-2 w-full border-collapse">
          <tbody>
            {SECTIONS.map((s) => (
              <SectionRows key={s.title} title={s.title}>
                {s.rows.map(([k, label, kind]) => {
                  no++;
                  return (
                    <tr key={k} className={`border-b border-gray-200 ${kind === "total" ? "bg-gray-50 font-semibold" : ""}`}>
                      <td className="w-8 py-1.5 pr-2 text-right text-gray-500 tabular-nums">{no}.</td>
                      <td className="py-1.5 pr-3"><T>{label}</T></td>
                      <td className="w-36 py-1.5 text-right tabular-nums">{rp(f.rows[k])}</td>
                    </tr>
                  );
                })}
              </SectionRows>
            ))}
          </tbody>
        </table>
        {f.diff !== 0 && (
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-600">
            {f.diff > 0 ? <T>PPh 21 lebih dipotong</T> : <T>PPh 21 kurang dipotong</T>}: <b>Rp{rp(Math.abs(f.diff))}</b>
          </p>
        )}

        <footer className="mt-6 grid gap-4 border-t border-gray-300 pt-3 sm:grid-cols-2">
          <div className="text-gray-500"><T>Dokumen ini disusun dari data Proses Gaji portal. Bukti potong resmi diterbitkan melalui sistem DJP (Coretax).</T></div>
          <div className="sm:text-right">
            <p className="font-bold uppercase text-gray-600"><T>Identitas Pemotong / Penandatangan</T></p>
            <p className="mt-6 font-semibold">{f.employer.signerName || "........................................"}</p>
            <p className="text-gray-500"><T>NPWP/NIK</T>: {f.employer.signerId || "—"}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="flex gap-2 py-0.5"><span className="w-36 shrink-0 text-gray-500"><T>{label}</T></span><span className="font-medium text-gray-900">{value || "—"}</span></div>;
}

function SectionRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr><td colSpan={3} className="pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-gray-600"><T>{title}</T></td></tr>
      {children}
    </>
  );
}
