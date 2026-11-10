export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import PortalShell from "@/components/portal/PortalShell";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { getDatabaseStorage } from "@/lib/storage";
import { isApprover, pendingApprovals } from "@/lib/approval";

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
  const approver = access ? { id: access.id, role: access.role } : null;
  const approvals = approver && (await isApprover(approver)) ? await pendingApprovals(approver) : null;

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
    >
      {children}
    </PortalShell>
  );
}
