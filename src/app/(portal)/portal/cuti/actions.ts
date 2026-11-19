"use server";

import { auth } from "@/auth";
import { createLeave } from "@/lib/request-submit";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getLeaveRequests() {
  const session = await auth();
  if (!session?.user?.id) return [];

  // Halaman pengajuan hanya memuat pengajuan yang masih diproses; riwayat cuti ada di Profil Saya → Kehadiran.
  return prisma.leaveRequest.findMany({
    where: { userId: session.user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { policy: { select: { code: true, name: true } } },
  });
}


// Pengajuan cuti memakai jenis dari Setup Leave. Dicek: jenis boleh dipakai karyawan ini,
// batas pengajuan (H-x), jatah per kejadian, sisa saldo (Cuti Tahunan / Cuti Masa Kontrak),
// dan tidak bertabrakan dengan pengajuan lain.
export async function submitLeave(_prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const files = await Promise.all(formData.getAll("attachment").filter((v): v is File => v instanceof File && v.size > 0)
    .map(async (f) => ({ name: f.name || "lampiran", mime: f.type, data: Buffer.from(await f.arrayBuffer()) })));
  return createLeave(session.user.id, {
    files,
    policyId: String(formData.get("policyId") ?? ""), startDate: String(formData.get("startDate") ?? ""), endDate: String(formData.get("endDate") ?? ""),
    reason: String(formData.get("reason") ?? "").trim(), dayPart: String(formData.get("dayPart") ?? "PENUH"), delegateId: String(formData.get("delegateId") ?? ""),
  });
}

export async function cancelLeave(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.userId !== session.user.id) return { error: "Pengajuan tidak ditemukan." };
  if (req.status !== "PENDING") return { error: "Hanya pengajuan yang masih PENDING yang bisa dibatalkan." };

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/portal/cuti");
  revalidatePath("/portal/lupa-absen");
  return { ok: true };
}
