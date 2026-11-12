"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendOtpEmail } from "@/lib/mailer";
import {
  OTP_MAX_TRIES, OTP_MINUTES, clearCandidateSession, getCandidateSession, newOtp, setCandidateSession,
} from "@/lib/onboarding-session";
import { candidateCanEdit, missingData, readData, type CandidateData } from "@/lib/onboarding";

type Result = { error?: string };
const digits = (v: string) => v.replace(/\D/g, "");
// Nomor 08xx dan 628xx dianggap sama: cukup cocokkan 9 digit terakhir.
const samePhone = (a: string, b: string) => digits(a).slice(-9) === digits(b).slice(-9) && digits(a).length >= 9;

async function findCandidate(email: string, phone: string) {
  const c = await prisma.candidate.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!c || !samePhone(c.phone, phone)) return null;
  return c;
}

// Langkah 1: email + nomor HP cocok dengan undangan HRD → buat kode OTP.
export async function requestOtp(email: string, phone: string): Promise<Result & { sent?: boolean }> {
  const c = await findCandidate(email, phone);
  if (!c) return { error: "Email atau nomor HP tidak terdaftar sebagai calon karyawan. Hubungi HRD." };
  if (c.status === "DISETUJUI") return { error: "Data Anda sudah disetujui. Silakan masuk lewat Portal Karyawan." };
  if (c.status === "DITOLAK") return { error: "Pendaftaran Anda tidak dilanjutkan. Hubungi HRD." };
  if (c.status === "WAWANCARA" || c.status === "APPROVAL_WAWANCARA") return { error: "Pendaftaran Anda masih di tahap wawancara. Undangan mengisi data dikirim ke email setelah hasil wawancara disetujui." };
  const code = newOtp();
  await prisma.candidate.update({
    where: { id: c.id }, data: { otpCode: code, otpExpires: new Date(Date.now() + OTP_MINUTES * 60_000), otpTries: 0 },
  });
  revalidatePath("/portal/admin/onboarding");
  const sent = await sendOtpEmail(c.email, c.name, code);
  return { sent };
}

// Langkah 2: kode OTP benar → sesi calon dibuat.
export async function verifyOtp(email: string, phone: string, code: string): Promise<Result> {
  const c = await findCandidate(email, phone);
  if (!c || !c.otpCode || !c.otpExpires) return { error: "Minta kode OTP terlebih dahulu." };
  if (c.otpExpires < new Date()) return { error: "Kode OTP sudah kedaluwarsa. Minta kode baru." };
  if (c.otpTries >= OTP_MAX_TRIES) return { error: "Terlalu banyak percobaan. Minta kode baru." };
  if (digits(code) !== c.otpCode) {
    await prisma.candidate.update({ where: { id: c.id }, data: { otpTries: { increment: 1 } } });
    return { error: "Kode OTP salah." };
  }
  await prisma.candidate.update({ where: { id: c.id }, data: { otpCode: null, otpExpires: null, otpTries: 0 } });
  await setCandidateSession(c.id);
  return {};
}

// Simpan isian (draf) atau kirim ke HRD untuk diperiksa.
export async function saveCandidateData(input: CandidateData, submit: boolean): Promise<Result & { missing?: string[] }> {
  const id = await getCandidateSession();
  if (!id) return { error: "Sesi berakhir. Silakan masuk lagi." };
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) return { error: "Data calon tidak ditemukan." };
  if (!candidateCanEdit(c.status)) return { error: "Data sudah dikirim ke HRD dan tidak bisa diubah." };
  const data = readData(input, c.name, c.phone);
  if (submit) {
    const missing = missingData(data);
    if (missing.length) return { error: "Lengkapi isian berikut sebelum dikirim.", missing };
  }
  await prisma.candidate.update({
    where: { id },
    data: { data, ...(submit ? { status: "DIKIRIM", submittedAt: new Date() } : {}) },
  });
  revalidatePath("/onboarding/form");
  revalidatePath("/portal/admin/onboarding");
  return {};
}

export async function logoutCandidate() {
  await clearCandidateSession();
}
