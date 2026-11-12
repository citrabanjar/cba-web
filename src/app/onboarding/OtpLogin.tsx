"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Mail, Phone } from "lucide-react";
import { T, useT } from "@/components/i18n";
import RandomOtp from "@/components/otp/RandomOtp";
import type { OtpStatus } from "@/components/otp/types";
import { requestOtp, verifyOtp } from "./actions";

const field = "w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none";

// Masuk calon: langkah 1 email + nomor HP (kartu login biasa), langkah 2 kartu OTP beranimasi (desain codexr acak).
export default function OtpLogin({ initialEmail = "" }: { initialEmail?: string }) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"data" | "otp">("data");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [round, setRound] = useState(0); // naik setiap kode dikirim → kartu OTP dibuat ulang dengan desain acak lain
  const ticket = useRef("");
  const leaving = useRef(false);

  function ask() {
    setError(null);
    start(async () => {
      const r = await requestOtp(email, phone);
      if (r.error) {
        if (step === "otp") setMessage({ tone: "error", text: t(r.error) }); else setError(r.error);
        return;
      }
      setStep("otp");
      setCode(""); setStatus("idle"); setRound((n) => n + 1);
      setMessage({ tone: "info", text: t(r.sent ? "Kode OTP sudah dikirim ke email Anda. Berlaku 10 menit." : "Kode OTP sudah dibuat. HRD akan mengirimkannya kepada Anda. Berlaku 10 menit.") });
    });
  }

  // Kode diperiksa otomatis begitu 6 angka terisi. Bila benar, animasi desain diputar sampai selesai (onSuccessDone),
  // baru tiket ditukar menjadi sesi dan formulir dibuka.
  function check(value: string) {
    setStatus("checking");
    setMessage(null);
    start(async () => {
      const r = await verifyOtp(email, phone, value);
      if (r.error) {
        setMessage({ tone: "error", text: t(r.error) });
        setStatus("error");
        setTimeout(() => { setCode(""); setStatus("idle"); }, 900);
      } else {
        ticket.current = r.ticket ?? "";
        setStatus("success");
      }
    });
  }
  function finish() {
    if (leaving.current) return;
    leaving.current = true;
    window.location.assign(new URL(`/onboarding/masuk?t=${encodeURIComponent(ticket.current)}`, window.location.origin).href);
  }

  if (step === "otp") {
    return (
      <div className="flex w-full justify-center">
        <RandomOtp
          key={round} length={6} value={code} status={status} email={email} message={message} resendPending={pending && status !== "checking"}
          onChange={(v) => {
            if (status === "checking" || status === "success") return;
            setCode(v);
            if (status === "error") setStatus("idle");
            if (v.length === 6) check(v);
          }}
          onResend={ask}
          onChangeContact={() => { setStep("data"); setCode(""); setMessage(null); setStatus("idle"); }}
          onSuccessDone={finish}
        />
      </div>
    );
  }

  const icon = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50";
  return (
    <div className="login-card w-full max-w-md">
      <span className="login-shape" aria-hidden />
      <div className="relative z-10 p-8 sm:p-10">
        <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/20">
          <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" width={190} height={28} priority />
        </span>
        <h1 className="mt-6 text-xl font-bold text-white"><T>Data Calon Karyawan</T></h1>
        <p className="mb-6 mt-1 text-sm text-white/65"><T>Masuk dengan email dan nomor HP yang Anda berikan ke HRD. Kami akan mengirim kode OTP.</T></p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <div className="relative"><Mail size={16} className={icon} />
            <input type="email" required value={email} placeholder={t("Email")} onChange={(e) => setEmail(e.target.value)} className={field} /></div>
          <div className="relative"><Phone size={16} className={icon} />
            <input type="tel" required value={phone} placeholder={t("No. HP (WhatsApp)")} onChange={(e) => setPhone(e.target.value)} className={field} /></div>
          {error && <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-100"><T>{error}</T></p>}
          <button type="submit" disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-ink hover:bg-white/90 disabled:opacity-60">
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Kirim Kode OTP</T>
          </button>
        </form>
      </div>
    </div>
  );
}
