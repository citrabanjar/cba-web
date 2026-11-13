"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Briefcase, Calendar, Check, Inbox, Loader2, UserPen, X } from "lucide-react";
import { InterviewDecision, InterviewSummary, ReviewForm } from "@/components/portal/InterviewPanel";
import type { Interview, InterviewApproval, Review } from "@/lib/onboarding-interview";
import type { CandidateJob } from "@/lib/onboarding";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import { halfDayLabel } from "@/lib/leave";
import { decideLeave, decideTrip } from "./actions";
import { decideProfileChange } from "../profil/actions";
import { decideSwap } from "../tukar-shift/actions";
import { SWAP_STATUS } from "@/lib/shift-swap-status";
import { fieldLabel, isRegionCode, showValue, type FamilyRow, type ProfileChanges } from "@/lib/profile-change";

export type ApprovalItem = {
  id: string; kind: "CUTI" | "DINAS"; status: string;
  person: { name: string; employeeId: string | null; position: string | null; department: string | null };
  title: string; start: string; end: string; days: number; halfDay: string | null; unpaidDays: number;
  reason: string; note: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string;
  flow: InterviewApproval | null; mine: boolean; // jalur menu Workflow (Level 1..3); null = atasan langsung
};

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
};
const dec = (n: number) => String(n).replace(".", ",");

export type ProfileItem = {
  id: string; status: string; person: ApprovalItem["person"]; changes: ProfileChanges; family: FamilyRow[] | null;
  reason: string | null; note: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string;
};

export type SwapItem = {
  id: string; date: string; status: string; requester: ApprovalItem["person"]; partner: ApprovalItem["person"];
  requesterShift: string; partnerShift: string; reason: string | null; note: string | null;
  mine: boolean; managerA: string | null; managerB?: string | null; decidedBy: string | null;
};

export type InterviewItem = {
  id: string; name: string; email: string; phone: string; status: string; statusLabel: string; interview: Interview; job: CandidateJob; mine: boolean;
  review: Review | null; // penilaian saya yang belum dikirim (pewawancara)
};
type OfferMaster = { branches: string[]; departments: string[]; positions: string[]; managers: { value: string; label: string }[] } | null;

type TabKey = "menunggu" | "riwayat" | "data" | "swap" | "wawancara";

export default function PersetujuanClient({ items, profiles, swaps, interviews, master = null }: { items: ApprovalItem[]; profiles: ProfileItem[] | null; swaps: SwapItem[]; interviews: InterviewItem[]; master?: OfferMaster }) {
  const [tab, setTab] = useState<TabKey>(() =>
    interviews.some((i) => i.mine) ? "wawancara" : items.some((i) => i.status === "PENDING") ? "menunggu" : swaps.some((s) => s.mine) ? "swap"
      : profiles?.some((p) => p.status === "PENDING") ? "data" : "menunggu");
  const pending = items.filter((i) => i.status === "PENDING" && i.mine).sort((a, b) => a.start.localeCompare(b.start));
  const done = items.filter((i) => i.status !== "PENDING" || !i.mine).sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const tabs: [TabKey, string, number][] = [
    ["menunggu", "Cuti & Dinas", pending.length],
    ["riwayat", "Riwayat 60 hari", done.length],
    ["swap", "Tukar Shift", swaps.filter((s) => s.mine).length],
    ...(profiles ? [["data", "Perubahan Data", profiles.filter((p) => p.status === "PENDING").length] as [TabKey, string, number]] : []),
    ...(interviews.length ? [["wawancara", "Pra-Karyawan", interviews.filter((i) => i.mine).length] as [TabKey, string, number]] : []),
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex gap-1 rounded-2xl border border-gray-200 bg-white p-1.5">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm ${tab === k ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <T>{l}</T> <span className="text-xs opacity-70">{n}</span>
          </button>
        ))}
      </div>
      {tab === "wawancara" ? (
        [...interviews].sort((a, b) => Number(b.mine) - Number(a.mine)).map((i) => <InterviewCard master={master} key={i.id} item={i} />)
      ) : tab === "swap" ? (
        swaps.length === 0 ? <Empty text="Tidak ada pengajuan tukar shift." /> : [...swaps]
          .sort((a, b) => Number(b.mine) - Number(a.mine) || a.date.localeCompare(b.date))
          .map((s) => <SwapCard key={s.id} s={s} />)
      ) : tab === "data" && profiles ? (
        profiles.length === 0 ? <Empty text="Tidak ada pengajuan perubahan data." /> : [...profiles]
          .sort((a, b) => Number(b.status === "PENDING") - Number(a.status === "PENDING") || b.createdAt.localeCompare(a.createdAt))
          .map((p) => <ProfileCard key={p.id} item={p} />)
      ) : (tab === "menunggu" ? pending : done).length === 0 ? (
        <Empty text={tab === "menunggu" ? "Tidak ada pengajuan yang menunggu persetujuan Anda." : "Belum ada riwayat."} />
      ) : (tab === "menunggu" ? pending : done).map((i) => <Card key={`${i.kind}-${i.id}`} item={i} />)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white/70 p-10 text-center">
      <Inbox size={22} className="text-gray-300" />
      <p className="text-sm text-gray-500"><T>{text}</T></p>
    </div>
  );
}

