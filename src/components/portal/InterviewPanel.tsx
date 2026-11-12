"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2, Circle, Clock, Loader2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { actionableApprovers, RECOMMENDATIONS, rupiah, SCORES, type Interview, type Offer } from "@/lib/onboarding-interview";
import { decideInterview } from "@/app/(portal)/portal/admin/onboarding/actions";

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm disabled:bg-gray-50";
const fmtDate = (s: string) => (s ? new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (s: string) => new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? (v || "—");
type Master = { branches: string[]; departments: string[]; positions: string[] };

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label className="text-xs"><T>{label}</T></Label>{children}</div>;
}

// Isian HRD: hasil wawancara + tawaran kerja.
export function InterviewForm({ value, onChange, master }: { value: Interview; onChange: (v: Interview) => void; master: Master }) {
  const t = useT();
  const set = (patch: Partial<Interview>) => onChange({ ...value, ...patch });
  const setO = (patch: Partial<Offer>) => onChange({ ...value, offer: { ...value.offer, ...patch } });
  const pick = (k: "branch" | "departmentName" | "position", list: string[]) => (
    <select value={value.offer[k]} onChange={(e) => setO({ [k]: e.target.value })} className={select}>
      <option value="">—</option>
      {[...(value.offer[k] && !list.includes(value.offer[k]) ? [value.offer[k]] : []), ...list].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:col-span-2"><T>Hasil wawancara</T></p>
        <F label="Tanggal wawancara"><Input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} /></F>
        <F label="Pewawancara"><Input value={value.interviewer} className="uppercase" onChange={(e) => set({ interviewer: e.target.value.toUpperCase() })} placeholder={t("Nama pewawancara")} /></F>
        <F label="Nilai">
          <select value={value.score} onChange={(e) => set({ score: e.target.value })} className={select}>
            <option value="">—</option>{SCORES.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
          </select>
        </F>
        <F label="Rekomendasi">
          <select value={value.recommendation} onChange={(e) => set({ recommendation: e.target.value })} className={select}>
            <option value="">—</option>{RECOMMENDATIONS.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
          </select>
        </F>
        <F label="Catatan wawancara" wide>
          <textarea value={value.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder={t("Kesan, kelebihan, kekurangan, pengalaman yang relevan")}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
        </F>
      </div>
      <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:col-span-2"><T>Tawaran kerja (ikut disetujui approver)</T></p>
        <F label="Departemen">{pick("departmentName", master.departments)}</F>
        <F label="Jabatan">{pick("position", master.positions)}</F>
        <F label="Cabang">{pick("branch", master.branches)}</F>
        <F label="Status kerja">
          <select value={value.offer.employmentStatus} onChange={(e) => setO({ employmentStatus: e.target.value })} className={select}>
            <option value="KONTRAK">{t("Kontrak")}</option><option value="TETAP">{t("Tetap")}</option>
          </select>
        </F>
        <F label="Gaji pokok yang ditawarkan (Rp / bulan)"><Input type="number" min={0} value={value.offer.salary} onChange={(e) => setO({ salary: e.target.value })} /></F>
        <F label="Rencana tanggal masuk"><Input type="date" value={value.offer.joinDate} onChange={(e) => setO({ joinDate: e.target.value })} /></F>
        {value.offer.employmentStatus === "KONTRAK" && (
          <F label="Tanggal akhir kontrak"><Input type="date" value={value.offer.contractEndDate} onChange={(e) => setO({ contractEndDate: e.target.value })} /></F>
        )}
      </div>
    </div>
  );
}

type JobInfo = { position: string; departmentName: string; branch: string; employmentStatus: string; joinDate: string; contractEndDate: string };

// Ringkasan hasil wawancara, tawaran, dan jejak approval (baca saja). Tanpa wawancara: data pekerjaan + jejak approval.
export function InterviewSummary({ interview: i, job }: { interview: Interview; job?: JobInfo }) {
  const t = useT();
  const now = actionableApprovers(i.approval);
  const row = (l: string, v: React.ReactNode) => <div className="flex justify-between gap-3 py-1"><span className="text-gray-500"><T>{l}</T></span><span className="text-right font-medium text-gray-800">{v}</span></div>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {i.skipped && job && (
        <div className="rounded-2xl border border-gray-200 p-4 text-sm sm:col-span-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Data pekerjaan</T></p>
          {row("Jabatan", job.position || "—")}
          {row("Departemen", job.departmentName || "—")}
          {row("Cabang", job.branch || "—")}
          {row("Status kerja", t(job.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"))}
          {row("Tanggal masuk", fmtDate(job.joinDate))}
          {job.employmentStatus !== "TETAP" && row("Akhir kontrak", fmtDate(job.contractEndDate))}
        </div>
      )}
      {!i.skipped && <>
      <div className="rounded-2xl border border-gray-200 p-4 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Hasil wawancara</T></p>
        {row("Tanggal", fmtDate(i.date))}
        {row("Pewawancara", i.interviewer || "—")}
        {row("Nilai", t(label(SCORES, i.score)))}
        {row("Rekomendasi", t(label(RECOMMENDATIONS, i.recommendation)))}
        {i.notes && <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{i.notes}</p>}
      </div>
      <div className="rounded-2xl border border-gray-200 p-4 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Tawaran kerja</T></p>
        {row("Jabatan", i.offer.position || "—")}
        {row("Departemen", i.offer.departmentName || "—")}
        {row("Cabang", i.offer.branch || "—")}
        {row("Status kerja", t(i.offer.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"))}
        {row("Gaji pokok", <b>{rupiah(i.offer.salary)}</b>)}
        {row("Tanggal masuk", fmtDate(i.offer.joinDate))}
        {i.offer.employmentStatus === "KONTRAK" && row("Akhir kontrak", fmtDate(i.offer.contractEndDate))}
      </div>
      </>}
      {i.approval && (
        <div className="rounded-2xl border border-gray-200 p-4 text-sm sm:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <T>Approval</T> · <T>{i.approval.mode === "TUNGGAL" ? "Tunggal" : i.approval.order === "BERURUTAN" ? "Sirkular berurutan" : "Sirkular bersamaan"}</T>
            {i.submittedBy && <span className="font-normal normal-case"> · <T>diajukan</T> {i.submittedBy}{i.submittedAt && `, ${fmtTime(i.submittedAt)}`}</span>}
          </p>
          <ol className="space-y-1.5">
            {i.approval.steps.map((s, n) => (
              <li key={s.id + n} className="flex items-start gap-2">
                {s.decision === "SETUJU" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  : s.decision === "TOLAK" ? <XCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                  : now.includes(s.id) ? <Clock size={16} className="mt-0.5 shrink-0 text-amber-500" /> : <Circle size={16} className="mt-0.5 shrink-0 text-gray-300" />}
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-800">{s.name}{s.by && s.by !== s.name ? ` (${s.by})` : ""}</span>{" "}
                  <span className="text-xs text-gray-500">
                    {s.decision === "SETUJU" ? <><T>setuju</T> · {fmtTime(s.at)}</> : s.decision === "TOLAK" ? <><T>menolak</T> · {fmtTime(s.at)}</> : now.includes(s.id) ? <T>menunggu keputusan</T> : <T>belum giliran</T>}
                  </span>
                  {s.note && <span className="block text-xs text-gray-600">“{s.note}”</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Tombol keputusan approver (Persetujuan → Wawancara, juga di dialog Onboarding).
export function InterviewDecision({ candidateId, onDone }: { candidateId: string; onDone?: () => void }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "SETUJU" | "TOLAK") => {
    if (d === "TOLAK" && !window.confirm(t("Tolak calon karyawan ini?"))) return;
    setMsg(null);
    start(async () => {
      const r = await decideInterview(candidateId, d, note);
      if (r.error) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: d === "TOLAK" ? "Calon ditolak." : !r.done ? "Disetujui. Menunggu approver berikutnya." : r.ready ? "Disetujui semua. HRD tinggal mendaftarkan karyawan." : r.emailed ? "Disetujui semua. Undangan isi data sudah dikirim ke email calon." : "Disetujui semua. Email undangan gagal terkirim: HRD bisa kirim ulang dari menu Pra-Karyawan." });
      onDone?.();
    });
  };
  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-sm font-semibold text-amber-900"><T>Giliran Anda memberi keputusan.</T></p>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Catatan (wajib bila menolak)")} className="bg-white" />
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} className="gap-1.5 text-rose-600" onClick={() => decide("TOLAK")}><X size={14} /> <T>Tolak</T></Button>
        <Button disabled={pending} className="gap-1.5" onClick={() => decide("SETUJU")}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} <T>Setujui</T></Button>
      </div>
    </div>
  );
}
