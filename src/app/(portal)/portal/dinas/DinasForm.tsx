"use client";

import { useActionState, useState } from "react";
import { Briefcase, Loader2, CheckCircle2, AlertTriangle, X, MapPin } from "lucide-react";
import { submitBusinessTrip, cancelBusinessTrip } from "./actions";
import type { BusinessTrip } from "@prisma/client";
import { T, useT } from "@/components/i18n";

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
  trips: BusinessTrip[];
}

export default function DinasForm({ trips }: Props) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(submitBusinessTrip, undefined);
  const [showForm, setShowForm] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    await cancelBusinessTrip(id);
    setCancellingId(null);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-ink text-white font-semibold py-3 rounded-xl hover:bg-brand transition-colors flex items-center justify-center gap-2"
      >
        <Briefcase size={18} />
        {showForm ? <T>{"Tutup Form"}</T> : <T>{"Ajukan Dinas Luar"}</T>}
      </button>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-700"><T>Pengajuan Dinas Luar</T></h2>

          {state && "ok" in state && (
            <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} />
              <T>Dinas luar</T> {state.days} <T>hari berhasil diajukan. Menunggu persetujuan.</T>
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
              <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Tujuan Dinas</T></label>
              <input
                type="text"
                name="destination"
                required
                placeholder={t("Contoh: Banjarbaru, Kalimantan Selatan")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block"><T>Keperluan / Tujuan</T></label>
              <textarea
                name="purpose"
                required
                rows={3}
                placeholder={t("Tuliskan keperluan dinas...")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
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

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-brand text-white font-semibold py-3 rounded-xl hover:bg-brand-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {isPending ? <T>{"Memproses..."}</T> : <T>{"Kirim Pengajuan"}</T>}
            </button>
          </form>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><T>Riwayat Dinas</T></p>

        {trips.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-8 text-center">
            <Briefcase size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400"><T>Belum ada pengajuan dinas luar</T></p>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <div key={trip.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 flex items-center gap-1">
                      <MapPin size={13} className="text-amber-500 shrink-0" />
                      {trip.destination}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDateID(trip.startDate)}
                      {trip.totalDays > 1 ? ` – ${formatDateID(trip.endDate)}` : ""}
                      {" · "}{trip.totalDays} <T>hari</T>
                    </p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{trip.purpose}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[trip.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {trip.status}
                    </span>
                    {trip.status === "PENDING" && (
                      <button
                        onClick={() => handleCancel(trip.id)}
                        disabled={cancellingId === trip.id}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        {cancellingId === trip.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
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
