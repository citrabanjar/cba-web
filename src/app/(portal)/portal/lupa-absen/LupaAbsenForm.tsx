"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClockAlert, Loader2, X } from "lucide-react";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { T, useT } from "@/components/i18n";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { cancelFix, submitFix } from "./actions";

type Fix = { id: string; date: string; checkIn: string; checkOut: string; reason: string; status: string; decidedBy: string | null; note: string | null };
const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Menunggu persetujuan", tone: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui", tone: "bg-green-100 text-green-700" },
  REJECTED: { label: "Ditolak", tone: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Dibatalkan", tone: "bg-gray-100 text-gray-500" },
};

// Form Lupa Absen: tanggal, jam yang terlewat (jam yang sudah tercatat ditampilkan, tidak diisi ulang), dan alasan.
export default function LupaAbsenForm({ today, initialDate, incomplete, records, fixes }: {
  today: string; initialDate: string; incomplete: string[];
  records: Record<string, { checkIn: string; checkOut: string }>; fixes: Fix[];
}) {
  const t = useT();
  const router = useRouter();
  const [date, setDate] = useState(initialDate || incomplete[0] || "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const rec = date ? records[date] : undefined;

  const send = () => start(async () => {
    const r = await submitFix({ date, checkIn: rec?.checkIn ? "" : checkIn, checkOut: rec?.checkOut ? "" : checkOut, reason });
    if (r.error) { void showNotice(t(r.error), "error"); return; }
    void showNotice(`${t("Lupa absen diajukan ke")} ${r.approver} ${t("untuk approval.")}`);
    setCheckIn(""); setCheckOut(""); setReason(""); setDate("");
    router.refresh();
  });
  const cancel = (id: string) => start(async () => {
    if (!(await askConfirm(t("Batalkan pengajuan lupa absen ini?")))) return;
    const r = await cancelFix(id);
    if (r.error) void showNotice(t(r.error), "error");
    router.refresh();
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-gray-700"><ClockAlert size={18} className="text-brand" /> <T>Pengajuan Lupa Absen</T></h2>

        {incomplete.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-500"><T>Absen belum lengkap</T></p>
            <div className="flex flex-wrap gap-2">
              {incomplete.map((d) => (
                <button key={d} type="button" onClick={() => setDate(d)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${date === d ? "border-brand bg-brand text-white" : "border-gray-200 text-gray-600 hover:border-brand"}`}>
                  {formatDate(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Tanggal Absen</T></label>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500"><T>Jam Masuk</T></label>
            {rec?.checkIn
              ? <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">{rec.checkIn} <span className="text-xs text-gray-400">· <T>tercatat</T></span></p>
              : <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500"><T>Jam Pulang</T></label>
            {rec?.checkOut
              ? <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">{rec.checkOut} <span className="text-xs text-gray-400">· <T>tercatat</T></span></p>
              : <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />}
          </div>
        </div>
        {date === today && !rec?.checkOut && (
          <p className="text-[11px] text-gray-400"><T>Untuk hari ini, jam pulang boleh dikosongkan dan check-out dilakukan seperti biasa setelah pengajuan disetujui.</T></p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Alasan</T></label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t("Tuliskan alasan lupa absen...")}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>

        <button type="button" onClick={send} disabled={pending || !date}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {pending ? <T>Memproses...</T> : <T>Kirim Pengajuan</T>}
        </button>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400"><T>Riwayat Lupa Absen</T></p>
        {fixes.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
            <ClockAlert size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400"><T>Belum ada pengajuan lupa absen</T></p>
          </div>
        ) : (
          <div className="space-y-3">
            {fixes.map((f) => (
              <div key={f.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{formatDate(f.date)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {f.checkIn && <><T>Masuk</T> {f.checkIn}</>}{f.checkIn && f.checkOut && " · "}{f.checkOut && <><T>Pulang</T> {f.checkOut}</>}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-400">{f.reason}</p>
                    {f.decidedBy && <p className="mt-1 text-[11px] text-gray-400"><T>Diputus</T> {f.decidedBy}{f.note ? ` · ${f.note}` : ""}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[f.status]?.tone ?? "bg-gray-100 text-gray-500"}`}><T>{STATUS[f.status]?.label ?? f.status}</T></span>
                    {f.status === "PENDING" && (
                      <button type="button" onClick={() => cancel(f.id)} disabled={pending} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                        <X size={12} /> <T>Batalkan</T>
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
