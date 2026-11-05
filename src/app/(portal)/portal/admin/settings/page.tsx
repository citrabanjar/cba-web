export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (session.user.role !== "ADMIN") redirect("/portal/dashboard");

  return (
    <SettingsClient
      name={session.user.name ?? ""}
      employeeId={session.user.employeeId ?? ""}
    />
  );
}
