export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import PortalShell from "@/components/portal/PortalShell";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { getDatabaseStorage } from "@/lib/storage";
import { isApprover, pendingApprovals } from "@/lib/approval";
import { workflowFeatureOn } from "@/lib/workflow-settings";
import { prisma } from "@/lib/prisma";
import { getImportEnabled } from "@/lib/import-access";
import { importKindsFor } from "@/lib/import-kinds";

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
  const [workflowOn, unread, importEnabled] = await Promise.all([
    workflowFeatureOn(),
    // Angka di lonceng: notifikasi belum dibaca + permintaan tukar shift yang menunggu jawaban saya sebagai rekan.
    access ? Promise.all([
      prisma.notification.count({ where: { userId: access.id, readAt: null } }),
      prisma.shiftSwapRequest.count({ where: { partnerId: access.id, status: "MENUNGGU_REKAN" } }),
    ]).then(([a, b]) => a + b) : 0,
    getImportEnabled(),
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
      workflowOn={workflowOn}
      importOn={importKindsFor(access, importEnabled).length > 0}
    >
      {children}
    </PortalShell>
  );
}
