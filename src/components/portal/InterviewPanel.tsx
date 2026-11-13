"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2, ChevronDown, Circle, Clock, Loader2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { actionableApprovers, missingReview, RECOMMENDATIONS, rupiah, SCORES, type Interview, type Offer, type Review } from "@/lib/onboarding-interview";
import { decideInterview, saveReview } from "@/app/(portal)/portal/admin/onboarding/actions";

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm disabled:bg-gray-50";
const fmtDate = (s: string) => (s ? new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (s: string) => new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? (v || "—");
export type Master = { branches: string[]; departments: string[]; positions: string[]; managers?: { value: string; label: string }[] };

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label className="text-xs"><T>{label}</T></Label>{children}</div>;
}

// Tawaran kerja (diisi HRD atau pewawancara selama tahap wawancara; ikut disetujui approver).
export function OfferForm({ value, onChange, master, title = "Tawaran kerja (ikut disetujui approver)" }: { value: Offer; onChange: (v: Offer) => void; master: Master; title?: string }) {
  const t = useT();
  const setO = (patch: Partial<Offer>) => onChange({ ...value, ...patch });
  const pick = (k: "branch" | "departmentName" | "position", list: string[]) => (
    <select value={value[k]} onChange={(e) => setO({ [k]: e.target.value })} className={select}>
      <option value="">—</option>
      {[...(value[k] && !list.includes(value[k]) ? [value[k]] : []), ...list].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return (
    <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:col-span-2"><T>{title}</T></p>
      <F label="Departemen">{pick("departmentName", master.departments)}</F>
      <F label="Jabatan">{pick("position", master.positions)}</F>
      <F label="Cabang">{pick("branch", master.branches)}</F>
      <F label="Calon atasan langsung">
        <select value={value.managerId} className={select}
          onChange={(e) => setO({ managerId: e.target.value, managerName: master.managers?.find((m) => m.value === e.target.value)?.label ?? "" })}>
          <option value="">—</option>
          {(master.managers ?? []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </F>
      <F label="Status kerja">
        <select value={value.employmentStatus} onChange={(e) => setO({ employmentStatus: e.target.value })} className={select}>
          <option value="KONTRAK">{t("Kontrak")}</option><option value="TETAP">{t("Tetap")}</option>
        </select>
      </F>
      <F label="Gaji pokok yang ditawarkan (Rp / bulan)"><Input type="number" min={0} value={value.salary} onChange={(e) => setO({ salary: e.target.value })} /></F>
      <F label="Rencana tanggal masuk"><Input type="date" value={value.joinDate} onChange={(e) => setO({ joinDate: e.target.value })} /></F>
      {value.employmentStatus === "KONTRAK" && (
        <F label="Tanggal akhir kontrak"><Input type="date" value={value.contractEndDate} onChange={(e) => setO({ contractEndDate: e.target.value })} /></F>
      )}
    </div>
  );
}

// Pewawancara mengisi penilaiannya sendiri (menu Persetujuan): tanggal, nilai, rekomendasi, catatan + boleh melengkapi tawaran kerja.
export function ReviewForm({ candidateId, review, offer: initialOffer, master, onDone }: { candidateId: string; review: Review; offer: Offer; master: Master; onDone?: () => void }) {
  const t = useT();
  const [r, setR] = useState(review);
  const [offer, setOffer] = useState(initialOffer);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Review>) => { setMsg(null); setR((x) => ({ ...x, ...patch })); };
  const save = (submit: boolean) => {
    if (submit && !window.confirm(t("Kirim penilaian? Setelah dikirim tidak bisa diubah."))) return;
    setMsg(null);
    start(async () => {
      const res = await saveReview(candidateId, r, offer, submit);
      if (res.error) { setMsg({ ok: false, text: res.error, list: res.missing }); if (res.done) onDone?.(); return; }
      setMsg({ ok: true, text: !submit ? "Tersimpan." : res.sent ? "Penilaian terkirim. Semua pewawancara selesai: hasil wawancara diajukan ke approver." : res.done ? "Penilaian terkirim." : "Tersimpan." });
      if (submit) onDone?.();
    });
  };
  const miss = missingReview(r);
  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:col-span-2"><T>Penilaian saya</T></p>
        <F label="Tanggal wawancara"><Input type="date" value={r.date} onChange={(e) => set({ date: e.target.value })} /></F>
        <F label="Nilai">
          <select value={r.score} onChange={(e) => set({ score: e.target.value })} className={select}>
            <option value="">—</option>{SCORES.map((x) => <option key={x.value} value={x.value}>{t(x.label)}</option>)}
          </select>
        </F>
        <F label="Rekomendasi" wide>
          <select value={r.recommendation} onChange={(e) => set({ recommendation: e.target.value })} className={select}>
            <option value="">—</option>{RECOMMENDATIONS.map((x) => <option key={x.value} value={x.value}>{t(x.label)}</option>)}
          </select>
        </F>
        <F label="Catatan pewawancara" wide>
          <textarea value={r.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder={t("Kesan, kelebihan, kekurangan, pengalaman yang relevan")}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
        </F>
      </div>
      <div className="bg-white rounded-2xl"><OfferForm value={offer} onChange={(v) => { setMsg(null); setOffer(v); }} master={master} title="Usulan penempatan saya" /></div>
      {miss.length > 0 && <p className="text-xs text-amber-800"><T>Belum lengkap</T>: {miss.map((m) => t(m)).join(", ")}</p>}
      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          <T>{msg.text}</T>{msg.list && <ul className="mt-1 list-disc pl-5 text-xs">{msg.list.map((x) => <li key={x}><T>{x}</T></li>)}</ul>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={() => save(false)}><T>Simpan</T></Button>
        <Button disabled={pending} className="gap-1.5" onClick={() => save(true)}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} <T>Kirim Penilaian</T></Button>
      </div>
    </div>
  );
}

// Ringkasan data calon untuk pewawancara & approver (tanpa rekening, NPWP, BPJS).
export type CandidateBrief = {
  name: string; email: string; phone: string; birthPlace: string; birthDate: string; gender: string; religion: string;
  maritalStatus: string; idType: string; ktpNumber: string; address: string; addressRegionName: string;
};

// Satu baris perbandingan: kiri informasi (data calon / hasil wawancara / keputusan), kanan usulan penempatan.
function CompareRow({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{left}{right}</div>;
}

// Data calon | Usulan penempatan (HRD), lalu Hasil + Usulan tiap wawancara dan usulan final approver.
// Isian usulan yang berbeda antar-usulan di-highlight; yang sama tidak.
export function ProposalCompare({ interview: i, candidate, showApprovers = true }: { interview: Interview; candidate?: CandidateBrief | null; showApprovers?: boolean }) {
  const t = useT();
  const reviewed = i.reviews.filter((r) => r.at && r.offer);
  const finals = showApprovers ? (i.approval?.steps ?? []).filter((x) => x.decision === "SETUJU" && x.offer) : [];
  const placement = i.placement ?? i.offer;
  const all = [placement, ...reviewed.map((r) => r.offer!), ...finals.map((x) => x.offer!)];
  const differs = (k: keyof Offer) => all.length > 1 && new Set(all.map((o) => o[k] ?? "")).size > 1;
  const row = (l: string, v: React.ReactNode, hi = false) => (
    <div className={`flex justify-between gap-3 rounded-md px-2 py-1 ${hi ? "bg-amber-100 ring-1 ring-amber-300" : ""}`}>
      <span className="text-gray-500"><T>{l}</T></span><span className="text-right font-medium text-gray-800">{v}</span>
    </div>
  );
  const box = (title: string, body: React.ReactNode, tone = "border-gray-200") => (
    <div className={`rounded-2xl border p-4 text-sm ${tone}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>{title}</T></p>{body}
    </div>
  );
  const offerBody = (o: Offer) => <>
    {row("Jabatan", o.position || "—", differs("position"))}
    {row("Departemen", o.departmentName || "—", differs("departmentName"))}
    {row("Cabang", o.branch || "—", differs("branch"))}
    {row("Calon atasan langsung", o.managerName || "—", differs("managerId"))}
    {row("Status kerja", t(o.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"), differs("employmentStatus"))}
    {row("Gaji pokok", <b>{o.salary ? rupiah(o.salary) : "—"}</b>, differs("salary"))}
    {row("Tanggal masuk", fmtDate(o.joinDate), differs("joinDate"))}
    {o.employmentStatus === "KONTRAK" && row("Akhir kontrak", fmtDate(o.contractEndDate), differs("contractEndDate"))}
  </>;
  // Bisa dibuka-tutup supaya tidak terlalu panjang.
  const fold = (key: string, head: React.ReactNode, body: React.ReactNode, open = false) => (
    <details key={key} open={open} className="group rounded-2xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <ChevronDown size={15} className="text-gray-400 transition group-open:rotate-180" />{head}
      </summary>
      <div className="border-t border-gray-100 p-3">{body}</div>
    </details>
  );
  const salaryTag = (o: Offer) => <span className={`font-semibold ${differs("salary") ? "rounded bg-amber-100 px-1" : ""}`}>{o.salary ? rupiah(o.salary) : "—"}</span>;

  return (
    <div className="space-y-3">
      {fold("awal", <><span className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Data calon & usulan penempatan</T></span>
        <span className="text-xs text-gray-600">· {placement.position || "—"} · {salaryTag(placement)}</span></>,
        <CompareRow
          left={box("Data calon karyawan", candidate ? <>
            {row("Nama", candidate.name)}
            {row("Tempat, tanggal lahir", `${candidate.birthPlace || "—"}, ${fmtDate(candidate.birthDate)}`)}
            {row("Jenis kelamin", t(candidate.gender === "L" ? "Laki-laki" : candidate.gender === "P" ? "Perempuan" : candidate.gender || "—"))}
            {row("Status perkawinan", candidate.maritalStatus || "—")}
            {row("Agama", candidate.religion || "—")}
            {row(candidate.idType || "No. identitas", candidate.ktpNumber || "—")}
            {row("No. HP", candidate.phone || "—")}
            {row("Email", candidate.email || "—")}
            {row("Alamat", [candidate.address, candidate.addressRegionName].filter(Boolean).join(", ") || "—")}
          </> : <p className="text-xs text-gray-400">—</p>)}
          right={box("Usulan penempatan (HRD)", offerBody(placement))} />, true)}

      {i.reviews.map((rv, n) => rv.at ? fold(rv.id,
        <><CheckCircle2 size={15} className="text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Wawancara</T> {n + 1}</span>
          <span className="font-semibold text-gray-800">{rv.name}</span>
          <span className="text-xs text-gray-600">· <T>Nilai</T> {rv.score} · {t(label(RECOMMENDATIONS, rv.recommendation))}{rv.offer && <> · {salaryTag(rv.offer)}</>}</span></>,
        <CompareRow
          left={box(`Hasil wawancara ${n + 1}`, <>
            {row("Pewawancara", rv.name)}
            {row("Tanggal", fmtDate(rv.date))}
            {row("Nilai", t(label(SCORES, rv.score)))}
            {row("Rekomendasi", t(label(RECOMMENDATIONS, rv.recommendation)))}
            {rv.notes && <p className="mt-1 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">“{rv.notes}”</p>}
          </>)}
          right={rv.offer ? box(`Usulan wawancara ${n + 1}`, offerBody(rv.offer)) : box(`Usulan wawancara ${n + 1}`, <p className="text-xs text-gray-400">—</p>)} />)
        : (
          <div key={rv.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
            <Clock size={15} className="text-amber-500" /> <T>Wawancara</T> {n + 1} · <b className="text-gray-700">{rv.name}</b> · <T>belum menilai</T>
          </div>
        ))}

      {finals.map((x, n) => fold(`final-${n}`,
        <><CheckCircle2 size={15} className="text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Usulan final</T></span>
          <span className="font-semibold text-gray-800">{x.by || x.name}</span>
          <span className="text-xs text-gray-600">· {salaryTag(x.offer!)}</span></>,
        <CompareRow
          left={box("Keputusan approver", <>
            {row("Approver", x.by || x.name)}
            {row("Keputusan", t("Setuju"))}
            {x.at && row("Waktu", fmtTime(x.at))}
            {x.note && <p className="mt-1 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">“{x.note}”</p>}
          </>)}
          right={box("Usulan final", offerBody(x.offer!), "border-emerald-300 bg-emerald-50/40")} />))}
    </div>
  );
}

type JobInfo = { position: string; departmentName: string; branch: string; employmentStatus: string; joinDate: string; contractEndDate: string; managerName?: string };

// Ringkasan hasil wawancara, tawaran, dan jejak approval (baca saja). Tanpa wawancara: data pekerjaan + jejak approval.
export function InterviewSummary({ interview: i, job, candidate }: { interview: Interview; job?: JobInfo; candidate?: CandidateBrief | null }) {
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
          {row("Calon atasan langsung", job.managerName || "—")}
          {row("Status kerja", t(job.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"))}
          {row("Tanggal masuk", fmtDate(job.joinDate))}
          {job.employmentStatus !== "TETAP" && row("Akhir kontrak", fmtDate(job.contractEndDate))}
        </div>
      )}
      {/* Alur baru: Data calon | Usulan penempatan, lalu Hasil + Usulan tiap wawancara dan usulan final approver. */}
      {!i.skipped && (i.placement || i.reviews.some((r) => r.offer)) && (
        <div className="sm:col-span-2"><ProposalCompare interview={i} candidate={candidate} /></div>
      )}
      {!i.skipped && !(i.placement || i.reviews.some((r) => r.offer)) && i.reviews.length > 0 && (
        <div className="rounded-2xl border border-gray-200 p-4 text-sm sm:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Penilaian pewawancara</T></p>
          {i.reviews.map((rv, n) => (
            <div key={rv.id} className="py-1">
              <b className="text-gray-800">{n + 1}. {rv.name}</b>{" "}
              <span className="text-xs text-gray-600">{rv.at ? <>{fmtDate(rv.date)} · <T>Nilai</T> {rv.score} · {t(label(RECOMMENDATIONS, rv.recommendation))}</> : <T>belum menilai</T>}</span>
              {rv.at && rv.notes && <span className="mt-0.5 block whitespace-pre-line rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600">“{rv.notes}”</span>}
            </div>
          ))}
        </div>
      )}
      {!i.skipped && i.reviews.length === 0 && (
      <div className="rounded-2xl border border-gray-200 p-4 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Hasil wawancara</T></p>
        {row("Tanggal", fmtDate(i.date))}
        {row("Pewawancara", i.interviewer || "—")}
        {row("Nilai", t(label(SCORES, i.score)))}
        {row("Rekomendasi", t(label(RECOMMENDATIONS, i.recommendation)))}
        {i.notes && <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{i.notes}</p>}
      </div>
      )}
      {/* Tawaran final: data lama (tanpa usulan per pewawancara) atau setelah approver memutus. */}
      {!i.skipped && !i.placement && i.reviews.every((r) => !r.offer) && (
      <div className={`rounded-2xl border p-4 text-sm ${i.approvedAt && i.reviews.some((r) => r.offer) ? "border-emerald-300 bg-emerald-50/40 sm:col-span-2" : "border-gray-200"}`}>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><T>{i.approvedAt && i.reviews.some((r) => r.offer) ? "Tawaran kerja final" : "Tawaran kerja"}</T></p>
        {row("Jabatan", i.offer.position || "—")}
        {row("Departemen", i.offer.departmentName || "—")}
        {row("Cabang", i.offer.branch || "—")}
        {row("Calon atasan langsung", i.offer.managerName || "—")}
        {row("Status kerja", t(i.offer.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"))}
        {row("Gaji pokok", <b>{rupiah(i.offer.salary)}</b>)}
        {row("Tanggal masuk", fmtDate(i.offer.joinDate))}
        {i.offer.employmentStatus === "KONTRAK" && row("Akhir kontrak", fmtDate(i.offer.contractEndDate))}
      </div>
      )}
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
                  {s.pick && <span className="block text-xs text-emerald-700"><T>Memilih tawaran dari</T> {s.pick}</span>}
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
export function InterviewDecision({ candidateId, finalOffer, master, onDone }: { candidateId: string; finalOffer?: Offer | null; master?: Master | null; onDone?: () => void }) {
  const t = useT();
  const [note, setNote] = useState("");
  // Jalur wawancara: approver menetapkan usulan final (isian awal = usulan terakhir).
  const [offer, setOffer] = useState<Offer | null>(finalOffer ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "SETUJU" | "TOLAK") => {
    if (d === "TOLAK" && !window.confirm(t("Tolak calon karyawan ini?"))) return;
    setMsg(null);
    start(async () => {
      const r = await decideInterview(candidateId, d, note, d === "SETUJU" ? offer : null);
      if (r.error) { setMsg({ ok: false, text: r.error, list: r.missing }); return; }
      setMsg({ ok: true, text: d === "TOLAK" ? "Calon ditolak." : !r.done ? "Disetujui. Menunggu approver berikutnya." : r.ready ? "Disetujui semua. HRD tinggal mendaftarkan karyawan." : r.emailed ? "Disetujui semua. Undangan isi data sudah dikirim ke email calon." : "Disetujui semua. Email undangan gagal terkirim: HRD bisa kirim ulang dari menu Pra-Karyawan." });
      onDone?.();
    });
  };
  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
      {offer && master && (
        <div className="rounded-2xl bg-white">
          <OfferForm value={offer} onChange={(v) => { setMsg(null); setOffer(v); }} master={master} title="Usulan final (keputusan akhir)" />
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("Catatan approver (wajib bila menolak)")}
        className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm" />
      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          <T>{msg.text}</T>{msg.list && <ul className="mt-1 list-disc pl-5 text-xs">{msg.list.map((x) => <li key={x}><T>{x}</T></li>)}</ul>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} className="gap-1.5 text-rose-600" onClick={() => decide("TOLAK")}><X size={14} /> <T>Tolak</T></Button>
        <Button disabled={pending} className="gap-1.5" onClick={() => decide("SETUJU")}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} <T>Setujui</T></Button>
      </div>
    </div>
  );
}
