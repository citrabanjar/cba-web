"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Lock, Loader2, AlertCircle } from "lucide-react";

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
          <AlertCircle size={15} className="shrink-0" />
          {state.error}
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          ID Karyawan / Email
        </label>
        <input
          name="login"
          type="text"
          required
          disabled={isPending}
          placeholder="Masukkan ID karyawan"
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          Password
        </label>
        <input
          name="password"
          type="password"
          required
          disabled={isPending}
          placeholder="••••••••"
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] disabled:opacity-60"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#1e3a5f] text-white font-semibold py-2.5 rounded-xl hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
      >
        {isPending ? (
          <><Loader2 size={16} className="animate-spin" /> Memverifikasi...</>
        ) : (
          <><Lock size={16} /> Masuk</>
        )}
      </button>
    </form>
  );
}
