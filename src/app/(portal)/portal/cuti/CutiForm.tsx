"use client";

import { useActionState, useState } from "react";
import { CalendarDays, Loader2, CheckCircle2, AlertTriangle, X, Paperclip, Info } from "lucide-react";
import { submitLeave, cancelLeave } from "./actions";
import type { LeaveRequest } from "@prisma/client";
import { T, useT } from "@/components/i18n";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { LEAVE_CATEGORIES, periodLabel, unitLabel } from "@/lib/leave";
import type { BalanceRow } from "@/lib/leave-balance";
import LeaveBalanceCard from "@/components/portal/LeaveBalanceCard";

// Label pengajuan lama (sebelum Setup Leave).
const LEGACY_LABELS: Record<string, string> = {
  TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya",
};

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "Ditolak", cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-500" },
};

export type LeaveOption = {
  id: string; code: string; name: string; category: string; quota: number | null; unit: string; period: string;
  noticeDays: number; needsAttachment: boolean; attachmentNote: string | null; paid: boolean; note: string | null; balance: boolean;
};

type Request = LeaveRequest & { policy: { code: string; name: string } | null };

export default function CutiForm({ requests, options, balances }: { requests: Request[]; options: LeaveOption[]; balances: BalanceRow[] }) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(submitLeave, undefined);
  const [showForm, setShowForm] = useState(false);
  const [policyId, setPolicyId] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const chosen = options.find((o) => o.id === policyId);
  const chosenBalance = chosen?.balance ? balances.find((b) => b.policyId === chosen.id) : undefined;

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    await cancelLeave(id);
    setCancellingId(null);
  };

  const groups = LEAVE_CATEGORIES.map((c) => ({ ...c, items: options.filter((o) => o.category === c.key) })).filter((g) => g.items.length);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Saldo cuti */}
      {balances.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><T>Saldo Cuti</T></p>
          <LeaveBalanceCard rows={balances} compact />
        </div>
      )}

      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-ink text-white font-semibold py-3 rounded-xl hover:bg-brand transition-colors flex items-center justify-center gap-2"
      >
        <CalendarDays size={18} />
        {showForm ? <T>{"Tutup Form"}</T> : <T>{"Ajukan Cuti"}</T>}
      </button>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-700"><T>Pengajuan Cuti</T></h2>

          {state && "ok" in state && (
            <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} />
              <T>Pengajuan cuti</T> {state.days} <T>hari berhasil disubmit. Menunggu persetujuan HRD.</T>
            </div>
          )}
          {state && "error" in state && (
            <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              <T>{state.error}</T>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Jenis Cuti</T></label>
              <select name="policyId" required value={policyId} onChange={(e) => setPolicyId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white">
                <option value="">{t("-- Pilih Jenis --")}</option>
                {groups.map((g) => (
                  <optgroup key={g.key} label={t(g.label)}>
                    {g.items.map((o) => <option key={o.id} value={o.id}>{t(o.name)}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {chosen && (
              <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-600 space-y-1">
                <p className="flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    {chosenBalance
                      ? <><T>Sisa saldo yang bisa diajukan</T>: <b>{Math.max(0, Math.round((chosenBalance.balance - chosenBalance.pending) * 100) / 100)}</b> <T>hari</T></>
                      : chosen.quota === null ? <T>Lama cuti sesuai kebutuhan / surat dokter.</T>
                      : <><T>Paling banyak</T> <b>{chosen.quota}</b> <T>{unitLabel(chosen.unit)}</T> <T>{periodLabel(chosen.period)}</T>.</>}
                    {!chosen.paid && <> · <b className="text-rose-600"><T>Tanpa upah</T></b></>}
                    {chosen.noticeDays > 0 && <> · <T>Ajukan paling lambat</T> H-{chosen.noticeDays}</>}
                  </span>
                </p>
                {chosen.needsAttachment && (
                  <p className="flex items-start gap-1.5 text-amber-700"><Paperclip size={13} className="mt-0.5 shrink-0" />
                    <span><T>Siapkan lampiran</T>: {chosen.attachmentNote ? t(chosen.attachmentNote) : t("dokumen pendukung")} — <T>serahkan ke HRD.</T></span>
                  </p>
                )}
                {chosen.unit === "HARI_KERJA" && <p className="text-gray-400"><T>Jumlah hari dihitung dari hari kerja sesuai jadwal Anda (hari libur tidak dihitung).</T></p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Tanggal Mulai</T></label>
                <Input type="date" name="startDate" required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Tanggal Akhir</T></label>
                <Input type="date" name="endDate" required />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Alasan</T></label>
              <textarea name="reason" required rows={3} placeholder={t("Tuliskan alasan pengajuan cuti...")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>

            <button type="submit" disabled={isPending}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {isPending ? <T>{"Memproses..."}</T> : <T>{"Kirim Pengajuan"}</T>}
            </button>
          </form>
        </div>
      )}

      {/* Riwayat pengajuan */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><T>Riwayat Pengajuan</T></p>
        {requests.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-8 text-center">
            <CalendarDays size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400"><T>Belum ada pengajuan cuti</T></p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800">
                      {req.policy ? <>{t(req.policy.name)} <span className="text-[11px] font-medium text-gray-400">{req.policy.code}</span></> : <T>{LEGACY_LABELS[req.type] ?? req.type}</T>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(req.startDate)}
                      {req.endDate.getTime() !== req.startDate.getTime() ? ` – ${formatDate(req.endDate)}` : ""}
                      {" · "}{req.totalDays} <T>hari</T>
                    </p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{req.reason}</p>
                    {req.note && <p className="text-xs text-gray-500 mt-1"><T>Catatan</T>: {req.note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[req.status]?.cls ?? "bg-gray-100 text-gray-500"}`}>
                      <T>{STATUS[req.status]?.label ?? req.status}</T>
                    </span>
                    {req.status === "PENDING" && (
                      <button onClick={() => handleCancel(req.id)} disabled={cancellingId === req.id}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                        {cancellingId === req.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        <T>Batalkan</T>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
