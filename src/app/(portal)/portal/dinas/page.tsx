export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getBusinessTrips } from "./actions";
import DinasForm from "./DinasForm";

export const metadata: Metadata = { title: "Dinas Luar" };

export default async function DinasPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const trips = await getBusinessTrips();

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800">Dinas Luar</h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>
      <DinasForm trips={trips} />
    </div>
  );
}
