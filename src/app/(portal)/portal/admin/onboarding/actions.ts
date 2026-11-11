"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { missingData, missingJob, readData, readJob, type CandidateData, type CandidateJob } from "@/lib/onboarding";
import { headers } from "next/headers";
import { sendInviteEmail } from "@/lib/mailer";

const PATH = "/portal/admin/onboarding";
type Result = { error?: string; missing?: string[] };

async function requireHR() {
  const access = await getAccess();
  if (!access || !hasMenu(access, "karyawan")) throw new Error("Unauthorized");
  return access;
}
const refresh = () => { revalidatePath(PATH); revalidatePath("/portal/dashboard"); revalidatePath("/onboarding/form"); };
const digits = (v: string) => v.replace(/\D/g, "");

// Alamat halaman onboarding (absolut, untuk email undangan), email calon sudah terisi.
async function onboardingLink(email: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : (process.env.NEXTAUTH_URL ?? "https://www.citrabanjar.com");
  return `${base.replace(/\/$/, "")}/onboarding?email=${encodeURIComponent(email)}`;
}

// HRD mendaftarkan calon: nama, email, nomor HP (WhatsApp). Undangan otomatis dikirim ke email calon.
export async function inviteCandidate(input: { name: string; email: string; phone: string }): Promise<Result & { id?: string; emailed?: boolean; link?: string }> {
  const access = await requireHR();
  const name = input.name.trim(), email = input.email.trim().toLowerCase(), phone = input.phone.trim();
  if (!name) return { error: "Nama wajib diisi." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (digits(phone).length < 9 || digits(phone).length > 15) return { error: "Nomor HP 9-15 digit." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { error: "Email sudah dipakai karyawan lain." };
  if (await prisma.candidate.findUnique({ where: { email }, select: { id: true } })) return { error: "Email sudah terdaftar sebagai calon karyawan." };
  const c = await prisma.candidate.create({ data: { name, email, phone, data: { name, phone }, invitedBy: access.name ?? null } });
  const link = await onboardingLink(email);
  const emailed = await sendInviteEmail(email, name, link);
  refresh();
  return { id: c.id, emailed, link };
}

// Kirim ulang email undangan (mis. calon belum menerima / tersaring spam).
export async function resendInvite(id: string): Promise<Result & { emailed?: boolean }> {
  await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status === "DISETUJUI" || c.status === "DITOLAK") return { error: "Calon tidak bisa diundang ulang." };
  const emailed = await sendInviteEmail(c.email, c.name, await onboardingLink(c.email));
  return emailed ? { emailed } : { error: "Email undangan gagal dikirim. Bagikan link /onboarding lewat WhatsApp." };
}

// Isian HRD saat memeriksa: data pribadi (boleh dibetulkan) dan data pekerjaan.
export async function saveCandidateReview(id: string, data: CandidateData, job: CandidateJob): Promise<Result> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status === "DISETUJUI" || c.status === "DITOLAK") return { error: "Calon tidak bisa diubah." };
  const clean = readData(data, c.name, c.phone);
  await prisma.candidate.update({ where: { id }, data: { data: clean, job: readJob(job), name: clean.name || c.name, reviewedBy: access.name ?? null } });
  refresh();
  return {};
}

export async function returnToCandidate(id: string, note: string): Promise<Result> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || !["DIKIRIM", "MENUNGGU_APPROVAL"].includes(c.status)) return { error: "Hanya data yang sudah dikirim yang bisa dikembalikan." };
  if (!note.trim()) return { error: "Tulis catatan apa yang perlu diperbaiki." };
  await prisma.candidate.update({ where: { id }, data: { status: "DIKEMBALIKAN", note: note.trim(), reviewedBy: access.name ?? null } });
  refresh();
  return {};
}

// Organisasi harus sudah terdaftar; nama disamakan dengan parameter.
async function orgCheck(job: CandidateJob) {
  const [branches, departments, positions] = await Promise.all([
    prisma.branch.findMany({ select: { name: true } }), prisma.department.findMany({ select: { id: true, name: true } }), prisma.position.findMany({ select: { name: true } }),
  ]);
  const find = <T extends { name: string }>(list: T[], v: string) => list.find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase());
  const problems: string[] = [];
  const branch = job.branch.trim() ? find(branches, job.branch) : null;
  if (job.branch.trim() && !branch) problems.push(`Cabang "${job.branch}" belum ada di Parameter Organisasi`);
  const dept = find(departments, job.departmentName);
  if (!dept) problems.push(`Departemen "${job.departmentName}" belum ada di Parameter Organisasi`);
  const pos = find(positions, job.position);
  if (!pos) problems.push(`Jabatan "${job.position}" belum ada di Parameter Organisasi`);
  return { problems, branch: branch?.name ?? null, departmentId: dept?.id ?? null, position: pos?.name ?? job.position };
}

