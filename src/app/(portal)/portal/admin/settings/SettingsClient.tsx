"use client";

import { useActionState, useState } from "react";
import { changeAdminPassword } from "./actions";
import { Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type State = { error?: string; success?: boolean } | undefined;

async function formAction(_prev: State, fd: FormData): Promise<State> {
  const current = fd.get("currentPassword") as string;
  const next = fd.get("newPassword") as string;
  const confirm = fd.get("confirmPassword") as string;
  if (next !== confirm) return { error: "Konfirmasi password tidak cocok" };
  return changeAdminPassword(current, next);
}

function PasswordField({
  id, name, label, disabled,
}: { id: string; name: string; label: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-gray-700">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          disabled={disabled}
          placeholder="••••••••"
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function SettingsClient({ name, employeeId, role }: { name: string; employeeId: string; role: string }) {
  const [state, action, isPending] = useActionState(formAction, undefined);

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Pengaturan Akun</h1>
        <p className="text-sm text-gray-400 mt-0.5">Kelola informasi akun super admin</p>
      </div>

      {/* Info akun */}
      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Info Akun
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-gray-400">Nama</p>
            <p className="text-sm font-medium text-gray-800">{name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{role === "SUPER_ADMIN" ? "Email" : "ID Karyawan"}</p>
            <p className="text-sm font-medium text-gray-800">{employeeId}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Role</p>
            <p className="text-sm font-medium text-gray-800">{role.replace("_", " ")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Ganti password */}
      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Ganti Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            {state?.error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle size={15} className="shrink-0" />
                {state.error}
              </div>
            )}
            {state?.success && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl">
                <CheckCircle2 size={15} className="shrink-0" />
                Password berhasil diubah
              </div>
            )}

            <PasswordField id="currentPassword" name="currentPassword" label="Password Saat Ini" disabled={isPending} />
            <PasswordField id="newPassword" name="newPassword" label="Password Baru" disabled={isPending} />
            <PasswordField id="confirmPassword" name="confirmPassword" label="Konfirmasi Password Baru" disabled={isPending} />

            <Button
              type="submit"
              disabled={isPending}
              className="w-full gap-2 bg-ink hover:bg-ink/85"
            >
              {isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
              ) : (
                <><Lock size={16} /> Simpan Password</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
