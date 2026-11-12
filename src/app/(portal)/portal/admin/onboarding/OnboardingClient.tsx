"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ClipboardCheck, Copy, KeyRound, Loader2, MessagesSquare, Plus, Search, Send, Trash2, Undo2, UserCheck, UserPlus, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import CandidateDataForm from "@/components/portal/CandidateDataForm";
import type { MasterOptions as BaseMaster } from "@/lib/master-data";
type MasterOptions = BaseMaster & { managers: { value: string; label: string }[] };
import { CANDIDATE_GROUPS, CANDIDATE_STATUS, missingData, missingJob, type CandidateData, type CandidateJob } from "@/lib/onboarding";
import { emptyInterview, interviewApproved, missingInterview, rupiah, type Interview } from "@/lib/onboarding-interview";
import { InterviewDecision, InterviewForm, InterviewSummary } from "@/components/portal/InterviewPanel";
import { useCanEdit } from "@/components/portal/edit-access";
import { approveCandidate, deleteCandidate, inviteCandidate, registerCandidate, rejectCandidate, resendInvite, returnToCandidate, saveCandidateReview, saveInterview, submitForApproval, submitInterview } from "./actions";

export type CandidateRow = {
  id: string; name: string; email: string; phone: string; status: string; note: string | null;
  data: CandidateData; job: CandidateJob; otp: { code: string; until: string } | null;
  submittedAt: string | null; createdAt: string; invitedBy: string | null; reviewedBy: string | null;
  approvedBy: string | null; approvedAt: string | null; userId: string | null;
  interview: Interview | null; canDecide: boolean;
};

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm disabled:bg-gray-50";
const fmt = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type Msg = { ok: boolean; text: string; list?: string[] } | null;
const MsgBox = ({ msg }: { msg: Msg }) => msg ? (
  <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
    <T>{msg.text}</T>{msg.list && <ul className="mt-1 list-disc pl-5 text-xs">{msg.list.map((x) => <li key={x}><T>{x}</T></li>)}</ul>}
  </div>
) : null;

