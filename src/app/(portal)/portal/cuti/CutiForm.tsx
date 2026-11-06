"use client";

import { useActionState, useState } from "react";
import { CalendarDays, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { submitLeave, cancelLeave } from "./actions";
import type { LeaveRequest } from "@prisma/client";
import { T, useT } from "@/components/i18n";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  TAHUNAN: "Cuti Tahunan",
  SAKIT: "Sakit",
  MELAHIRKAN: "Melahirkan",
  PENTING: "Keperluan Penting",
  LAINNYA: "Lainnya",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

function formatDateID(d: Date | string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  requests: LeaveRequest[];
}

export default function CutiForm({ requests }: Props) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(submitLeave, undefined);
  const [showForm, setShowForm] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    await cancelLeave(id);
    setCancellingId(null);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Tombol ajukan baru */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-ink text-white font-semibold py-3 rounded-xl hover:bg-brand transition-colors flex items-center justify-center gap-2"
      >
        <CalendarDays size={18} />
        {showForm ? <T>{"Tutup Form"}</T> : <T>{"Ajukan Cuti"}</T>}
      </button>

      {/* Form pengajuan */}
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
              <AlertTriangle size={16} />
              <T>{state.error}</T>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Jenis Cuti</T></label>
              <select
                name="leaveType"
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white"
              >
                <option value=""><T>-- Pilih Jenis --</T></option>
                {Object.entries(LEAVE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Tanggal Mulai</T></label>
                <input
                  type="date"
                  name="startDate"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Tanggal Akhir</T></label>
                <input
                  type="date"
                  name="endDate"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Alasan</T></label>
              <textarea
                name="reason"
                required
                rows={3}
                placeholder={t("Tuliskan alasan pengajuan cuti...")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {isPending ? <T>{"Memproses..."}</T> : <T>{"Kirim Pengajuan"}</T>}
            </button>
          </form>
        </div>
      )}

      {/* Riwayat cuti */}
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
                      <T>{LEAVE_TYPE_LABELS[req.type] ?? req.type}</T>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDateID(req.startDate)}
                      {req.totalDays > 1 ? ` – ${formatDateID(req.endDate)}` : ""}
                      {" · "}{req.totalDays} <T>hari</T>
                    </p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2"><T>{req.reason}</T></p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[req.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {req.status}
                    </span>
                    {req.status === "PENDING" && (
                      <button
                        onClick={() => handleCancel(req.id)}
                        disabled={cancellingId === req.id}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
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
