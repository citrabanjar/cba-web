export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { toLoanView } from "@/lib/loan-view";
import PinjamanClient from "./PinjamanClient";

export const metadata: Metadata = { title: "Pinjaman" };

// Pinjaman karyawan: ajukan pinjaman dan lihat tabel angsuran.
export default async function PinjamanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  const loans = await prisma.employeeLoan.findMany({
    where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, include: { installments: true },
  });
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800"><T>Pinjaman</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>
      <PinjamanClient loans={loans.map(toLoanView)} />
    </div>
  );
}