function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [done, setDone] = useState<{ emailed: boolean; link: string; interview?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const link = done?.link ?? (typeof window !== "undefined" ? `${window.location.origin}/onboarding` : "/onboarding");
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle><T>Undang Calon Karyawan</T></DialogTitle></DialogHeader>
        {done ? (
          <div className="min-w-0 space-y-3 text-sm text-gray-700">
            <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={16} /> <T>Calon karyawan terdaftar.</T></p>
            {done.interview ? (
              <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800"><T>Calon masuk tahap wawancara. Isi hasil wawancara dan tawaran kerja, lalu ajukan approval. Undangan isi data dikirim otomatis ke email calon setelah disetujui.</T></p>
            ) : <>
            {done.emailed
              ? <p className="break-words rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800"><T>Email undangan sudah dikirim ke</T> <b>{form.email}</b>.</p>
              : <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800"><T>Email undangan belum terkirim. Kirim link berikut ke calon lewat WhatsApp.</T></p>}
            {done.emailed && <p className="text-xs text-gray-500"><T>Jika undangan tidak masuk inbox / spam, berikan link di bawah ini.</T></p>}
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
              <button type="button" aria-label={t("Salin")} onClick={() => navigator.clipboard?.writeText(link)} className="text-gray-500 hover:text-brand"><Copy size={14} /></button>
            </div>
            </>}
          </div>
        ) : (
          <div className="space-y-3">
            {(["name", "email", "phone"] as const).map((k) => (
              <div key={k} className="space-y-1.5"><Label className="text-xs"><T>{k === "name" ? "Nama calon karyawan" : k === "email" ? "Email" : "No. HP (WhatsApp)"}</T></Label>
                <Input type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} value={form[k]} className={k === "name" ? "uppercase" : undefined}
                  onChange={(e) => setForm({ ...form, [k]: k === "name" ? e.target.value.toUpperCase() : e.target.value })} /></div>
            ))}
            <MsgBox msg={msg} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>{done ? "Tutup" : "Batal"}</T></Button>
          {!done && (
            <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
              const r = await inviteCandidate(form);
              if (r.error) setMsg({ ok: false, text: r.error }); else setDone({ emailed: !!r.emailed, link: r.link ?? link, interview: r.interview });
            })}>{pending && <Loader2 size={15} className="animate-spin" />} <T>Daftarkan</T></Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ row, master, canApprove, onClose }: { row: CandidateRow; master: MasterOptions; canApprove: boolean; onClose: () => void }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: form terkunci, tombol ubah disembunyikan
  const [tab, setTab] = useState<"data" | "job">("data");
  const [data, setData] = useState(row.data);
  const [job, setJob] = useState(row.job);
  const [iv, setIv] = useState<Interview>(row.interview ?? emptyInterview());
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closed = row.status === "DISETUJUI" || row.status === "DITOLAK";
  const waiting = row.status === "DIUNDANG";
  const inInterview = row.status === "WAWANCARA" || row.status === "APPROVAL_WAWANCARA";
  // Lolos approval wawancara: HRD langsung mendaftarkan karyawan; status kerja, jabatan, gaji mengikuti tawaran.
  const viaInterview = interviewApproved(row.interview);
  // Workflow approval data calon (tanpa wawancara) sedang berjalan / sudah selesai.
  const pendingWorkflow = row.status === "MENUNGGU_APPROVAL" && !!row.interview?.approval;
  const legacyApproval = row.status === "MENUNGGU_APPROVAL" && !pendingWorkflow;
  const ready = row.status === "SIAP_DAFTAR" || (viaInterview && (row.status === "DIKIRIM" || row.status === "DIKEMBALIKAN"));
  const locked = viaInterview || row.status === "SIAP_DAFTAR";
  const ro = closed || !canEdit;
  const run = (fn: () => Promise<{ error?: string; missing?: string[] }>, ok: string, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ ok: false, text: r.error, list: r.missing }); else { setMsg({ ok: true, text: ok }); after?.(); }
    });
  };
  const setJ = <K extends keyof CandidateJob>(k: K, v: CandidateJob[K]) => setJob((j) => ({ ...j, [k]: v }));
  const masterSelect = (k: "branch" | "departmentName" | "position", list: string[]) => (
    <select value={job[k]} disabled={ro || (locked && k === "position")} onChange={(e) => setJ(k, e.target.value)} className={select}>
      <option value="">—</option>
      {[...(job[k] && !list.includes(job[k]) ? [job[k]] : []), ...list].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const missing = [...missingData(data), ...missingJob(job)];

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{row.name} <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${CANDIDATE_STATUS[row.status]?.tone}`}><T>{CANDIDATE_STATUS[row.status]?.label ?? row.status}</T></span></DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500">{row.email} · {row.phone}{row.submittedAt && <> · <T>dikirim</T> {fmt(row.submittedAt)}</>}</p>

        {row.otp && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <KeyRound size={15} /> <T>Kode OTP calon</T>: <b className="tracking-[0.3em]">{row.otp.code}</b>
            <span className="text-xs">(<T>berlaku s/d</T> {fmt(row.otp.until)})</span>
            <span className="w-full text-[11px] text-amber-800"><T>Email belum tersambung: kirim kode ini ke calon lewat WhatsApp.</T></span>
          </div>
        )}
        {waiting && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="min-w-0 flex-1"><T>Calon belum mengirim data. Undangan dikirim ke email calon; minta calon cek email (termasuk Spam).</T></span>
            {canEdit && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendInvite(row.id), "Email undangan dikirim ulang.")}><T>Kirim ulang undangan</T></Button>}
          </div>
        )}
        {row.note && (row.status === "DIKEMBALIKAN" || row.status === "DITOLAK") && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"><b><T>Catatan</T>:</b> {row.note}</p>}

        {row.status === "WAWANCARA" && (
          <>
            <fieldset disabled={!canEdit} className="min-w-0"><InterviewForm value={iv} onChange={setIv} master={master} /></fieldset>
            {missingInterview(iv).length > 0 && <p className="text-xs text-amber-700"><T>Belum lengkap</T>: {missingInterview(iv).map((m) => t(m)).join(", ")}</p>}
          </>
        )}
        {row.status === "APPROVAL_WAWANCARA" && row.interview && <InterviewSummary interview={row.interview} />}
        {row.status === "APPROVAL_WAWANCARA" && row.canDecide && <InterviewDecision candidateId={row.id} onDone={onClose} />}
        {pendingWorkflow && row.interview && <InterviewSummary interview={row.interview} />}
        {pendingWorkflow && row.canDecide && <InterviewDecision candidateId={row.id} onDone={onClose} />}
        {!inInterview && !pendingWorkflow && row.interview?.approval && (
          <details className="rounded-2xl border border-sky-100 bg-sky-50/50 px-4 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-sky-800"><MessagesSquare size={14} className="mr-1 inline" /> <T>{row.interview.skipped ? "Jejak approval" : "Hasil wawancara & tawaran kerja"}</T></summary>
            <div className="mt-3"><InterviewSummary interview={row.interview} /></div>
          </details>
        )}

        {!waiting && !inInterview && (
          <>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
              {([["data", "Data Pribadi"], ["job", "Data Pekerjaan (HRD)"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-1.5 ${tab === k ? "bg-white font-semibold shadow-sm" : "text-gray-500"}`}><T>{l}</T></button>
              ))}
            </div>
            {tab === "data" ? (
              <div className="rounded-2xl bg-gray-50 p-3"><CandidateDataForm value={data} onChange={setData} disabled={ro} /></div>
            ) : (
              <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs"><T>Employee ID</T></Label>
                  <Input value={job.employeeId} disabled={ro} onChange={(e) => setJ("employeeId", e.target.value.toUpperCase())} /></div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Status kerja</T></Label>
                  <select value={job.employmentStatus} disabled={ro || locked} onChange={(e) => setJ("employmentStatus", e.target.value)} className={select}>
                    <option value="KONTRAK">{t("Kontrak")}</option><option value="TETAP">{t("Tetap")}</option>
                  </select></div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Cabang</T></Label>{masterSelect("branch", master.branches)}</div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Departemen</T></Label>{masterSelect("departmentName", master.departments)}</div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Jabatan</T></Label>{masterSelect("position", master.positions)}</div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Calon atasan langsung</T></Label>
                  <select value={job.managerId} disabled={ro} className={select}
                    onChange={(e) => setJob((j) => ({ ...j, managerId: e.target.value, managerName: master.managers.find((m) => m.value === e.target.value)?.label ?? "" }))}>
                    <option value="">—</option>
                    {master.managers.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select></div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Tanggal masuk</T></Label>
                  <Input type="date" value={job.joinDate} disabled={ro} onChange={(e) => setJ("joinDate", e.target.value)} /></div>
                {job.employmentStatus === "KONTRAK" && (
                  <div className="space-y-1.5"><Label className="text-xs"><T>Tanggal akhir kontrak</T></Label>
                    <Input type="date" value={job.contractEndDate} disabled={ro} onChange={(e) => setJ("contractEndDate", e.target.value)} /></div>
                )}
                {row.status === "SIAP_DAFTAR" && (
                  <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800 sm:col-span-2"><T>Status kerja dan jabatan mengikuti data yang sudah disetujui approver. Isi Employee ID dan sesuaikan penempatan bila perlu, lalu Daftarkan Karyawan.</T></p>
                )}
                {viaInterview && row.interview && (
                  <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 sm:col-span-2">
                    <T>Status kerja, jabatan, dan gaji pokok</T> (<b>{rupiah(row.interview.offer.salary)}</b>) <T>mengikuti tawaran yang sudah disetujui di approval wawancara. Gaji pokok dicatat otomatis mulai tanggal masuk.</T>
                  </p>
                )}
              </div>
            )}
            {!closed && missing.length > 0 && <p className="text-xs text-amber-700"><T>Belum lengkap</T>: {missing.map((m) => t(m)).join(", ")}</p>}
          </>
        )}

        {password && (
          <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <p className="font-semibold"><T>Karyawan baru dibuat.</T></p>
            <p><T>Password awal</T>: <b className="font-mono">{password}</b> — <T>berikan ke karyawan untuk login Portal (dengan Employee ID atau email). Password ini hanya ditampilkan sekali.</T></p>
          </div>
        )}
        <MsgBox msg={msg} />

        {!closed && canEdit && (row.status === "DIKIRIM" || row.status === "DIKEMBALIKAN" || row.status === "MENUNGGU_APPROVAL" || (canApprove && row.status === "WAWANCARA")) && (
          <div className="space-y-1.5"><Label className="text-xs"><T>Catatan (untuk mengembalikan ke calon / menolak)</T></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Contoh: No. KTP tidak sesuai dokumen")} /></div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {!closed && canEdit && (
              <Button variant="outline" disabled={pending} className="gap-1.5 text-rose-600"
                onClick={() => { if (window.confirm(t("Hapus calon karyawan ini?"))) run(() => deleteCandidate(row.id), "Calon dihapus.", onClose); }}><Trash2 size={14} /> <T>Hapus</T></Button>
            )}
            {canEdit && (row.status === "DIKIRIM" || row.status === "MENUNGGU_APPROVAL") && (
              <Button variant="outline" disabled={pending} className="gap-1.5" onClick={() => run(() => returnToCandidate(row.id, note), "Dikembalikan ke calon dan diberi tahu lewat email.", onClose)}><Undo2 size={14} /> <T>Kembalikan ke Calon</T></Button>
            )}
            {canApprove && (legacyApproval || row.status === "WAWANCARA") && (
              <Button variant="outline" disabled={pending} className="gap-1.5 text-rose-600"
                onClick={() => { if (window.confirm(t("Tolak calon karyawan ini?"))) run(() => rejectCandidate(row.id, note), "Calon ditolak.", onClose); }}><XCircle size={14} /> <T>Tolak</T></Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && row.status === "WAWANCARA" && (
              <>
                <Button variant="outline" disabled={pending} onClick={() => run(() => saveInterview(row.id, iv), "Tersimpan.")}><T>Simpan</T></Button>
                <Button disabled={pending} className="gap-1.5" onClick={() => run(() => submitInterview(row.id, iv), "Hasil wawancara diajukan ke approver.", onClose)}>
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <T>Ajukan Approval Wawancara</T></Button>
              </>
            )}
            {canEdit && !closed && !waiting && !inInterview && (
              <Button variant="outline" disabled={pending} onClick={() => run(() => saveCandidateReview(row.id, data, job), "Tersimpan.")}><T>Simpan</T></Button>
            )}
            {canEdit && ready && !password && (
              <Button disabled={pending} className="gap-1.5" onClick={() => {
                if (!window.confirm(t("Daftarkan sebagai karyawan? Data langsung masuk database."))) return;
                setMsg(null);
                start(async () => {
                  const r = await registerCandidate(row.id, data, job);
                  if (r.error) setMsg({ ok: false, text: r.error, list: r.missing }); else setPassword(r.password ?? null);
                });
              }}>{pending ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} <T>Daftarkan Karyawan</T></Button>
            )}
            {canEdit && !viaInterview && (row.status === "DIKIRIM" || row.status === "DIKEMBALIKAN") && (
              <Button disabled={pending} className="gap-1.5" onClick={() => run(() => submitForApproval(row.id, data, job), "Diajukan untuk approval.", onClose)}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <T>Data Cocok, Ajukan Approval</T></Button>
            )}
            {canApprove && legacyApproval && !password && (
              <Button disabled={pending} className="gap-1.5" onClick={() => {
                if (!window.confirm(t("Setujui dan jadikan karyawan?"))) return;
                setMsg(null);
                start(async () => {
                  const r = await saveCandidateReview(row.id, data, job);
                  if (r.error) { setMsg({ ok: false, text: r.error }); return; }
                  const a = await approveCandidate(row.id);
                  if (a.error) setMsg({ ok: false, text: a.error, list: a.missing }); else setPassword(a.password ?? null);
                });
              }}>{pending ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} <T>Setujui, Jadikan Karyawan</T></Button>
            )}
            {row.userId && (
              <Link href={`/portal/admin/karyawan/${row.userId}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <T>Lihat profil karyawan</T> <ArrowUpRight size={14} /></Link>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OnboardingClient({ rows, master, canApprove, interviewOn }: { rows: CandidateRow[]; master: MasterOptions; canApprove: boolean; interviewOn: boolean }) {
  const t = useT();
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<string>("proses");
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;
  const inGroup = (key: string) => rows.filter((r) => (CANDIDATE_GROUPS.find((g) => g.key === key)!.statuses as readonly string[]).includes(r.status));
  const list = inGroup(tab).filter((r) => !q || `${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const stats = [
    ...(interviewOn || count("WAWANCARA") + count("APPROVAL_WAWANCARA") > 0
      ? [{ label: "Tahap wawancara", value: count("WAWANCARA") + count("APPROVAL_WAWANCARA"), icon: MessagesSquare, tone: "from-sky-500 to-cyan-400" }] : []),
    { label: "Diundang / mengisi", value: count("DIUNDANG") + count("DIKEMBALIKAN"), icon: Users, tone: "from-slate-500 to-slate-400" },
    { label: "Menunggu pemeriksaan HRD", value: count("DIKIRIM"), icon: ClipboardCheck, tone: "from-amber-500 to-orange-400" },
    { label: "Menunggu approval", value: count("MENUNGGU_APPROVAL"), icon: UserCheck, tone: "from-violet-500 to-fuchsia-400" },
    { label: "Disetujui", value: count("DISETUJUI"), icon: CheckCircle2, tone: "from-emerald-500 to-teal-400" },
  ];
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Pra-Karyawan</T></h2>
        <p className="text-xs text-gray-400 mt-0.5"><T>{interviewOn
          ? "Calon diwawancara dulu; hasil wawancara dan tawaran kerja disetujui approver, lalu calon mengisi data sendiri lewat /onboarding dan HRD mendaftarkannya sebagai karyawan."
          : "Calon karyawan mengisi data sendiri lewat /onboarding (masuk dengan OTP), HRD mencocokkan dengan dokumen fisik, lalu diajukan untuk approval sesuai workflow."}</T></p>
      </div>
      <main className="max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <div className={`grid grid-cols-2 gap-3 ${stats.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between"><p className="text-xs font-medium text-gray-500"><T>{s.label}</T></p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}><s.icon size={15} /></span></div>
              <p className="mt-2 text-xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2">
          {CANDIDATE_GROUPS.map((g) => (
            <button key={g.key} type="button" onClick={() => setTab(g.key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm ${tab === g.key ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              <T>{g.label}</T> <span className="text-xs opacity-70">{inGroup(g.key).length}</span>
            </button>
          ))}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama / email / HP")} className="h-9 w-56 pl-8" />
          </div>
          {canEdit && (
            <button type="button" onClick={() => setInvite(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85"><UserPlus size={14} /> <T>Undang Calon</T></button>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {list.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500"><T>Belum ada calon karyawan.</T></p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{r.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{r.name}</span>
                      <span className="block truncate text-xs text-gray-500">{r.email} · {r.phone}</span>
                    </span>
                    {r.otp && <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline"><T>OTP aktif</T></span>}
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CANDIDATE_STATUS[r.status]?.tone}`}><T>{CANDIDATE_STATUS[r.status]?.label ?? r.status}</T></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-white/70"><Plus size={11} /> <T>Fitur diatur Super Admin di Pengaturan → Fitur; approver di menu Workflow.</T></p>
      </main>
      {invite && <InviteDialog onClose={() => setInvite(false)} />}
      {open && <DetailDialog key={open.id} row={open} master={master} canApprove={canApprove} onClose={() => setOpenId(null)} />}
    </div>
  );
}
