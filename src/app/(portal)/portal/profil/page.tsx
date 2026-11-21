export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { loadEmployeeDetail } from "@/lib/employee-detail";
import { PROFILE_KEYS, profileValue, type FamilyRow, type ProfileChanges } from "@/lib/profile-change";
import KaryawanDetailClient from "../admin/karyawan/[id]/KaryawanDetailClient";
import { SelfAccount, SelfAction } from "./ProfilClient";
import { telegramBotName, telegramOn } from "@/lib/telegram";

export const metadata: Metadata = { title: "Profil Saya" };

// Profil Saya: halaman profil yang sama dengan Data Karyawan (Admin), dilihat karyawan sendiri (keputusan pemilik
// 2026-11-19). Tombol ubah & aksi Admin disembunyikan, bagian khusus Admin dilewati; perubahan data diajukan lewat
// "Ajukan Perubahan Data" dan disetujui Admin / Workflow. Tab Akun: ganti password & riwayat pengajuan.
export default async function ProfilPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;

  const data = await loadEmployeeDetail(id, { canSeePay: true, canSeeLoans: true, isSuper: false });
  if (!data) redirect("/portal");
  const [user, requests] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, true])), telegramChatId: true, family: { orderBy: { createdAt: "asc" }, select: { name: true, idNumber: true, relation: true } } },
    }),
    prisma.profileChangeRequest.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const record = (user ?? {}) as unknown as Record<string, unknown>;
  const values = Object.fromEntries(PROFILE_KEYS.map((k) => [k, profileValue(record, k)]));
  const family = ((user?.family ?? []) as { name: string; idNumber: string | null; relation: string }[]).map((f) => ({ name: f.name, idNumber: f.idNumber ?? "", relation: f.relation }));
  const reqs = requests.map((r) => ({
    id: r.id, status: r.status, changes: r.changes as ProfileChanges, family: (r.family as FamilyRow[] | null) ?? null,
    reason: r.reason, note: r.note, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
  }));

  return (
    <KaryawanDetailClient
      {...data}
      initialTab={(await searchParams).tab}
      canEdit={false}
      self={{
        action: <SelfAction values={values} family={family} pending={reqs.some((r) => r.status === "PENDING")} />,
        account: <SelfAccount requests={reqs} telegram={{ linked: !!user?.telegramChatId, available: telegramOn() && !!telegramBotName() }} />,
      }}
    />
  );
}
