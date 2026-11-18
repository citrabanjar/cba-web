export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import LeaveClient from "./LeaveClient";
import { computeBalances, getLeaveBalanceSwitch, maskBalances } from "@/lib/leave-balance";
import { isSuperAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Cuti" };

// Setup Leave: kebijakan cuti, izin, dan dinas perusahaan.
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string; lihat?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "absensi")) redirect("/portal/dashboard");

  const { tab } = await searchParams;
  // Proses Cuti / Proses Dinas pindah ke Laporan (papan kerja Admin): tautan lama diteruskan ke sana.
  if (tab === "pengajuan") redirect("/portal/admin/laporan?jenis=cuti&status=menunggu");
  if (tab === "dinas") redirect("/portal/admin/laporan?jenis=dinas&status=menunggu");
  const [policies, computed, balanceSwitch] = await Promise.all([
    prisma.leavePolicy.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    computeBalances(),
    getLeaveBalanceSwitch(),
  ]);
  // Super Admin selalu melihat hitungan asli (untuk menyiapkan saldo awal); admin lain mengikuti saklar.
  const superAdmin = isSuperAdmin(access.role);
  const balances = superAdmin || balanceSwitch.active ? computed : maskBalances(computed);
  return (
    <LeaveClient
      policies={policies.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))}
      balances={balances}
      balanceSwitch={balanceSwitch}
      superAdmin={superAdmin}
      initialTab={tab === "saldo" ? tab : undefined}
    />
  );
}
