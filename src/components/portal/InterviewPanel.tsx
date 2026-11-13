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
type Master = { branches: string[]; departments: string[]; positions: string[]; managers?: { value: string; label: string }[] };

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label className="text-xs"><T>{label}</T></Label>{children}</div>;
}

// Tawaran kerja (diisi HRD atau pewawancara selama tahap wawancara; ikut disetujui approver).
export function OfferForm({ value, onChange, master }: { value: Offer; onChange: (v: Offer) => void; master: Master }) {
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
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:col-span-2"><T>Tawaran kerja (ikut disetujui approver)</T></p>
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
      <div className="bg-white rounded-2xl"><OfferForm value={offer} onChange={(v) => { setMsg(null); setOffer(v); }} master={master} /></div>
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

type JobInfo = { position: string; departmentName: string; branch: string; employmentStatus: string; joinDate: string; contractEndDate: string; managerName?: string };

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
          {row("Calon atasan langsung", job.managerName || "—")}
          {row("Status kerja", t(job.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"))}
          {row("Tanggal masuk", fmtDate(job.joinDate))}
          {job.employmentStatus !== "TETAP" && row("Akhir kontrak", fmtDate(job.contractEndDate))}
        </div>
      )}
      {!i.skipped && i.reviews.length > 0 && (() => {
        // Usulan tawaran per pewawancara, bersusun ke bawah; isian yang berbeda antar-pewawancara di-highlight.
        const offers = i.reviews.filter((r) => r.at && r.offer).map((r) => r.offer!);
        const differs = (k: keyof Offer) => offers.length > 1 && new Set(offers.map((o) => o[k])).size > 1;
        const offerRow = (k: keyof Offer, l: string, v: React.ReactNode) => (
          <div key={k} className={`flex justify-between gap-3 rounded-md px-2 py-1 ${differs(k) ? "bg-amber-100 ring-1 ring-amber-300" : ""}`}>
            <span className="text-gray-500"><T>{l}</T></span><span className="text-right font-medium text-gray-800">{v}</span>
          </div>
        );
        return i.reviews.map((rv, n) => (
          // Bisa dibuka-tutup supaya tidak terlalu panjang; saat tertutup tampil ringkasan satu baris.
          <details key={rv.id} className="group rounded-2xl border border-gray-200 text-sm sm:col-span-2">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <ChevronDown size={15} className="text-gray-400 transition group-open:rotate-180" />
              {rv.at ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Clock size={15} className="text-amber-500" />}
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>Pewawancara</T> {n + 1}</span>
              <span className="font-semibold text-gray-800">{rv.name}</span>
              {rv.at ? (
                <span className="text-xs text-gray-600">
                  · <T>Nilai</T> {rv.score} · {t(label(RECOMMENDATIONS, rv.recommendation))}
                  {rv.offer && <> · <span className={differs("salary") ? "rounded bg-amber-100 px-1 font-semibold" : "font-semibold"}>{rupiah(rv.offer.salary)}</span></>}
                </span>
              ) : <span className="text-xs text-gray-500">· <T>belum menilai</T></span>}
            </summary>
            {rv.at && (
              <div className="grid gap-4 border-t border-gray-100 px-4 py-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase text-gray-400"><T>Penilaian</T></p>
                  {row("Tanggal", fmtDate(rv.date))}
                  {row("Nilai", t(label(SCORES, rv.score)))}
                  {row("Rekomendasi", t(label(RECOMMENDATIONS, rv.recommendation)))}
                  {rv.notes && <p className="mt-1 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">“{rv.notes}”</p>}
                </div>
                {rv.offer && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase text-gray-400"><T>Tawaran kerja</T></p>
                    {offerRow("position", "Jabatan", rv.offer.position || "—")}
                    {offerRow("departmentName", "Departemen", rv.offer.departmentName || "—")}
                    {offerRow("branch", "Cabang", rv.offer.branch || "—")}
                    {offerRow("managerId", "Calon atasan langsung", rv.offer.managerName || "—")}
                    {offerRow("employmentStatus", "Status kerja", t(rv.offer.employmentStatus === "TETAP" ? "Tetap" : "Kontrak"))}
                    {offerRow("salary", "Gaji pokok", <b>{rupiah(rv.offer.salary)}</b>)}
                    {offerRow("joinDate", "Tanggal masuk", fmtDate(rv.offer.joinDate))}
                    {rv.offer.employmentStatus === "KONTRAK" && offerRow("contractEndDate", "Akhir kontrak", fmtDate(rv.offer.contractEndDate))}
                  </div>
                )}
              </div>
            )}
          </details>
        ));
      })()}
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
      {!i.skipped && (i.reviews.every((r) => !r.offer) || !!i.approvedAt) && (
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
export function InterviewDecision({ candidateId, choices = [], onDone }: { candidateId: string; choices?: { id: string; name: string }[]; onDone?: () => void }) {
  const t = useT();
  const [note, setNote] = useState("");
  // Lebih dari satu usulan tawaran: approver memilih tawaran final (keputusan akhir).
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "SETUJU" | "TOLAK") => {
    if (d === "TOLAK" && !window.confirm(t("Tolak calon karyawan ini?"))) return;
    setMsg(null);
    start(async () => {
      const r = await decideInterview(candidateId, d, note, pick);
      if (r.error) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: d === "TOLAK" ? "Calon ditolak." : !r.done ? "Disetujui. Menunggu approver berikutnya." : r.ready ? "Disetujui semua. HRD tinggal mendaftarkan karyawan." : r.emailed ? "Disetujui semua. Undangan isi data sudah dikirim ke email calon." : "Disetujui semua. Email undangan gagal terkirim: HRD bisa kirim ulang dari menu Pra-Karyawan." });
      onDone?.();
    });
  };
  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-sm font-semibold text-amber-900"><T>Giliran Anda memberi keputusan.</T></p>
      {choices.length > 1 && (
        <div className="space-y-1.5 rounded-xl bg-white p-3">
          <p className="text-xs font-semibold text-gray-700"><T>Tawaran kerja final (keputusan akhir)</T></p>
          {choices.map((c, n) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
              <input type="radio" name={`pick-${candidateId}`} checked={pick === c.id} onChange={() => setPick(c.id)} className="h-4 w-4 accent-[#BE353F]" />
              <T>Tawaran Pewawancara</T> {n + 1} · {c.name}
            </label>
          ))}
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("Catatan approver (wajib bila menolak)")}
        className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm" />
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} className="gap-1.5 text-rose-600" onClick={() => decide("TOLAK")}><X size={14} /> <T>Tolak</T></Button>
        <Button disabled={pending || (choices.length > 1 && !pick)} className="gap-1.5" onClick={() => decide("SETUJU")}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} <T>Setujui</T></Button>
      </div>
    </div>
  );
}
