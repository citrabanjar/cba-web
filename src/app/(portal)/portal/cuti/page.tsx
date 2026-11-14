export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { eligible, hasBalance, todayDate, visibleBalances } from "@/lib/leave-balance";
import { getLeaveRequests } from "./actions";
import CutiForm from "./CutiForm";
import { T } from "@/components/i18n";

export const metadata: Metadata = { title: "Pengajuan Cuti" };

export default async function CutiPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const [requests, me, policies, balances] = await Promise.all([
    getLeaveRequests(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { employmentStatus: true, gender: true, joinDate: true } }),
    prisma.leavePolicy.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    visibleBalances([session.user.id]),
  ]);
  const today = todayDate();
  // Yang bisa dipilih karyawan: sesuai status, jenis kelamin, masa kerja. Dinas Luar punya menu
  // sendiri, dan Cuti Bersama ditetapkan perusahaan lewat Kalender Libur.
  const options = me
    ? policies
        .filter((p) => eligible(p, me, today) && p.category !== "DINAS" && !(p.category === "TAHUNAN" && !hasBalance(p)))
        .map((p) => ({
          id: p.id, code: p.code, name: p.name, category: p.category, quota: p.quota, unit: p.unit, period: p.period,
          noticeDays: p.noticeDays, needsAttachment: p.needsAttachment, attachmentNote: p.attachmentNote,
          paid: p.paid, note: p.note, balance: hasBalance(p), allowHalfDay: p.allowHalfDay,
        }))
    : [];

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800"><T>Pengajuan Cuti</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>
      <CutiForm requests={requests} options={options} balances={balances} />
    </div>
  );
}
