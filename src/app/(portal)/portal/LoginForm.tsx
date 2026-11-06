"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Lock, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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

      <div className="space-y-1.5">
        <Label htmlFor="login" className="text-gray-700">ID Karyawan / Email</Label>
        <Input
          id="login"
          name="login"
          type="text"
          required
          disabled={isPending}
          placeholder="Masukkan ID karyawan"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-gray-700">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          disabled={isPending}
          placeholder="••••••••"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full gap-2 bg-ink hover:bg-ink/85"
      >
        {isPending ? (
          <><Loader2 size={16} className="animate-spin" /> Memverifikasi...</>
        ) : (
          <><Lock size={16} /> Masuk</>
        )}
      </Button>
    </form>
  );
}
