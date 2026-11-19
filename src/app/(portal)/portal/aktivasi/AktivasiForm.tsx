"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, UserRound } from "lucide-react";
import { T, useT } from "@/components/i18n";
import RandomOtp from "@/components/otp/RandomOtp";
import type { OtpStatus } from "@/components/otp/types";
import { requestResetCode, resetWithCode, verifyResetCode } from "./actions";

const field = "w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none";
const icon = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50";
const btn = "flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-ink hover:bg-white/90 disabled:opacity-60";

// Aktivasi akun / lupa password: Employee ID atau email → kode OTP di email (kartu OTP beranimasi seperti onboarding,
// diperiksa otomatis) → password baru.
export default function AktivasiForm({ header }: { header: React.ReactNode }) {
  const t = useT();
  const [step, setStep] = useState<"id" | "code" | "password" | "done">("id");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [otpMsg, setOtpMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [round, setRound] = useState(0); // naik setiap kode dikirim → kartu OTP dibuat ulang dengan desain acak lain
  const [masked, setMasked] = useState("");
  const opened = useRef(false);

  function ask() {
    setError(null); setInfo(null);
    start(async () => {
      const r = await requestResetCode(login);
      if (r.error) {
        if (step === "code") setOtpMsg({ tone: "error", text: t(r.error) }); else setError(r.error);
        return;
      }
      setStep("code"); setCode(""); setStatus("idle"); setRound((n) => n + 1); setMasked(r.email ?? ""); opened.current = false;
      setOtpMsg({ tone: "info", text: `${t("Kode OTP sudah dikirim ke")} ${r.email}. ${t("Berlaku 10 menit.")}` });
    });
  }
  // Kode diperiksa otomatis begitu 6 angka terisi; bila benar, animasi diputar sampai selesai lalu form password dibuka.
  function check(value: string) {
    setStatus("checking"); setOtpMsg(null);
    start(async () => {
      const r = await verifyResetCode(login, value);
      if (r.error) {
        setOtpMsg({ tone: "error", text: t(r.error) }); setStatus("error");
        setTimeout(() => { setCode(""); setStatus("idle"); }, 900);
      } else setStatus("success");
    });
  }
  function openPassword() {
    if (opened.current) return;
    opened.current = true;
    setInfo(null); setError(null); setStep("password");
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

  // Kartu aktivasi (sama seperti kartu login) untuk langkah selain OTP.
  const card = (body: React.ReactNode) => (
    <div className="login-card w-full max-w-md">
      <span className="login-shape" aria-hidden />
      <div className="relative z-10 p-8 sm:p-10">{header}{body}</div>
    </div>
  );

  if (step === "done") {
    return card(
      <div className="space-y-4 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-300" />
        <p className="text-sm text-white/85"><T>Password berhasil disimpan. Silakan masuk dengan Employee ID dan password baru Anda.</T></p>
        <Link href="/portal" className={btn}><T>Masuk ke Portal</T></Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="flex w-full justify-center"><RandomOtp
        key={round} length={6} value={code} status={status} email={masked} message={otpMsg} resendPending={pending && status !== "checking"}
        successText={t("Membuka form password baru…")} changeText={t("Ganti Employee ID")}
        onChange={(v) => {
          if (status === "checking" || status === "success") return;
          setCode(v);
          if (status === "error") setStatus("idle");
          if (v.length === 6) check(v);
        }}
        onResend={ask}
        onChangeContact={() => { setStep("id"); setCode(""); setOtpMsg(null); setStatus("idle"); }}
        onSuccessDone={openPassword}
      /></div>
    );
  }

  return card(step === "id" ? (
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
      <p className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-100"><CheckCircle2 size={14} /> <T>Kode OTP benar. Buat password baru Anda.</T></p>
      <div className="relative"><Lock size={16} className={icon} />
        <input required type={show ? "text" : "password"} value={pw} placeholder={t("Password baru (minimal 8 karakter)")} onChange={(e) => setPw(e.target.value)} className={`${field} pr-10`} autoComplete="new-password" />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={t("Lihat password")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button></div>
      <div className="relative"><Lock size={16} className={icon} />
        <input required type={show ? "text" : "password"} value={pw2} placeholder={t("Ulangi password baru")} onChange={(e) => setPw2(e.target.value)} className={field} autoComplete="new-password" /></div>
      {error && <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-100"><T>{error}</T></p>}
      <button type="submit" disabled={pending} className={btn}>
        {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Password</T>
      </button>
    </form>
  ));
}
