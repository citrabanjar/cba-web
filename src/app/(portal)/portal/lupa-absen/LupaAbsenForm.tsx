"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarMinus, CheckCircle2, ClockAlert, Loader2, UserX, X } from "lucide-react";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { T, useT } from "@/components/i18n";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { cancelFix, submitAbsence, submitFix } from "./actions";
import { cancelLeave } from "../cuti/actions";

type Fix = { id: string; date: string; checkIn: string; checkOut: string; reason: string };
type Leave = { id: string; start: string; end: string; days: number; name: string; reason: string };
type Kind = "LUPA" | "TAHUNAN" | "TANPA_UPAH";

const KINDS: { key: Kind; label: string; desc: string; icon: React.ElementType }[] = [
  { key: "LUPA", label: "Lupa Absen", desc: "Masuk kerja, tetapi check-in / check-out terlewat", icon: ClockAlert },
  { key: "TAHUNAN", label: "Potong Cuti Tahunan", desc: "Tidak masuk, dipotong dari saldo Cuti Tahunan", icon: CalendarMinus },
  { key: "TANPA_UPAH", label: "Izin Tanpa Hak Cuti", desc: "Tidak masuk, tanpa upah dan tanpa potong saldo", icon: UserX },
];
const dec = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Pengajuan Absen: Lupa Absen (jam check-in / check-out terlewat) atau tidak masuk hari ini / tanggal yang sudah lewat
// sebagai Potong Cuti Tahunan / Izin Tanpa Hak Cuti. Halaman hanya menampilkan pengajuan yang masih diproses.
export default function LupaAbsenForm({ today, initialDate, incomplete, records, fixes, leaves, annual }: {
  today: string; initialDate: string; incomplete: string[];
  records: Record<string, { checkIn: string; checkOut: string }>; fixes: Fix[]; leaves: Leave[];
  annual: { available: number } | null; // saldo Cuti Tahunan yang bisa dipakai (saldo − pengajuan menunggu)
}) {
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("LUPA");
  const [date, setDate] = useState(initialDate || incomplete[0] || "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const rec = date ? records[date] : undefined;

  const send = () => start(async () => {
    if (kind === "LUPA") {
      const r = await submitFix({ date, checkIn: rec?.checkIn ? "" : checkIn, checkOut: rec?.checkOut ? "" : checkOut, reason });
      if (r.error) { void showNotice(t(r.error), "error"); return; }
      void showNotice(`${t("Lupa absen diajukan ke")} ${r.approver} ${t("untuk approval.")}`);
      setCheckIn(""); setCheckOut(""); setDate("");
    } else {
      const r = await submitAbsence({ kind, startDate: from, endDate: to < from ? from : to, reason });
      if (r.error) { void showNotice(t(r.error), "error"); return; }
      void showNotice(`${t(kind === "TAHUNAN" ? "Potong Cuti Tahunan" : "Izin Tanpa Hak Cuti")} ${r.days} ${t("hari diajukan ke")} ${r.approver} ${t("untuk approval.")}`);
      setFrom(today); setTo(today);
    }
    setReason("");
    router.refresh();
  });
  const cancel = (id: string, leave: boolean) => start(async () => {
    if (!(await askConfirm(t("Batalkan pengajuan ini?")))) return;
    const r = leave ? await cancelLeave(id) : await cancelFix(id);
    if (r && "error" in r && r.error) void showNotice(t(r.error), "error");
    router.refresh();
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-500"><T>Jenis Pengajuan</T></p>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => setKind(k.key)}
                className={`rounded-xl border p-3 text-left transition-colors ${kind === k.key ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-gray-200 hover:border-brand"}`}>
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${kind === k.key ? "text-brand" : "text-gray-800"}`}><k.icon size={15} /> <T>{k.label}</T></span>
                <span className="mt-0.5 block text-[11px] leading-snug text-gray-500"><T>{k.desc}</T></span>
              </button>
            ))}
          </div>
        </div>

        {kind === "LUPA" ? (
          <>
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
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500"><T>Dari Tanggal</T></label>
                <Input type="date" value={from} max={today} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500"><T>Sampai Tanggal</T></label>
                <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            {kind === "TAHUNAN" && (
              <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                <T>Saldo Cuti Tahunan yang bisa dipakai</T>: <b className="text-gray-900">{annual ? `${dec(annual.available)} ${t("hari")}` : "—"}</b>
              </p>
            )}
            <p className="text-[11px] text-gray-400"><T>Untuk hari ini atau tanggal yang sudah lewat (paling lama 31 hari). Setelah disetujui, Alpha pada tanggal itu terhapus.</T></p>
          </>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Alasan</T></label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder={t(kind === "LUPA" ? "Tuliskan alasan lupa absen..." : "Tuliskan alasan tidak masuk...")}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>

        <button type="button" onClick={send} disabled={pending || (kind === "LUPA" ? !date : !from)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {pending ? <T>Memproses...</T> : <T>Kirim Pengajuan</T>}
        </button>
      </div>

      {(fixes.length > 0 || leaves.length > 0) && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400"><T>Pengajuan Diproses</T></p>
          <div className="space-y-3">
            {fixes.map((f) => (
              <Item key={f.id} title={<><T>Lupa Absen</T> · {formatDate(f.date)}</>} reason={f.reason} disabled={pending} onCancel={() => cancel(f.id, false)}
                detail={<>{f.checkIn && <><T>Masuk</T> {f.checkIn}</>}{f.checkIn && f.checkOut && " · "}{f.checkOut && <><T>Pulang</T> {f.checkOut}</>}</>} />
            ))}
            {leaves.map((l) => (
              <Item key={l.id} title={<T>{l.name}</T>} reason={l.reason} disabled={pending} onCancel={() => cancel(l.id, true)}
                detail={<>{formatDate(l.start)}{l.end !== l.start && <> – {formatDate(l.end)}</>} · {dec(l.days)} <T>hari</T></>} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ title, detail, reason, disabled, onCancel }: { title: React.ReactNode; detail: React.ReactNode; reason: string; disabled: boolean; onCancel: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
          <p className="mt-1 line-clamp-2 text-xs text-gray-400">{reason}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><T>Menunggu persetujuan</T></span>
          <button type="button" onClick={onCancel} disabled={disabled} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <X size={12} /> <T>Batalkan</T>
          </button>
        </div>
      </div>
    </div>
  );
}
