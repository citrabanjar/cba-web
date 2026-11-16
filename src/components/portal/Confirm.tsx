"use client";

// Dialog konfirmasi bergaya portal (pengganti window.confirm bawaan browser).
// Pakai: if (!(await askConfirm(t("Hapus shift ini?")))) return;  — <ConfirmHost /> dipasang sekali di PortalShell.
import { useEffect, useState } from "react";
import { TriangleAlert, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/components/i18n";

type Req = { id: number; message: string; resolve: (ok: boolean) => void };
const EVENT = "cba:confirm";
let seq = 0;

export function askConfirm(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Req>(EVENT, { detail: { id: ++seq, message, resolve } })));
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
  const act = req ? actionOf(req.message, t) : null;
  return (
    <Dialog open={!!req} onOpenChange={(o: boolean) => { if (!o) close(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {act?.danger
              ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600"><TriangleAlert size={16} /></span>
              : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand"><HelpCircle size={16} /></span>}
            {t("Konfirmasi")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-gray-700">{req?.message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{t("Batal")}</Button>
          <Button autoFocus onClick={() => close(true)} className={act?.danger ? "bg-red-600 text-white hover:bg-red-700" : ""}>{act?.label}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
