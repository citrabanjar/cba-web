"use server";

import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { mailerReady, sendPasswordOtpEmail } from "@/lib/mailer";
import { OTP_MAX_TRIES, OTP_MINUTES, newOtp } from "@/lib/onboarding-session";

// Aktivasi akun / lupa password Portal Karyawan (halaman publik /portal/aktivasi):
// 1) Employee ID atau email → kode OTP 6 angka dikirim ke email yang tercatat di data karyawan;
// 2) kode benar → password baru disimpan. Kode berlaku 10 menit, maksimal 5 kali salah,
//    dan kode baru baru bisa diminta 60 detik setelah kode sebelumnya.
type Result = { error?: string };
const secret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "cba-reset-dev";
// Kode disimpan sebagai hash bertanda tangan (bukan angka aslinya).
const hashCode = (userId: string, code: string) => createHmac("sha256", secret()).update(`${userId}.${code}`).digest("hex");
const digits = (v: string) => v.replace(/\D/g, "");
// a***@gmail.com — cukup untuk dikenali pemiliknya.
const mask = (email: string) => {
  const [u, d] = email.split("@");
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
};

async function findUser(login: string) {
  const v = login.trim();
  if (!v) return null;
  return prisma.user.findFirst({
    where: { isActive: true, OR: [{ employeeId: { equals: v, mode: "insensitive" } }, { email: { equals: v, mode: "insensitive" } }] },
    select: { id: true, name: true, email: true, resetExpires: true },
  });
}

export async function requestResetCode(login: string): Promise<Result & { email?: string }> {
  const u = await findUser(login);
  if (!u) return { error: "Employee ID atau email tidak terdaftar sebagai karyawan aktif." };
  if (!u.email) return { error: "Email Anda belum tercatat di data karyawan. Hubungi Admin HRD." };
  // Kode sebelumnya masih baru (kurang dari 60 detik): jangan kirim ulang dulu.
  if (u.resetExpires && u.resetExpires.getTime() - OTP_MINUTES * 60_000 > Date.now() - 60_000) {
    return { error: "Kode baru saja dikirim. Tunggu 1 menit sebelum meminta kode baru." };
  }
  if (process.env.NODE_ENV === "production" && !mailerReady()) return { error: "Pengiriman email portal belum aktif. Hubungi Admin HRD." };
  const code = newOtp();
  await prisma.user.update({
    where: { id: u.id }, data: { resetCode: hashCode(u.id, code), resetExpires: new Date(Date.now() + OTP_MINUTES * 60_000), resetTries: 0 },
  });
  const sent = await sendPasswordOtpEmail(u.email, u.name, code);
  if (!sent && process.env.NODE_ENV === "production") return { error: "Email gagal dikirim. Coba lagi beberapa saat lagi atau hubungi Admin HRD." };
  return { email: mask(u.email) };
}

// Periksa kode OTP (salah = jatah percobaan berkurang). Kode tidak dihapus: dipakai lagi saat menyimpan password.
async function checkCode(login: string, code: string): Promise<{ error?: string; userId?: string }> {
  const u = await findUser(login);
  if (!u) return { error: "Employee ID atau email tidak terdaftar sebagai karyawan aktif." };
  const row = await prisma.user.findUnique({ where: { id: u.id }, select: { resetCode: true, resetExpires: true, resetTries: true } });
  if (!row?.resetCode || !row.resetExpires) return { error: "Minta kode OTP terlebih dahulu." };
  if (row.resetExpires < new Date()) return { error: "Kode OTP sudah kedaluwarsa. Minta kode baru." };
  if (row.resetTries >= OTP_MAX_TRIES) return { error: "Terlalu banyak percobaan. Minta kode baru." };
  const a = Buffer.from(hashCode(u.id, digits(code))), b = Buffer.from(row.resetCode);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await prisma.user.update({ where: { id: u.id }, data: { resetTries: { increment: 1 } } });
    return { error: "Kode OTP salah." };
  }
  return { userId: u.id };
}

// Kartu OTP: kode diperiksa otomatis begitu 6 angka terisi, sebelum form password baru dibuka.
export async function verifyResetCode(login: string, code: string): Promise<Result> {
  const r = await checkCode(login, code);
  return r.error ? { error: r.error } : {};
}

export async function resetWithCode(login: string, code: string, password: string): Promise<Result> {
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  const c = await checkCode(login, code);
  if (c.error || !c.userId) return { error: c.error ?? "Kode OTP salah." };
  const u = { id: c.userId };
  await prisma.user.update({
    where: { id: u.id }, data: { passwordHash: await bcrypt.hash(password, 12), resetCode: null, resetExpires: null, resetTries: 0 },
  });
  return {};
}
