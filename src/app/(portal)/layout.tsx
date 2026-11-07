export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import PortalShell from "@/components/portal/PortalShell";
import { getAccess } from "@/lib/access";

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

  return (
    <PortalShell
      user={{
        name: session.user.name ?? "Karyawan",
        employeeId: session.user.employeeId,
        role: access?.role ?? "KARYAWAN",
        menuAccess: access?.menuAccess ?? [],
      }}
    >
      {children}
    </PortalShell>
  );
}
