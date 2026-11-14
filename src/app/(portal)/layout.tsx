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
  const [onboardingOn, workflowOn, notifications] = await Promise.all([
    getOnboardingSettings().then((s) => s.enabled), workflowFeatureOn(),
    // Kabar terbaru di lonceng: semua yang belum dibaca + beberapa yang sudah dibaca.
    access ? prisma.notification.findMany({ where: { userId: access.id }, orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 20 }) : [],
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
      notifications={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString() }))}
      onboardingOn={onboardingOn}
      workflowOn={workflowOn}
    >
      {children}
    </PortalShell>
  );
}
