"use client";

// Alur Pra-Karyawan (Admin): centang Wawancara → pilih pewawancara; centang Approval → pilih approver (berurutan).
// Tanpa wawancara, approval wajib. Super Admin hanya menyalakan modulnya di Pengaturan → Fitur.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, GitBranch, Loader2, Save, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import { useCanEdit } from "@/components/portal/edit-access";
import { flowProblems, type ApproverRef, type OnboardingFlow } from "@/lib/onboarding-interview";
import { saveOnboardingFlow } from "./actions";

export type PersonOption = { id: string; employeeId: string; name: string };

function People({ id, list, people, ordered, onChange, disabled }: {
  id: string; list: ApproverRef[]; people: PersonOption[]; ordered?: boolean; onChange: (v: ApproverRef[]) => void; disabled: boolean;
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
          <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs text-gray-700">
            {ordered && <b className="text-gray-400">{i + 1}.</b>} {byId.get(x.id)?.employeeId ? `${byId.get(x.id)!.employeeId} - ` : ""}{x.name}
            {!disabled && (
              <button type="button" aria-label={t("Hapus")} onClick={() => onChange(list.filter((y) => y.id !== x.id))}
                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-red-600"><X size={12} /></button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-full max-w-xs">
            <EmployeeCombobox id={id} value={text} options={people.map((p) => ({ value: p.employeeId, label: p.name }))}
              onChange={(v) => { setText(v); setErr(""); }} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={!text.trim()} className="h-9 gap-1.5 rounded-full px-4">
            <UserPlus size={14} /> <T>Tambah</T>
          </Button>
        </div>
      )}
      {err && <p className="text-xs text-red-600"><T>{err}</T></p>}
    </div>
  );
}

export default function FlowSetup({ flow, people }: { flow: OnboardingFlow; people: PersonOption[] }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [f, setF] = useState(flow);
  const [open, setOpen] = useState(flowProblems(flow).length > 0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<OnboardingFlow>) => { setMsg(null); setF((x) => ({ ...x, ...patch })); };
  const problems = flowProblems(flow);
  const summary = flow.interview
    ? `Wawancara (${flow.interviewers.length} pewawancara) → ${flow.approval ? `Approval (${flow.approvers.length} approver)` : "tanpa approval"}`
    : `Tanpa wawancara → Approval (${flow.approvers.length} approver)`;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-400 text-white"><GitBranch size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900"><T>Alur Pra-Karyawan</T></span>
          <span className={`block truncate text-xs ${problems.length ? "text-amber-700" : "text-gray-500"}`}>
            {problems.length ? <T>Belum lengkap: atur pewawancara / approver sebelum mengundang calon.</T> : <T>{summary}</T>}
          </span>
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={f.interview} disabled={!canEdit} className="mt-1 h-4 w-4 accent-[#BE353F]"
              onChange={(e) => set({ interview: e.target.checked, approval: e.target.checked ? f.approval : true })} />
            <span>
              <span className="block text-sm font-semibold text-gray-900"><T>Wawancara</T></span>
              <span className="block text-xs text-gray-500"><T>Calon diwawancara dulu. Setiap pewawancara mengisi nilai, rekomendasi, dan catatan sendiri di menu Persetujuan.</T></span>
            </span>
          </label>
          {f.interview && (
            <div className="pl-7">
              <p className="mb-1.5 text-xs font-medium text-gray-600"><T>Pewawancara (Employee ID)</T></p>
              <People id="flow-interviewers" list={f.interviewers} people={people} disabled={!canEdit} onChange={(v) => set({ interviewers: v })} />
            </div>
          )}

          <label className="flex items-start gap-3">
            <input type="checkbox" checked={f.approval} disabled={!canEdit || !f.interview} className="mt-1 h-4 w-4 accent-[#BE353F]"
              onChange={(e) => set({ approval: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold text-gray-900"><T>Approval</T></span>
              <span className="block text-xs text-gray-500">
                <T>{f.interview ? "Hasil wawancara dan tawaran kerja disetujui approver secara berurutan, masing-masing bisa memberi catatan." : "Tanpa wawancara, approval wajib: data calon disetujui approver secara berurutan sebelum didaftarkan."}</T>
              </span>
            </span>
          </label>
          {f.approval && (
            <div className="pl-7">
              <p className="mb-1.5 text-xs font-medium text-gray-600"><T>Approver (Employee ID, berurutan)</T></p>
              <People id="flow-approvers" list={f.approvers} people={people} ordered disabled={!canEdit} onChange={(v) => set({ approvers: v })} />
            </div>
          )}

          <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <T>Setelah approval selesai, berkas calon (penilaian, tawaran kerja, catatan approver) kembali ke Admin di menu ini dan bisa dicetak.</T>
          </p>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={pending} className="h-9 gap-1.5 rounded-full px-5" onClick={() => start(async () => {
                const r = await saveOnboardingFlow(f);
                setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Alur tersimpan." });
                if (!r.error) router.refresh();
              })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan Alur</T></Button>
              {msg && <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.ok && <CheckCircle2 size={15} />}<T>{msg.text}</T></span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
