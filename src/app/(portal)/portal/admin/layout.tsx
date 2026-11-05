export const dynamic = "force-dynamic";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (session.user.role !== "ADMIN") redirect("/portal/dashboard");
  return <>{children}</>;
}
