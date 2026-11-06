export const dynamic = "force-dynamic";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { canManage } from "@/lib/roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (!canManage(session.user.role)) redirect("/portal/dashboard");
  return <>{children}</>;
}
