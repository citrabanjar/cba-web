"use client";

// Kotak Reviewer di bawah data calon (saat HRD memeriksa isian calon dengan berkas asli):
//   [x] Wawancara → pewawancara (Employee ID, boleh lebih dari satu) menilai sendiri di menu Persetujuan.
//   [x] Approval  → approver (Employee ID, boleh lebih dari satu, berurutan) menyetujui / menolak dengan catatan.
// Tanpa wawancara, approval wajib. Setelah semua beres, berkas kembali ke Admin untuk didaftarkan.
import { useState } from "react";
import { UserCheck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import type { ApproverRef, OnboardingFlow } from "@/lib/onboarding-interview";

export type PersonOption = { id: string; employeeId: string; name: string };
export const emptyReviewers = (): OnboardingFlow => ({ interview: false, interviewers: [], approval: true, approvers: [] });

function People({ id, list, people, ordered, onChange }: {
  id: string; list: ApproverRef[]; people: PersonOption[]; ordered?: boolean; onChange: (v: ApproverRef[]) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const byId = new Map(people.map((p) => [p.id, p]));
  function add() {
    const q = text.trim().toUpperCase();
    const p = people.find((x) => x.employeeId.toUpperCase() === q);
    if (!p) { setErr("Employee ID tidak ditemukan di karyawan aktif."); return; }
    if (!list.some((x) => x.id === p.id)) onChange([...list, { id: p.id, name: p.name }]);
    setText(""); setErr("");
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {list.length === 0 && <span className="text-xs text-gray-400"><T>Belum dipilih.</T></span>}
        {list.map((x, i) => (
          <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1.5 text-xs text-gray-700 ring-1 ring-gray-200">
            {ordered && <b className="text-gray-400">{i + 1}.</b>} {byId.get(x.id)?.employeeId ? `${byId.get(x.id)!.employeeId} - ` : ""}{x.name}
            <button type="button" aria-label={t("Hapus")} onClick={() => onChange(list.filter((y) => y.id !== x.id))}
              className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-full max-w-xs">
          <EmployeeCombobox id={id} value={text} options={people.map((p) => ({ value: p.employeeId, label: p.name }))}
            onChange={(v) => { setText(v); setErr(""); }} />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!text.trim()} className="h-9 gap-1.5 rounded-full bg-white px-4">
          <UserPlus size={14} /> <T>Tambah</T>
        </Button>
      </div>
      {err && <p className="text-xs text-red-600"><T>{err}</T></p>}
    </div>
  );
}

export default function ReviewerBox({ value, onChange, people }: { value: OnboardingFlow; onChange: (v: OnboardingFlow) => void; people: PersonOption[] }) {
  const set = (patch: Partial<OnboardingFlow>) => onChange({ ...value, ...patch });
  return (
    <section className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><UserCheck size={16} /> <T>Reviewer</T></p>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={value.interview} className="mt-1 h-4 w-4 accent-[#BE353F]"
          onChange={(e) => set({ interview: e.target.checked, approval: e.target.checked ? value.approval : true })} />
        <span>
          <span className="block text-sm font-semibold text-gray-900"><T>Wawancara</T></span>
          <span className="block text-xs text-gray-500"><T>Calon diwawancara. Setiap pewawancara mengisi nilai, rekomendasi, dan catatan sendiri di menu Persetujuan.</T></span>
        </span>
      </label>
      {value.interview && (
        <div className="pl-7">
          <p className="mb-1.5 text-xs font-medium text-gray-600"><T>Pewawancara (Employee ID)</T></p>
          <People id="rev-interviewers" list={value.interviewers} people={people} onChange={(v) => set({ interviewers: v })} />
        </div>
      )}
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={value.approval} disabled={!value.interview} className="mt-1 h-4 w-4 accent-[#BE353F]"
          onChange={(e) => set({ approval: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold text-gray-900"><T>Approval</T></span>
          <span className="block text-xs text-gray-500">
            <T>{value.interview ? "Setelah wawancara, hasilnya disetujui approver secara berurutan, masing-masing bisa memberi catatan." : "Tanpa wawancara, approval wajib: data calon disetujui approver secara berurutan."}</T>
          </span>
        </span>
      </label>
      {value.approval && (
        <div className="pl-7">
          <p className="mb-1.5 text-xs font-medium text-gray-600"><T>Approver (Employee ID, berurutan)</T></p>
          <People id="rev-approvers" list={value.approvers} people={people} ordered onChange={(v) => set({ approvers: v })} />
        </div>
      )}
      <p className="text-xs text-gray-500"><T>Setelah selesai, berkas calon (penilaian, catatan approver) kembali ke Admin di menu ini untuk didaftarkan dan bisa dicetak.</T></p>
    </section>
  );
}
