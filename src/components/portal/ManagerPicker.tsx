"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";

// Pilih calon atasan langsung dengan mengetik nama atau ID (bukan daftar panjang).
// managers: { value: id user, label: "ID - Nama" }; onChange menerima id user dan label "ID - Nama" (kosong = belum dipilih).
export default function ManagerPicker({ id, value, managers, onChange, disabled }: {
  id: string; value: string; managers: { value: string; label: string }[];
  onChange: (userId: string, label: string) => void; disabled?: boolean;
}) {
  const t = useT();
  const people = managers.map((m) => {
    const [code, ...rest] = m.label.split(" - ");
    return { userId: m.value, code: code.trim(), name: rest.join(" - ").trim(), label: m.label };
  });
  const current = people.find((p) => p.userId === value);
  const [text, setText] = useState(current?.code ?? "");
  if (disabled) return <Input value={current?.label ?? ""} disabled placeholder="—" />;
  const pick = (code: string) => {
    const p = people.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
    onChange(p?.userId ?? "", p?.label ?? "");
  };
  return (
    <EmployeeCombobox id={id} value={text} placeholder={t("Ketik nama atau ID karyawan...")}
      options={people.map((p) => ({ value: p.code, label: p.name }))}
      onChange={(v) => { setText(v); pick(v); }}
      onPick={(o) => { setText(o.value); pick(o.value); }} />
  );
}
