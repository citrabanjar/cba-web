"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useT } from "@/components/i18n";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { setBulkPassword } from "./actions";

// Pengaturan → Akun (khusus Super Admin): satu password untuk semua akun Karyawan & Admin (mis. masa testing
// atau setelah import). Akun Super Admin tidak ikut diubah.
export default function BulkPasswordCard({ targets }: { targets: number }) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();

  async function save() {
    if (pw.length < 8) { showNotice(t("Password minimal 8 karakter."), "error"); return; }
    if (pw !== pw2) { showNotice(t("Konfirmasi password tidak sama."), "error"); return; }
    if (!await askConfirm(`${t("Ganti password semua akun Karyawan dan Admin")} (${targets} ${t("akun")})? ${t("Password lama tidak berlaku lagi. Akun Super Admin tidak ikut diubah.")}`)) return;
    start(async () => {
      const r = await setBulkPassword(pw);
      if (r.error) { showNotice(t(r.error), "error"); return; }
      setPw(""); setPw2("");
      showNotice(`${t("Password diperbarui untuk")} ${r.count} ${t("akun")}.`);
    });
  }

  return (
    <Card className="border-amber-200 md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <KeyRound size={16} className="text-amber-600" /> <T>Password Massal</T>
        </CardTitle>
        <p className="text-xs text-gray-400">
          <T>Menetapkan satu password yang sama untuk seluruh akun Karyawan dan Admin, misalnya pada masa pengujian atau setelah import data. Akun Super Admin tidak ikut diubah. Sebelum portal digunakan secara resmi, minta setiap karyawan mengganti passwordnya melalui Profil Saya.</T>
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-60">
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Password baru</T></label>
          <div className="relative">
            <Input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" disabled={pending} className="pr-9" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={t("Lihat password")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div className="w-full sm:w-60">
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Konfirmasi password</T></label>
          <Input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" disabled={pending} />
        </div>
        <Button onClick={save} disabled={pending || !pw || !pw2 || targets === 0} className="gap-1.5">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} <T>Terapkan ke Semua</T>
        </Button>
        <p className="w-full text-[11px] text-gray-400">{targets} <T>akun Karyawan dan Admin akan diubah.</T></p>
      </CardContent>
    </Card>
  );
}
