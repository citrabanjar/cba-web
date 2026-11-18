"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, UserRound } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { requestResetCode, resetWithCode } from "./actions";

const field = "w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none";
const icon = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50";
const btn = "flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-ink hover:bg-white/90 disabled:opacity-60";

// Aktivasi akun / lupa password: Employee ID atau email → kode OTP di email → password baru.
export default function AktivasiForm() {
  const t = useT();
  const [step, setStep] = useState<"id" | "code" | "done">("id");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    setError(null); setInfo(null);
    start(async () => {
      const r = await requestResetCode(login);
      if (r.error) { setError(r.error); return; }
      setStep("code"); setCode("");
      setInfo(`${t("Kode OTP sudah dikirim ke")} ${r.email}. ${t("Berlaku 10 menit.")}`);
    });
  }
  function save() {
    setError(null);
    if (pw.length < 8) { setError("Password minimal 8 karakter."); return; }
    if (pw !== pw2) { setError("Konfirmasi password tidak sama."); return; }
    start(async () => {
      const r = await resetWithCode(login, code, pw);
      if (r.error) { setError(r.error); return; }
      setStep("done");
    });
  }

  if (step === "done") {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-300" />
        <p className="text-sm text-white/85"><T>Password berhasil disimpan. Silakan masuk dengan Employee ID dan password baru Anda.</T></p>
        <Link href="/portal" className={btn}><T>Masuk ke Portal</T></Link>
      </div>
    );
  }

  return step === "id" ? (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
      <div className="relative"><UserRound size={16} className={icon} />
        <input required value={login} placeholder={t("Employee ID atau email")} onChange={(e) => setLogin(e.target.value)} className={field} autoComplete="username" /></div>
      {error && <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-100"><T>{error}</T></p>}
      <button type="submit" disabled={pending} className={btn}>
        {pending && <Loader2 size={15} className="animate-spin" />} <T>Kirim Kode OTP</T>
      </button>
    </form>
  ) : (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {info && <p className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/85">{info}</p>}
      <div className="relative"><KeyRound size={16} className={icon} />
        <input required inputMode="numeric" maxLength={6} value={code} placeholder={t("Kode OTP (6 angka)")} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={`${field} tracking-[0.4em]`} autoComplete="one-time-code" /></div>
      <div className="relative"><Lock size={16} className={icon} />
        <input required type={show ? "text" : "password"} value={pw} placeholder={t("Password baru (minimal 8 karakter)")} onChange={(e) => setPw(e.target.value)} className={`${field} pr-10`} autoComplete="new-password" />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={t("Lihat password")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button></div>
      <div className="relative"><Lock size={16} className={icon} />
        <input required type={show ? "text" : "password"} value={pw2} placeholder={t("Ulangi password baru")} onChange={(e) => setPw2(e.target.value)} className={field} autoComplete="new-password" /></div>
      {error && <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-100"><T>{error}</T></p>}
      <button type="submit" disabled={pending || code.length !== 6} className={btn}>
        {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Password</T>
      </button>
      <div className="flex justify-between text-xs text-white/60">
        <button type="button" disabled={pending} onClick={ask} className="hover:text-white"><T>Kirim ulang kode</T></button>
        <button type="button" onClick={() => { setStep("id"); setError(null); setInfo(null); }} className="hover:text-white"><T>Ganti Employee ID</T></button>
      </div>
    </form>
  );
}
