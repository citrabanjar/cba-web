"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPeriod } from "@/lib/loans";

const PATH = "/portal/pinjaman";

// Karyawan mengajukan pinjaman; admin payroll yang menyetujui dan menyusun tabel angsuran.
export async function requestLoan(input: { amount: number; tenor: number; startPeriod: string; purpose: string }) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const amount = Math.round(Number(input.amount) || 0);
  const tenor = Math.round(Number(input.tenor) || 0);
  if (amount < 1000) return { error: "Jumlah pinjaman wajib diisi." };
  if (tenor < 1 || tenor > 120) return { error: "Jumlah angsuran 1-120 kali." };
  if (!isPeriod(input.startPeriod)) return { error: "Pilih periode potongan pertama." };
  if (!input.purpose.trim()) return { error: "Keperluan wajib diisi." };
  const pending = await prisma.employeeLoan.count({ where: { userId: session.user.id, status: "PENDING" } });
  if (pending) return { error: "Masih ada pengajuan yang menunggu persetujuan." };
  await prisma.employeeLoan.create({
    data: {
      userId: session.user.id, principal: amount, tenor, startPeriod: input.startPeriod,
      purpose: input.purpose.trim().slice(0, 500), createdBy: session.user.name ?? null,
    },
  });
  revalidatePath(PATH);
  revalidatePath("/portal/admin/pinjaman");
  return {};
}

export async function cancelLoanRequest(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };
  const loan = await prisma.employeeLoan.findFirst({ where: { id, userId: session.user.id, status: "PENDING" } });
  if (!loan) return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "BATAL" } });
  revalidatePath(PATH);
  revalidatePath("/portal/admin/pinjaman");
  return {};
}
