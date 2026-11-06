export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isManagement } from "@/lib/roles";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (!isManagement(session.user.role)) redirect("/portal/dashboard");

  return (
    <SettingsClient
      name={session.user.name ?? ""}
      employeeId={session.user.employeeId ?? session.user.email ?? ""}
      role={session.user.role}
    />
  );
}
