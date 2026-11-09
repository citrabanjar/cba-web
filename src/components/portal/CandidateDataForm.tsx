"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { BANK_OPTIONS, FAMILY_RELATIONS, ID_TYPES, PERSONAL_CHOICES } from "@/lib/personal-info";
import { PTKP_OPTIONS, type CandidateData } from "@/lib/onboarding";

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm disabled:bg-gray-50";

// Form data pribadi calon karyawan. Dipakai calon (mengisi) dan HRD (memeriksa / membetulkan).
export default function CandidateDataForm({ value, onChange, disabled }: {
  value: CandidateData; onChange: (v: CandidateData) => void; disabled?: boolean;
}) {
  const t = useT();
  const set = <K extends keyof CandidateData>(k: K, v: CandidateData[K]) => onChange({ ...value, [k]: v });
  const text = (k: keyof CandidateData, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>
      <Input value={String(value[k] ?? "")} disabled={disabled} onChange={(e) => set(k, e.target.value as never)} {...props} /></div>
  );
  const choice = (k: keyof CandidateData, label: string, options: readonly string[]) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>
      <select value={String(value[k] ?? "")} disabled={disabled} onChange={(e) => set(k, e.target.value as never)} className={select}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{t(o)}</option>)}
      </select></div>
  );
  const section = (title: string, children: React.ReactNode) => (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>{title}</T></p>
      {children}
    </section>
  );
  const setFamily = (i: number, patch: Partial<CandidateData["family"][number]>) =>
    set("family", value.family.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-4">
      {section("Data Diri", (
        <div className="grid gap-3 sm:grid-cols-2">
          {text("name", "Nama lengkap (sesuai identitas)")}
          {text("phone", "No. HP (WhatsApp)", { inputMode: "tel" })}
          {text("birthPlace", "Tempat lahir")}
          {text("birthDate", "Tanggal lahir", { type: "date" })}
          {choice("idType", "Jenis identitas", ID_TYPES)}
          {text("ktpNumber", "No. identitas", { inputMode: "numeric" })}
          {choice("gender", "Jenis kelamin", PERSONAL_CHOICES.gender)}
          {choice("maritalStatus", "Status perkawinan", PERSONAL_CHOICES.maritalStatus)}
          {choice("religion", "Agama", PERSONAL_CHOICES.religion)}
        </div>
      ))}

      {section("Tempat Tinggal", (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs"><T>Alamat sesuai identitas</T></Label>
            <textarea value={value.address} disabled={disabled} rows={2} onChange={(e) => set("address", e.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-gray-50" /></div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={value.addressSameAsId} disabled={disabled} onChange={(e) => set("addressSameAsId", e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
            <T>Alamat saat ini sama dengan alamat identitas</T>
          </label>
          {!value.addressSameAsId && (
            <div className="space-y-1.5"><Label className="text-xs"><T>Alamat saat ini</T></Label>
              <textarea value={value.currentAddress} disabled={disabled} rows={2} onChange={(e) => set("currentAddress", e.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-gray-50" /></div>
          )}
        </div>
      ))}

      {section("Keluarga", (
        <div className="space-y-2">
          {value.family.length === 0 && <p className="text-xs text-gray-400"><T>Belum ada anggota keluarga. Tambahkan suami/istri dan anak (untuk BPJS dan PTKP).</T></p>}
          {value.family.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_32px]">
              <Input value={f.name} disabled={disabled} placeholder={t("Nama")} onChange={(e) => setFamily(i, { name: e.target.value })} />
              <Input value={f.idNumber} disabled={disabled} placeholder={t("No. identitas")} inputMode="numeric" onChange={(e) => setFamily(i, { idNumber: e.target.value })} />
              <select value={f.relation} disabled={disabled} onChange={(e) => setFamily(i, { relation: e.target.value })} className={select}>
                <option value="">—</option>
                {FAMILY_RELATIONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
              {!disabled && (
                <button type="button" aria-label={t("Hapus baris")} onClick={() => set("family", value.family.filter((_, j) => j !== i))}
                  className="flex h-9 items-center justify-center rounded-lg text-gray-400 hover:text-rose-600"><Trash2 size={15} /></button>
              )}
            </div>
          ))}
          {!disabled && (
            <button type="button" onClick={() => set("family", [...value.family, { name: "", idNumber: "", relation: "" }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"><Plus size={12} /> <T>Tambah anggota keluarga</T></button>
          )}
        </div>
      ))}

      {section("Rekening Bank", (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs"><T>Nama bank</T></Label>
            <Input value={value.bankName} disabled={disabled} list="onb-banks" onChange={(e) => set("bankName", e.target.value)} />
            <datalist id="onb-banks">{BANK_OPTIONS.map((b) => <option key={b.value} value={b.value} />)}</datalist></div>
          {text("bankAccount", "No. rekening", { inputMode: "numeric" })}
          {text("bankHolder", "Nama pemilik rekening")}
        </div>
      ))}

      {section("Pajak & BPJS", (
        <div className="grid gap-3 sm:grid-cols-2">
          {text("npwp", "NPWP (kosongkan bila belum punya)", { inputMode: "numeric" })}
          {choice("ptkpStatus", "Status PTKP", PTKP_OPTIONS)}
          {text("bpjsTkNumber", "No. BPJS Ketenagakerjaan (bila ada)", { inputMode: "numeric" })}
          {text("bpjsKesNumber", "No. BPJS Kesehatan (bila ada)", { inputMode: "numeric" })}
        </div>
      ))}
    </div>
  );
}