function Card({ item: i }: { item: ApprovalItem }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const st = STATUS[i.status] ?? { label: i.status, cls: "bg-gray-100 text-gray-600" };
  const Icon = i.kind === "CUTI" ? Calendar : Briefcase;
  const decide = (approve: boolean) => start(async () => {
    setError("");
    const fn = i.kind === "CUTI" ? decideLeave : decideTrip;
    const r = await fn(i.id, approve, note);
    if (r.error) setError(r.error);
  });
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${i.kind === "CUTI" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{i.person.name} <span className="text-xs font-normal text-gray-400">{[i.person.employeeId, i.person.position, i.person.department].filter(Boolean).join(" · ")}</span></p>
          <p className="mt-0.5 text-sm text-gray-800">{t(i.title)}</p>
          <p className="text-xs text-gray-500">
            {formatDate(new Date(i.start))}{i.end !== i.start && <> – {formatDate(new Date(i.end))}</>} · {dec(i.days)} <T>hari</T>
            {halfDayLabel(i.halfDay) && <> · {t(halfDayLabel(i.halfDay)!)}</>}
          </p>
          {i.unpaidDays > 0 && <p className="mt-1 text-xs text-amber-700">{dec(i.unpaidDays)} <T>hari melebihi saldo dan masuk cuti di luar tanggungan.</T></p>}
          <p className="mt-1.5 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{i.reason}</p>
          {i.flow && (
            <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
              {i.flow.steps.map((s, n) => (
                <span key={s.id + n} className={s.decision === "SETUJU" ? "text-emerald-700" : s.decision === "TOLAK" ? "text-rose-700" : ""}>
                  <T>Level</T> {n + 1}: {s.name}{s.by && s.by !== s.name ? ` (${s.by})` : ""} {s.decision === "SETUJU" ? "✓" : s.decision === "TOLAK" ? "✗" : "…"}{n < i.flow!.steps.length - 1 && " →"}
                </span>
              ))}
            </p>
          )}
          {i.status !== "PENDING" && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              {i.decidedBy ?? "—"}{i.decidedAt && <> · {formatDate(new Date(i.decidedAt))}</>}{i.note && <> · <T>Catatan</T>: {i.note}</>}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
      </div>
      {i.status === "PENDING" && i.mine && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(rejecting ? "Alasan penolakan (wajib)" : "Catatan untuk karyawan (opsional)")}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
          {error && <p className="text-xs text-rose-600"><T>{error}</T></p>}
          <div className="flex justify-end gap-2">
            {rejecting ? (
              <>
                <button type="button" disabled={pending} onClick={() => { setRejecting(false); setError(""); }} className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
                <button type="button" disabled={pending} onClick={() => decide(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Tolak pengajuan</T>
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={() => setRejecting(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><X size={13} /> <T>Tolak</T></button>
                <button type="button" disabled={pending} onClick={() => decide(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Setujui</T>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Pengajuan perubahan data pribadi: data lama → data baru, Setujui (langsung diterapkan) atau Tolak (alasan wajib).
function ProfileCard({ item: p }: { item: ProfileItem }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const st = STATUS[p.status] ?? { label: p.status, cls: "bg-gray-100 text-gray-600" };
  const decide = (approve: boolean) => start(async () => {
    setError("");
    const r = await decideProfileChange(p.id, approve, note);
    if (r.error) setError(r.error);
  });
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><UserPen size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{p.person.name} <span className="text-xs font-normal text-gray-400">{[p.person.employeeId, p.person.position, p.person.department].filter(Boolean).join(" · ")}</span></p>
          <p className="text-xs text-gray-500"><T>Diajukan</T> {formatDate(new Date(p.createdAt))}</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <tr><th className="px-3 py-1.5"><T>Data</T></th><th className="px-3 py-1.5"><T>Sebelumnya</T></th><th className="px-3 py-1.5"><T>Menjadi</T></th></tr>
              </thead>
              <tbody>
                {Object.entries(p.changes).filter(([k]) => !isRegionCode(k)).map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium text-gray-700">{t(fieldLabel(k))}</td>
                    <td className="px-3 py-1.5 text-gray-400">{t(showValue(k, v.old))}</td>
                    <td className="px-3 py-1.5 font-semibold text-gray-900">{t(showValue(k, v.new))}</td>
                  </tr>
                ))}
                {p.family && (
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium text-gray-700"><T>Keluarga</T></td>
                    <td className="px-3 py-1.5 text-gray-400">—</td>
                    <td className="px-3 py-1.5 font-semibold text-gray-900">{p.family.map((f) => `${f.name} (${t(f.relation)}${f.idNumber ? `, ${f.idNumber}` : ""})`).join("; ") || t("Dikosongkan")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {p.reason && <p className="mt-1.5 text-xs text-gray-600"><T>Alasan</T>: {p.reason}</p>}
          {p.status !== "PENDING" && <p className="mt-1.5 text-[11px] text-gray-400">{p.decidedBy ?? "—"}{p.decidedAt && <> · {formatDate(new Date(p.decidedAt))}</>}{p.note && <> · <T>Catatan</T>: {p.note}</>}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
      </div>
      {p.status === "PENDING" && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(rejecting ? "Alasan penolakan (wajib)" : "Catatan untuk karyawan (opsional)")}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
          {error && <p className="text-xs text-rose-600"><T>{error}</T></p>}
          <div className="flex justify-end gap-2">
            {rejecting ? (
              <>
                <button type="button" disabled={pending} onClick={() => { setRejecting(false); setError(""); }} className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
                <button type="button" disabled={pending} onClick={() => decide(false)} className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Tolak pengajuan</T>
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={() => setRejecting(true)} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><X size={13} /> <T>Tolak</T></button>
                <button type="button" disabled={pending} onClick={() => decide(true)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Setujui & terapkan</T>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Tukar shift: pemohon & rekan, shift sebelum → sesudah, status persetujuan kedua atasan.
function SwapCard({ s }: { s: SwapItem }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const st = SWAP_STATUS[s.status] ?? { label: s.status, cls: "bg-gray-100 text-gray-600" };
  const decide = (approve: boolean) => start(async () => {
    setError("");
    const r = await decideSwap(s.id, approve, note);
    if (r.error) setError(r.error);
  });
  const who = (p: SwapItem["requester"]) => <>{p.name} <span className="text-xs font-normal text-gray-400">{[p.employeeId, p.department].filter(Boolean).join(" · ")}</span></>;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ArrowLeftRight size={17} /></span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-gray-900">{t("Tukar Shift")} · {formatDate(new Date(s.date))}</p>
          <p className="text-sm text-gray-800"><T>Pemohon</T>: {who(s.requester)} — <b>{s.requesterShift}</b> → <b>{s.partnerShift}</b></p>
          <p className="text-sm text-gray-800"><T>Rekan</T>: {who(s.partner)} — <b>{s.partnerShift}</b> → <b>{s.requesterShift}</b></p>
          {s.reason && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{s.reason}</p>}
          <p className="text-[11px] text-gray-400">
            <T>Atasan pemohon</T>: {s.managerA ?? t("menunggu")}{s.managerB !== undefined && <> · <T>Atasan rekan</T>: {s.managerB ?? t("menunggu")}</>}
            {s.note && <> · <T>Catatan</T>: {s.note}</>}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
      </div>
      {s.mine && s.status === "MENUNGGU_ATASAN" && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(rejecting ? "Alasan penolakan (wajib)" : "Catatan untuk karyawan (opsional)")}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
          {error && <p className="text-xs text-rose-600"><T>{error}</T></p>}
          <div className="flex justify-end gap-2">
            {rejecting ? (
              <>
                <button type="button" disabled={pending} onClick={() => { setRejecting(false); setError(""); }} className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
                <button type="button" disabled={pending} onClick={() => decide(false)} className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Tolak pengajuan</T>
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={() => setRejecting(true)} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><X size={13} /> <T>Tolak</T></button>
                <button type="button" disabled={pending} onClick={() => decide(true)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Setujui</T>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Approval Pra-Karyawan: hasil wawancara atau data calon.
function InterviewCard({ item, master }: { item: InterviewItem; master: OfferMaster }) {
  const router = useRouter();
  return (
    <div className={`space-y-3 rounded-2xl border bg-white p-4 ${item.mine ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{item.name}</p>
          <p className="text-xs text-gray-500">{item.email} · {item.phone}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600"><T>{item.statusLabel}</T></span>
      </div>
      <InterviewSummary interview={item.interview} job={item.job} />
      {item.review && master && (
        <ReviewForm candidateId={item.id} review={item.review} offer={item.interview.offer} master={master} onDone={() => router.refresh()} />
      )}
      {item.mine && !item.review && <InterviewDecision candidateId={item.id} onDone={() => router.refresh()} />}
    </div>
  );
}
