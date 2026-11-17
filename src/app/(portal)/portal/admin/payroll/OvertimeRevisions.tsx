"use client";

import { AlertTriangle } from "lucide-react";
import { T } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { RevisionCard, type AdminOvertime } from "../lembur/LemburAdminClient";

// Revisi jam lembur (check-out melewati jam akhir SPL) diputus Admin Payroll; gaji periodenya tertahan sampai diputus.
export default function OvertimeRevisions({ items }: { items: AdminOvertime[] }) {
  const canEdit = useCanEdit("gaji");
  if (!items.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle size={16} /> {items.length} <T>revisi jam lembur menunggu keputusan</T></p>
      <p className="text-xs text-amber-700"><T>Karyawan absen pulang melewati jam akhir SPL. Selama belum diputus, lembur dibayar sampai jam akhir SPL dan gaji periode itu belum bisa difinalkan.</T></p>
      {items.map((r) => <RevisionCard key={r.id} item={r} canEdit={canEdit} />)}
    </section>
  );
}
