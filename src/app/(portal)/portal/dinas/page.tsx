export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getBusinessTrips } from "./actions";
import DinasForm from "./DinasForm";

export const metadata: Metadata = { title: "Dinas Luar" };

export default async function DinasPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const trips = await getBusinessTrips();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1e3a5f] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/portal/dashboard" className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="font-bold text-base">Dinas Luar</h1>
          <p className="text-blue-200 text-xs">{session.user.name}</p>
        </div>
      </header>

      <DinasForm trips={trips} />
    </div>
  );
}
