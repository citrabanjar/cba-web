export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { isApprover, requesterFilter, reviewsProfiles } from "@/lib/approval";
import type { FamilyRow, ProfileChanges } from "@/lib/profile-change";
import { T } from "@/components/i18n";
import PersetujuanClient, { type ApprovalItem, type ProfileItem, type SwapItem } from "./PersetujuanClient";

export const metadata: Metadata = { title: "Persetujuan" };

const LEGACY: Record<string, string> = { TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// Persetujuan cuti & dinas luar oleh atasan langsung.
export default async function PersetujuanPage() {
  const session = await auth();
  const access = await getAccess();
  if (!session?.user?.id || !access) redirect("/portal");
  const a = { id: session.user.id, role: access.role, menuAccess: access.menuAccess };
  if (!(await isApprover(a))) redirect("/portal/dashboard");

  const user = requesterFilter(a);
  const since = daysAgo(60);
  const who = { select: { id: true, name: true, employeeId: true, position: true, department: { select: { name: true } } } };
  const reviewer = reviewsProfiles(a);
  const [leaves, trips, profileReqs, swapReqs] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { user, OR: [{ status: "PENDING" }, { approvedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }] },
      include: { user: who, policy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    prisma.businessTrip.findMany({
      where: { user, OR: [{ status: "PENDING" }, { approvedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }] },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    // Perubahan data pribadi dari Profil Saya (Admin Data Karyawan).
    reviewer ? prisma.profileChangeRequest.findMany({
      where: { userId: { not: a.id }, OR: [{ status: "PENDING" }, { decidedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }] },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 200,
    }) : Promise.resolve([]),
    // Tukar shift: atasan langsung pemohon (A) dan atasan langsung rekan (B).
    prisma.shiftSwapRequest.findMany({
      where: { OR: [{ managerAId: a.id }, { managerBId: a.id }], status: { in: ["MENUNGGU_ATASAN", "DISETUJUI", "DITOLAK"] }, createdAt: { gte: since } },
      include: { requester: who, partner: who }, orderBy: { date: "asc" }, take: 200,
    }),
  ]);

  const person = (u: (typeof leaves)[number]["user"]) => ({
    name: u.name, employeeId: u.employeeId, position: u.position, department: u.department?.name ?? null,
  });
  const items: ApprovalItem[] = [
    ...leaves.map((l) => ({
      id: l.id, kind: "CUTI" as const, status: l.status, person: person(l.user),
      title: l.policy?.name ?? LEGACY[l.type] ?? l.type, start: ymd(l.startDate), end: ymd(l.endDate), days: l.totalDays,
      halfDay: l.halfDay, unpaidDays: l.unpaidDays, reason: l.reason, note: l.note, decidedBy: l.approvedBy,
      decidedAt: l.approvedAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString(),
    })),
    ...trips.map((t) => ({
      id: t.id, kind: "DINAS" as const, status: t.status, person: person(t.user),
      title: `Dinas Luar · ${t.destination}`, start: ymd(t.startDate), end: ymd(t.endDate), days: t.totalDays,
      halfDay: null, unpaidDays: 0, reason: t.purpose, note: t.note, decidedBy: t.approvedBy,
      decidedAt: t.approvedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
    })),
  ];

  const profiles: ProfileItem[] = profileReqs.map((r) => ({
    id: r.id, status: r.status, person: person(r.user), changes: r.changes as ProfileChanges, family: (r.family as FamilyRow[] | null) ?? null,
    reason: r.reason, note: r.note, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
  }));

  const swaps: SwapItem[] = swapReqs.map((s) => ({
    id: s.id, date: ymd(s.date), status: s.status, requester: person(s.requester), partner: person(s.partner),
    requesterShift: s.requesterShift, partnerShift: s.partnerShift, reason: s.reason, note: s.note,
    mine: (s.managerAId === a.id && !s.managerAAt) || (s.managerBId === a.id && !s.managerBAt),
    managerA: s.managerAName, managerB: s.managerBId ? s.managerBName : undefined, decidedBy: s.decidedBy,
  }));

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Persetujuan</T></h2>
        <p className="text-xs text-gray-400"><T>Pengajuan cuti dan dinas luar dari karyawan yang Anda pimpin langsung.</T></p>
      </div>
      <PersetujuanClient items={items} profiles={reviewer ? profiles : null} swaps={swaps} />
    </div>
  );
}