// Semua syarat sebelum diajukan / disetujui.
async function validate(id: string, data: CandidateData, job: CandidateJob, email: string) {
  const missing = [...missingData(data), ...missingJob(job)];
  if (missing.length) return { missing };
  const problems: string[] = [];
  if (await prisma.user.findUnique({ where: { employeeId: job.employeeId.trim() }, select: { id: true } })) problems.push(`Employee ID ${job.employeeId} sudah dipakai`);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) problems.push("Email sudah dipakai karyawan lain");
  if (data.ktpNumber && await prisma.user.findUnique({ where: { ktpNumber: digits(data.ktpNumber) || data.ktpNumber }, select: { id: true } })) problems.push("No. identitas sudah dipakai karyawan lain");
  const org = await orgCheck(job);
  problems.push(...org.problems);
  return { missing: problems, org };
}

export async function submitForApproval(id: string, data: CandidateData, job: CandidateJob): Promise<Result> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || !["DIKIRIM", "DIKEMBALIKAN"].includes(c.status)) return { error: "Calon belum mengirim data atau sudah diproses." };
  const clean = readData(data, c.name, c.phone), j = readJob(job);
  await prisma.candidate.update({ where: { id }, data: { data: clean, job: j, reviewedBy: access.name ?? null } });
  const v = await validate(id, clean, j, c.email);
  if (v.missing.length) { refresh(); return { error: "Belum bisa diajukan:", missing: v.missing }; }
  await prisma.candidate.update({ where: { id }, data: { status: "MENUNGGU_APPROVAL", note: null } });
  refresh();
  return {};
}

// Persetujuan (sementara Super Admin, sampai peran Owner dibuat): calon menjadi karyawan.
export async function approveCandidate(id: string): Promise<Result & { password?: string; userId?: string }> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Owner / Super Admin yang bisa menyetujui." };
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status !== "MENUNGGU_APPROVAL") return { error: "Calon tidak sedang menunggu approval." };
  const data = readData(c.data, c.name, c.phone), job = readJob(c.job);
  const v = await validate(id, data, job, c.email);
  if (v.missing.length || !v.org) return { error: "Belum bisa disetujui:", missing: v.missing };
  const password = randomBytes(6).toString("base64url").slice(0, 8);
  const top = await prisma.user.aggregate({ _max: { employeeNo: true } });
  const date = (s: string) => (s ? new Date(`${s}T00:00:00Z`) : null);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        employeeNo: (top._max.employeeNo ?? 0) + 1, employeeId: job.employeeId.trim(), name: data.name.trim() || c.name,
        email: c.email, phone: data.phone || c.phone, role: "KARYAWAN", isActive: true,
        employmentStatus: job.employmentStatus === "TETAP" ? "TETAP" : "KONTRAK",
        joinDate: date(job.joinDate), contractEndDate: job.employmentStatus === "TETAP" ? null : date(job.contractEndDate),
        departmentId: v.org!.departmentId, branch: v.org!.branch, position: v.org!.position,
        birthPlace: data.birthPlace || null, birthDate: date(data.birthDate), idType: data.idType || null,
        ktpNumber: digits(data.ktpNumber) || data.ktpNumber || null, gender: data.gender || null, maritalStatus: data.maritalStatus || null,
        religion: data.religion || null, address: data.address || null, addressSameAsId: data.addressSameAsId,
        currentAddress: data.addressSameAsId ? data.address || null : data.currentAddress || null,
        bankName: data.bankName || null, bankAccount: data.bankAccount || null, bankHolder: data.bankHolder || null,
        npwp: data.npwp ? digits(data.npwp) : null, ptkpStatus: data.ptkpStatus || null,
        bpjsTkNumber: data.bpjsTkNumber || null, bpjsKesNumber: data.bpjsKesNumber || null,
        passwordHash: await bcrypt.hash(password, 12),
        family: { create: data.family.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), idNumber: f.idNumber || null, relation: f.relation || "Lainnya" })) },
      },
    });
    await tx.candidate.update({ where: { id }, data: { status: "DISETUJUI", userId: u.id, approvedBy: access.name ?? null, approvedAt: new Date(), otpCode: null } });
    return u;
  });
  refresh();
  revalidatePath("/portal/admin/karyawan");
  return { password, userId: user.id };
}

export async function rejectCandidate(id: string, note: string): Promise<Result> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Owner / Super Admin yang bisa menolak." };
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status === "DISETUJUI") return { error: "Calon tidak bisa ditolak." };
  await prisma.candidate.update({ where: { id }, data: { status: "DITOLAK", note: note.trim() || null, approvedBy: access.name ?? null, approvedAt: new Date(), otpCode: null } });
  refresh();
  return {};
}

export async function deleteCandidate(id: string): Promise<Result> {
  await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id }, select: { status: true } });
  if (!c || c.status === "DISETUJUI") return { error: "Calon yang sudah disetujui tidak bisa dihapus." };
  await prisma.candidate.delete({ where: { id } });
  refresh();
  return {};
}
