export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import PortalShell from "@/components/portal/PortalShell";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { getDatabaseStorage } from "@/lib/storage";
import { isApprover, pendingApprovals } from "@/lib/approval";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import { workflowFeatureOn } from "@/lib/workflow-settings";
import { prisma } from "@/lib/prisma";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    return <div className="portal-theme min-h-screen bg-gray-50">{children}</div>;
  }

  const access = await getAccess();
  const storage = isSuperAdmin(access?.role) ? await getDatabaseStorage() : null;
  // Menu Persetujuan (atasan langsung, Admin/HRD) dengan jumlah pengajuan yang menunggu.
  const approver = access ? { id: access.id, role: access.role, menuAccess: access.menuAccess } : null;
  const approvals = approver && (await isApprover(approver)) ? await pendingApprovals(approver) : null;
  const [onboardingOn, workflowOn, unread] = await Promise.all([
    getOnboardingSettings().then((s) => s.enabled), workflowFeatureOn(),
    // Angka di lonceng: notifikasi belum dibaca + permintaan tukar shift yang menunggu jawaban saya sebagai rekan.
    access ? Promise.all([
      prisma.notification.count({ where: { userId: access.id, readAt: null } }),
      prisma.shiftSwapRequest.count({ where: { partnerId: access.id, status: "MENUNGGU_REKAN" } }),
    ]).then(([a, b]) => a + b) : 0,
  ]);

  return (
    <PortalShell
      user={{
        name: session.user.name ?? "Karyawan",
        employeeId: session.user.employeeId,
        role: access?.role ?? "KARYAWAN",
        menuAccess: access?.menuAccess ?? [],
      }}
      storage={storage}
      approvals={approvals}
      unread={unread}
      onboardingOn={onboardingOn}
      workflowOn={workflowOn}
    >
      {children}
    </PortalShell>
  );
}
