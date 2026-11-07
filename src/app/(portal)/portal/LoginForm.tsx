"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { T, useT } from "@/components/i18n";

// Isian bergaris bawah di atas kaca, mengikuti desain Code XR Glassy Login.
export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, undefined);
  const [show, setShow] = useState(false);
  const t = useT();

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
          <AlertCircle size={15} className="shrink-0" />
          <T>{state.error}</T>
        </div>
      )}

      <label className="login-field">
        <User size={17} />
        <input
          id="login"
          name="login"
          type="text"
          required
          disabled={isPending}
          autoComplete="username"
          placeholder={t("ID Karyawan / Email")}
        />
      </label>

      <label className="login-field">
        <Lock size={17} />
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          required
          disabled={isPending}
          autoComplete="current-password"
          placeholder={t("Password")}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t("Sembunyikan password") : t("Lihat password")}
          className="text-white/50 transition-colors hover:text-white"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </label>

      <button type="submit" disabled={isPending} className="login-submit">
        {isPending ? (
          <><Loader2 size={16} className="animate-spin" /> <T>Memverifikasi...</T></>
        ) : (
          <T en="Log in">Masuk</T>
        )}
      </button>
    </form>
  );
}
