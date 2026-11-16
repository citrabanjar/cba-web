"use client";

// Dialog bergaya portal (pengganti window.confirm / window.alert bawaan browser).
// - askConfirm(teks): Batal / aksi → Promise<boolean>.  Pakai: if (!(await askConfirm(t("Hapus shift ini?")))) return;
// - showNotice(teks): pemberitahuan penting dengan satu tombol OK (mis. "Perubahan diajukan ke … untuk approval").
// <ConfirmHost /> dipasang sekali di PortalShell.
import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/components/i18n";

type NoticeTone = "ok" | "warn" | "error";
type Req = { id: number; message: string; notice?: NoticeTone; resolve: (ok: boolean) => void };
const EVENT = "cba:confirm";
let seq = 0;
// Permintaan sebelum <ConfirmHost /> siap (mis. dari efek saat halaman pertama dibuka) ditampung dulu.
let ready = false;
const queue: Req[] = [];
function send(req: Req) {
  if (!ready) { queue.push(req); return; }
  window.dispatchEvent(new CustomEvent<Req>(EVENT, { detail: req }));
}

export function askConfirm(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => send({ id: ++seq, message, resolve }));
}

// tone: ok (pemberitahuan, mis. diajukan untuk approval), warn (peringatan), error (gagal).
export function showNotice(message: string, tone: NoticeTone = "ok"): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => send({ id: ++seq, message, notice: tone, resolve }));
}

// Tindakan berisiko (hapus / tolak / batalkan) memakai tombol merah dan label yang sesuai.
function actionOf(message: string, t: (s: string) => string) {
  const m = message.trim().toLowerCase();
  if (m.startsWith("hapus") || m.startsWith("delete")) return { label: t("Hapus"), danger: true };
  if (m.startsWith("tolak") || m.startsWith("reject")) return { label: t("Tolak"), danger: true };
  if (m.startsWith("batalkan") || m.startsWith("cancel")) return { label: t("Ya, batalkan"), danger: true };
  if (m.startsWith("lepas")) return { label: t("Lepas"), danger: true };
  return { label: t("Ya, lanjutkan"), danger: false };
}

export function ConfirmHost() {
  const t = useT();
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent<Req>).detail);
    window.addEventListener(EVENT, on);
    ready = true;
    const first = queue.splice(0)[0];
    if (first) on(new CustomEvent<Req>(EVENT, { detail: first }));
    return () => { ready = false; window.removeEventListener(EVENT, on); };
  }, []);
  const close = (ok: boolean) => { req?.resolve(ok); setReq(null); };
  const act = req && !req.notice ? actionOf(req.message, t) : null;
  const icon = req?.notice === "error"
    ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><XCircle size={16} /></span>
    : req?.notice === "warn"
    ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600"><TriangleAlert size={16} /></span>
    : req?.notice
    ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={16} /></span>
    : act?.danger
      ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><TriangleAlert size={16} /></span>
      : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><HelpCircle size={16} /></span>;
  return (
    <Dialog open={!!req} onOpenChange={(o: boolean) => { if (!o) close(!!req?.notice); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {req?.notice === "error" ? t("Gagal") : req?.notice === "warn" ? t("Peringatan") : req?.notice ? t("Pemberitahuan") : t("Konfirmasi")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-gray-700">{req ? t(req.message) : ""}</p>
        <DialogFooter className="gap-2">
          {req?.notice ? (
            <Button autoFocus onClick={() => close(true)}>OK</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>{t("Batal")}</Button>
              <Button autoFocus onClick={() => close(true)} className={`${act?.danger ? "bg-red-600 text-white hover:bg-red-700" : ""}`}>{act?.label}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
