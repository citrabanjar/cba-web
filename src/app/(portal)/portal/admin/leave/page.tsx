export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import LeaveClient from "./LeaveClient";
import { computeBalances, getLeaveBalanceSwitch, maskBalances } from "@/lib/leave-balance";
import { isSuperAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Leave" };

// Setup Leave: kebijakan cuti, izin, dan dinas perusahaan.
export default async function LeavePage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "absensi")) redirect("/portal/dashboard");

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
    />
  );
}
