"use client";

// Dialog bergaya portal (pengganti window.confirm / window.alert bawaan browser).
// - askConfirm(teks): Batal / aksi → Promise<boolean>.  Pakai: if (!(await askConfirm(t("Hapus shift ini?")))) return;
// - showNotice(teks): pemberitahuan penting dengan satu tombol OK (mis. "Perubahan diajukan ke … untuk approval").
// <ConfirmHost /> dipasang sekali di PortalShell.
import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/components/i18n";

type Req = { id: number; message: string; notice?: boolean; resolve: (ok: boolean) => void };
const EVENT = "cba:confirm";
let seq = 0;

export function askConfirm(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Req>(EVENT, { detail: { id: ++seq, message, resolve } })));
}

export function showNotice(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Req>(EVENT, { detail: { id: ++seq, message, notice: true, resolve } })));
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
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const close = (ok: boolean) => { req?.resolve(ok); setReq(null); };
  const act = req && !req.notice ? actionOf(req.message, t) : null;
  const icon = req?.notice
    ? <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={22} /></span>
    : act?.danger
      ? <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><TriangleAlert size={22} /></span>
      : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><HelpCircle size={22} /></span>;
  return (
    <Dialog open={!!req} onOpenChange={(o: boolean) => { if (!o) close(!!req?.notice); }}>
      <DialogContent className="p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg">
            {icon}
            {req?.notice ? t("Pemberitahuan") : t("Konfirmasi")}
          </DialogTitle>
        </DialogHeader>
        <p className="py-1 text-base leading-relaxed text-gray-800">{req?.message}</p>
        <DialogFooter className="gap-2">
          {req?.notice ? (
            <Button autoFocus size="lg" className="h-10 min-w-28 px-5 text-sm" onClick={() => close(true)}>OK</Button>
          ) : (
            <>
              <Button variant="outline" size="lg" className="h-10 px-5 text-sm" onClick={() => close(false)}>{t("Batal")}</Button>
              <Button autoFocus size="lg" onClick={() => close(true)} className={`h-10 min-w-28 px-5 text-sm ${act?.danger ? "bg-red-600 text-white hover:bg-red-700" : ""}`}>{act?.label}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
