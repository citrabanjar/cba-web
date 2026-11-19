"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Paperclip, Stethoscope, X } from "lucide-react";
import { shrinkImage } from "@/lib/image-shrink";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { T, useT } from "@/components/i18n";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { CLAIM_STATUS, FILE_KINDS, type FileKind } from "@/lib/reimburse-shared";
import { cancelClaim, previewClaim, submitClaim } from "./actions";

type Claim = {
  id: string; treatDate: string; provider: string; amount: number; payout: number; status: string;
  decidedBy: string | null; decision: string | null; files: { id: string; kind: string; name: string }[];
};
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export default function ReimburseForm({ enabled, today, percent, needDoctorLetter, plafon, claims }: {
  enabled: boolean; today: string; percent: number; needDoctorLetter: boolean;
  plafon: { cap: number; used: number; from: string; to: string }; claims: Claim[];
}) {
  const open = claims.filter((c) => c.status === "PENDING" || c.status === "APPROVED");
  const t = useT();
  const router = useRouter();
  const [treatDate, setTreatDate] = useState(today);
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Record<FileKind, File[]>>({ KUITANSI: [], SURAT_DOKTER: [], RESEP: [] });
  const [quote, setQuote] = useState<{ payout: number; remaining: number | null } | null>(null);
  const [pending, start] = useTransition();
  const remaining = plafon.cap > 0 ? Math.max(0, plafon.cap - plafon.used) : null;

  // Perkiraan yang dibayarkan, mengikuti persentase dan sisa plafon.
  useEffect(() => {
    if (!amount || !treatDate) return;
    const h = setTimeout(() => { void previewClaim(treatDate, amount).then((q) => setQuote(q ? { payout: q.payout, remaining: q.remaining } : null)); }, 400);
    return () => clearTimeout(h);
  }, [amount, treatDate]);

  const pick = (kind: FileKind, list: FileList | null) => start(async () => {
    const shrunk = await Promise.all([...(list ?? [])].slice(0, 3).map(shrinkImage));
    setFiles((f) => ({ ...f, [kind]: [...f[kind], ...shrunk].slice(0, 3) }));
  });
  const send = () => start(async () => {
    const form = new FormData();
    form.set("treatDate", treatDate); form.set("provider", provider); form.set("amount", String(amount)); form.set("note", note);
    for (const k of FILE_KINDS) files[k.key].forEach((f, i) => form.append(`file_${k.key}_${i}`, f));
    const r = await submitClaim(form);
    if (r.error) { void showNotice(t(r.error), "error"); return; }
    void showNotice(`${t("Reimbursement")} ${rp(r.payout ?? 0)} ${t("diajukan ke")} ${r.approver} ${t("untuk approval.")}`);
    setProvider(""); setAmount(0); setNote(""); setFiles({ KUITANSI: [], SURAT_DOKTER: [], RESEP: [] }); setQuote(null);
    router.refresh();
  });
  const cancel = (id: string) => start(async () => {
    if (!(await askConfirm(t("Batalkan pengajuan reimbursement ini?")))) return;
    const r = await cancelClaim(id);
    if (r.error) void showNotice(t(r.error), "error");
    router.refresh();
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="grid grid-cols-3 gap-3">
        <Box label="Plafon setahun" value={plafon.cap > 0 ? rp(plafon.cap) : t("Tanpa plafon")} />
        <Box label="Terpakai" value={rp(plafon.used)} />
        <Box label="Sisa plafon" value={remaining === null ? "—" : rp(remaining)} strong />
      </div>
      <p className="-mt-3 text-[11px] text-white/70">{formatDate(plafon.from)} – {formatDate(plafon.to)} · <T>Penggantian</T> {percent}% <T>dari kuitansi</T></p>

      {!enabled ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400"><T>Reimbursement pengobatan belum diaktifkan perusahaan.</T></p>
      ) : (
        <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-gray-700"><Stethoscope size={18} className="text-brand" /> <T>Pengajuan Reimbursement</T></h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Tanggal Berobat</T></label><Input type="date" value={treatDate} max={today} onChange={(e) => setTreatDate(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Nominal Kuitansi (Rp)</T></label><Input type="number" min={0} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Klinik / Rumah Sakit / Apotek</T></label><Input value={provider} onChange={(e) => setProvider(e.target.value)} /></div>
          {quote && amount > 0 && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <T>Perkiraan dibayarkan</T>: <b>{rp(quote.payout)}</b>{quote.remaining !== null && quote.payout < Math.round((amount * percent) / 100) && <> · <T>dibatasi sisa plafon</T></>}
            </p>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500"><T>Lampiran</T></p>
            {FILE_KINDS.map((k) => (
              <div key={k.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-gray-700">
                  <T>{k.label}</T>{(k.key === "KUITANSI" || (k.key === "SURAT_DOKTER" && needDoctorLetter)) && <span className="text-brand"> *</span>}
                  {files[k.key].map((f, i) => (
                    <span key={i} className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                      {f.name}
                      <button type="button" aria-label={t("Hapus")} onClick={() => setFiles((x) => ({ ...x, [k.key]: x[k.key].filter((_, j) => j !== i) }))}><X size={11} /></button>
                    </span>
                  ))}
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  <Paperclip size={12} /> <T>Pilih</T>
                  <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { pick(k.key, e.target.files); e.target.value = ""; }} />
                </label>
              </div>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500"><T>Keterangan</T></label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <button type="button" onClick={send} disabled={pending || !amount}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {pending ? <T>Memproses...</T> : <T>Kirim Pengajuan</T>}
          </button>
        </div>
      )}

      {/* Hanya pengajuan yang masih diproses (menunggu persetujuan / menunggu gajian); riwayat tidak ditampilkan. */}
      {open.length > 0 && <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/70"><T>Pengajuan Diproses</T></p>
        {(
          <div className="space-y-3">
            {open.map((c) => (
              <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{c.provider} <span className="text-xs font-normal text-gray-400">· {formatDate(c.treatDate)}</span></p>
                    <p className="mt-0.5 text-xs text-gray-500"><T>Kuitansi</T> {rp(c.amount)} · <T>dibayarkan</T> <b>{rp(c.payout)}</b></p>
                    <p className="mt-1 flex flex-wrap gap-2 text-[11px]">
                      {c.files.map((f) => <a key={f.id} href={`/api/reimburse-file/${f.id}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">{f.name}</a>)}
                    </p>
                    {c.decidedBy && <p className="mt-1 text-[11px] text-gray-400"><T>{c.status === "REJECTED" ? "Ditolak oleh" : "Disetujui oleh"}</T> {c.decidedBy}{c.decision ? ` · ${c.decision}` : ""}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLAIM_STATUS[c.status]?.tone ?? "bg-gray-100 text-gray-500"}`}><T>{CLAIM_STATUS[c.status]?.label ?? c.status}</T></span>
                    {c.status === "PENDING" && (
                      <button type="button" onClick={() => cancel(c.id)} disabled={pending} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><X size={12} /> <T>Batalkan</T></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-3 ${strong ? "border-brand/30" : "border-gray-100"}`}>
      <p className="text-[11px] text-gray-500"><T>{label}</T></p>
      <p className={`mt-0.5 text-sm font-bold ${strong ? "text-brand" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
