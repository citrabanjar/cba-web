"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requestLoanFor, type LoanInput } from "@/lib/request-submit";
import { prisma } from "@/lib/prisma";

const PATH = "/portal/pinjaman";

// Karyawan mengajukan pinjaman → atasan langsung → pemeriksaan Admin → keputusan pimpinan puncak (lib/loan-flow.ts).
// recalc: permohonan hitung ulang angsuran = pinjaman baru digabung dengan sisa pinjaman berjalan yang dipilih,
// dengan potongan per bulan (installment) atau jumlah angsuran (tenor) yang diminta. Keputusan akhir tetap di Admin & penyetuju.
export async function requestLoan(input: LoanInput): Promise<{ error?: string; proposed?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  return requestLoanFor({ id: session.user.id, name: session.user.name ?? null }, input);
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
