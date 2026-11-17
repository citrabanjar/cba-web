"use client";

import { useState, useTransition } from "react";
import { CalendarX2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { showNotice } from "@/components/portal/Confirm";
import { submitAbsence } from "../cuti/actions";

// Ajukan Tidak Masuk: hari ini atau mundur beberapa hari (batas diatur Admin di Setup Cuti), tanpa batas pengajuan H-x.
// Pilihan potong cuti tahunan atau izin tanpa upah; penyetuju sama dengan pengajuan Cuti.
export default function AbsenceRequest({ today, minDate, annual, unpaid }: { today: string; minDate: string; annual: boolean; unpaid: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<"TAHUNAN" | "TANPA_UPAH">(annual ? "TAHUNAN" : "TANPA_UPAH");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await submitAbsence({ date, kind, reason });
    if ("error" in r && r.error) { void showNotice(t(r.error), "error"); return; }
    if ("days" in r) {
      void showNotice(`${t("Pengajuan tidak masuk")} ${r.days} ${t("hari diajukan ke")} ${r.approver} ${t("untuk approval.")}`
        + (r.unpaid ? ` ${r.unpaid} ${t("hari melebihi saldo dan masuk cuti di luar tanggungan.")}` : ""));
      setOpen(false); setReason(""); setDate(today);
    }
  });
  const choice = (k: "TAHUNAN" | "TANPA_UPAH", label: string, hint: string, enabled: boolean) => (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm ${kind === k ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-gray-200"} ${enabled ? "" : "pointer-events-none opacity-50"}`}>
      <input type="radio" name="absence-kind" checked={kind === k} disabled={!enabled} onChange={() => setKind(k)} className="mt-0.5 h-4 w-4 accent-[#BE353F]" />
      <span><span className="block font-medium text-gray-800"><T>{label}</T></span><span className="block text-xs text-gray-500"><T>{hint}</T></span></span>
    </label>
  );
  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><CalendarX2 size={17} /></span>
          <div>
            <p className="font-semibold text-gray-900"><T>Ajukan Tidak Masuk</T></p>
            <p className="text-xs text-gray-500"><T>Tidak masuk hari ini atau beberapa hari terakhir.</T></p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!annual && !unpaid}><T>Ajukan Tidak Masuk</T></Button>
      </section>
      {open && (
        <Dialog open onOpenChange={(o: boolean) => { if (!o) setOpen(false); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle><T>Ajukan Tidak Masuk</T></DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-500"><T>Tanggal</T></label>
                <input type="date" value={date} min={minDate} max={today} onChange={(e) => setDate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" />
              </div>
              <div className="space-y-2">
                {choice("TAHUNAN", "Potong cuti tahunan", "Saldo cuti tahunan berkurang.", annual)}
                {choice("TANPA_UPAH", "Izin tanpa upah", "Gaji hari itu dipotong.", unpaid)}
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-500"><T>Alasan</T></label>
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}><T>Batal</T></Button>
              <Button disabled={pending || !date || !reason.trim()} onClick={submit} className="gap-1.5">
                {pending && <Loader2 size={14} className="animate-spin" />} <T>Kirim Pengajuan</T>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
