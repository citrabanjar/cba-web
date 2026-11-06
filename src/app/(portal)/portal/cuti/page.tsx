export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getLeaveRequests } from "./actions";
import CutiForm from "./CutiForm";
import { T } from "@/components/i18n";

export const metadata: Metadata = { title: "Pengajuan Cuti" };

export default async function CutiPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const requests = await getLeaveRequests();

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800"><T>Pengajuan Cuti</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>
      <CutiForm requests={requests} />
    </div>
  );
}
