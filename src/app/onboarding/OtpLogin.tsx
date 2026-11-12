"use client";

import { useState, useTransition } from "react";
import OtpBoxes, { type OtpStatus } from "@/components/OtpBoxes";
import { Loader2, Mail, Phone } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { requestOtp, verifyOtp } from "./actions";

const field = "w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none";

export default function OtpLogin({ initialEmail = "" }: { initialEmail?: string }) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"data" | "otp">("data");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [round, setRound] = useState(0); // naik setiap kode dikirim → kotak OTP dibuat ulang dengan gaya berikutnya

  function ask() {
    setError(null);
    start(async () => {
      const r = await requestOtp(email, phone);
      if (r.error) { setError(r.error); return; }
      setStep("otp");
      setCode(""); setStatus("idle"); setRound((n) => n + 1);
      setInfo(r.sent ? "Kode OTP sudah dikirim ke email Anda. Berlaku 10 menit." : "Kode OTP sudah dibuat. HRD akan mengirimkannya kepada Anda. Berlaku 10 menit.");
    });
  }
  // Kode diperiksa otomatis begitu 6 angka terisi; animasi berhasil diputar dulu sebelum pindah ke formulir.
  function check(value = code) {
    if (value.length < 6) return;
    setError(null);
    setStatus("checking");
    start(async () => {
      const r = await verifyOtp(email, phone, value);
      if (r.error) {
        setError(r.error);
        setStatus("error");
        setTimeout(() => { setCode(""); setStatus("idle"); }, 650);
      } else {
        setStatus("success");
        // Animasi berhasil diputar dulu, baru tiket ditukar menjadi sesi dan formulir dibuka.
        setTimeout(() => window.location.assign(new URL(`/onboarding/masuk?t=${encodeURIComponent(r.ticket ?? "")}`, window.location.origin).href), 1400);
      }
    });
  }

  const icon = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50";
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (step === "data") ask(); else check(); }}>
      <div className="relative"><Mail size={16} className={icon} />
        <input type="email" required value={email} disabled={step === "otp"} placeholder={t("Email")} onChange={(e) => setEmail(e.target.value)} className={field} /></div>
      <div className="relative"><Phone size={16} className={icon} />
        <input type="tel" required value={phone} disabled={step === "otp"} placeholder={t("No. HP (WhatsApp)")} onChange={(e) => setPhone(e.target.value)} className={field} /></div>
      {step === "otp" && (
        <div className="pt-1">
          <p className="mb-2 text-center text-xs text-white/60"><T>Masukkan 6 angka kode OTP</T></p>
          <OtpBoxes key={round} value={code} status={status} disabled={pending}
            onChange={(v) => { setCode(v); if (status === "error") setStatus("idle"); if (v.length === 6) check(v); }} />
        </div>
      )}
      {info && step === "otp" && <p className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80"><T>{info}</T></p>}
      {error && <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-100"><T>{error}</T></p>}
      <button type="submit" disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-ink hover:bg-white/90 disabled:opacity-60">
        {pending && <Loader2 size={15} className="animate-spin" />} <T>{step === "data" ? "Kirim Kode OTP" : status === "success" ? "Berhasil" : "Masuk"}</T>
      </button>
      {step === "otp" && (
        <div className="flex justify-between text-xs text-white/60">
          <button type="button" onClick={() => { setStep("data"); setCode(""); setInfo(null); setStatus("idle"); }} className="hover:text-white"><T>Ganti email / nomor</T></button>
          <button type="button" disabled={pending} onClick={ask} className="hover:text-white"><T>Kirim ulang kode</T></button>
        </div>
      )}
    </form>
  );
}
