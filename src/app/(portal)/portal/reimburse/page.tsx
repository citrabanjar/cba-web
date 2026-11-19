export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";
import { capWindow, getReimburseSettings, usedInWindow } from "@/lib/reimburse";
import { wibToday } from "@/lib/attendance-assess";
import ReimburseForm from "./ReimburseForm";

export const metadata: Metadata = { title: "Reimbursement" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Reimbursement Pengobatan (karyawan): ajukan kuitansi berobat + lampiran, pantau sisa plafon dan riwayat.
export default async function ReimbursePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;
  const [s, user, claims] = await Promise.all([
    getReimburseSettings(),
    prisma.user.findUnique({ where: { id }, select: { employmentStatus: true, joinDate: true } }),
    prisma.medicalClaim.findMany({
      where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50,
      include: { files: { select: { id: true, kind: true, name: true } } },
    }),
  ]);
  const today = wibToday();
  const w = capWindow(user ?? { employmentStatus: null, joinDate: null }, today, s);
  const used = await usedInWindow(id, w.from, w.to);

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Reimbursement Pengobatan</T></h2>
        <p className="mt-0.5 text-xs text-gray-400">{session.user.name}</p>
      </div>
      <ReimburseForm
        enabled={s.enabled} today={ymd(today)} percent={s.percent} needDoctorLetter={s.needDoctorLetter}
        plafon={{ cap: w.cap, used, from: ymd(w.from), to: ymd(w.to) }}
        claims={claims.map((c) => ({
          id: c.id, treatDate: ymd(c.treatDate), provider: c.provider, amount: c.amount, payout: c.payout, status: c.status,
          decidedBy: c.decidedBy, decision: c.decision, files: c.files,
        }))}
      />
    </div>
  );
}
