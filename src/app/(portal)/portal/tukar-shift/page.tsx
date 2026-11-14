export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { T } from "@/components/i18n";
import TukarShiftClient, { type SwapView } from "./TukarShiftClient";

export const metadata: Metadata = { title: "Tukar Shift" };

const person = { select: { id: true, name: true, employeeId: true, department: { select: { name: true } } } };

export default async function TukarShiftPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;
  const [swaps, colleagues] = await Promise.all([
    prisma.shiftSwapRequest.findMany({
      where: { OR: [{ requesterId: id }, { partnerId: id }] }, orderBy: { createdAt: "desc" }, take: 50,
      include: { requester: person, partner: person },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" }, id: { not: id } },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    }),
  ]);
  const view = (p: (typeof swaps)[number]["requester"]) => ({ id: p.id, name: p.name, employeeId: p.employeeId, department: p.department?.name ?? null });
  const items: SwapView[] = swaps.map((s) => ({
    id: s.id, date: s.date.toISOString().slice(0, 10), status: s.status, mine: s.requesterId === id,
    requester: view(s.requester), partner: view(s.partner), requesterShift: s.requesterShift, partnerShift: s.partnerShift,
    reason: s.reason, note: s.note, partnerAt: s.partnerAt?.toISOString() ?? null,
    managerA: s.managerAName ?? (s.managerAAt ? "✓" : null), managerB: s.managerBId ? (s.managerBName ?? (s.managerBAt ? "✓" : null)) : undefined,
    createdAt: s.createdAt.toISOString(),
  }));
  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Tukar Shift</T></h2>
        <p className="text-xs text-gray-400"><T>Tukar shift dengan rekan untuk satu tanggal. Disetujui rekan, lalu atasan langsung kalian.</T></p>
      </div>
      <TukarShiftClient items={items} colleagues={colleagues.map((c) => ({ id: c.id, name: c.name, employeeId: c.employeeId, department: c.department?.name ?? null }))} />
    </div>
  );
}
