"use client";

import { useActionState, useState } from "react";
import { changeAdminPassword } from "./actions";
import { Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Bot, ClipboardList, LayoutDashboard, UserCog, ToggleRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/i18n";
import IndicatorSettings from "./IndicatorSettings";
import AgentSettings from "./AgentSettings";
import OnboardingSettings from "./OnboardingSettings";
import type { OnboardingSettings as OnboardingSettingsValue } from "@/lib/onboarding-interview";
import AiSettings, { type AiNoteView, type AiRunView } from "./AiSettings";
import type { AiSettings as AiSettingsValue } from "@/lib/ai-checker-settings";
import type { AgentSettings as AgentSettingsValue } from "@/lib/agent-hrd";

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

export default function SettingsClient({
  name, employeeId, role, indicatorHidden, agentSettings, ai, onboarding,
}: {
  name: string; employeeId: string; role: string; indicatorHidden: string[] | null; agentSettings: AgentSettingsValue | null;
  ai: { settings: AiSettingsValue; hasKey: boolean; hasCron: boolean; notes: AiNoteView[]; runs: AiRunView[] } | null;
  onboarding: { settings: OnboardingSettingsValue; workflow: boolean; agent: boolean } | null;
}) {
  const [state, action, isPending] = useActionState(formAction, undefined);
  // Pengaturan dibagi per tab supaya tidak memanjang ke bawah; tab Task Admin & Running Indikator hanya untuk Super Admin.
  const tabs = [
    { key: "akun", label: "Akun", icon: UserCog },
    ...(onboarding ? [{ key: "onboarding", label: "Fitur", icon: ToggleRight }] : []),
    ...(agentSettings ? [{ key: "agent", label: "Task Admin", icon: ClipboardList }] : []),
    ...(ai ? [{ key: "ai", label: "Agent HRD", icon: Bot }] : []),
    ...(indicatorHidden ? [{ key: "beranda", label: "Running Indikator", icon: LayoutDashboard }] : []),
  ];
  const [tab, setTab] = useState("akun");

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white"><T>Pengaturan</T></h1>
        <p className="text-sm text-white/70 mt-0.5"><T>Kelola akun dan pengaturan portal</T></p>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-1.5">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm ${tab === key ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              <Icon size={15} /> <T>{label}</T>
            </button>
          ))}
        </div>
      )}

      {tab === "agent" && agentSettings && <AgentSettings settings={agentSettings} />}
      {tab === "onboarding" && onboarding && <OnboardingSettings {...onboarding} />}
      {tab === "ai" && ai && <AiSettings {...ai} />}
      {tab === "beranda" && indicatorHidden && <IndicatorSettings hidden={indicatorHidden} />}

      {tab === "akun" && (
      <div className="grid gap-5 md:grid-cols-2 md:items-start">
      {/* Info akun */}
      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            <T>Info Akun</T>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-gray-400"><T>Nama</T></p>
            <p className="text-sm font-medium text-gray-800">{name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{role === "SUPER_ADMIN" ? <T>{"Email"}</T> : <T>{"ID Karyawan"}</T>}</p>
            <p className="text-sm font-medium text-gray-800">{employeeId}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400"><T>Role</T></p>
            <p className="text-sm font-medium text-gray-800">{role.replace("_", " ")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Ganti password */}
      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            <T>Ganti Password</T>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            {state?.error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle size={15} className="shrink-0" />
                <T>{state.error}</T>
              </div>
            )}
            {state?.success && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl">
                <CheckCircle2 size={15} className="shrink-0" />
                <T>Password berhasil diubah</T>
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
                <><Loader2 size={16} className="animate-spin" /> <T>Menyimpan...</T></>
              ) : (
                <><Lock size={16} /> <T>Simpan Password</T></>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
      )}
    </div>
  );
}
