"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { canEditMenu, isSuperAdmin } from "@/lib/roles";
import { missingData, missingJob, readData, readJob, type CandidateData, type CandidateJob } from "@/lib/onboarding";
import { headers } from "next/headers";
import { sendCandidateTaskEmail, sendInviteEmail, sendReturnedEmail } from "@/lib/mailer";
import { auth } from "@/auth";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import { decideStep } from "@/lib/workflow-settings";
import {
  actionableApprovers, approvalComplete, approvalFrom, emptyInterview, emptyReview, flowProblems, interviewApproved, missingInterview, missingReview,
  normalizeOnboardingFlow, pendingReviews, readInterview, type Interview, type OnboardingFlow, type Review,
} from "@/lib/onboarding-interview";
import { Prisma } from "@prisma/client";

const PATH = "/portal/admin/onboarding";
type Result = { error?: string; missing?: string[] };

async function requireHR() {
  const access = await getAccess();
  if (!access || !canEditMenu(access, "prakaryawan")) throw new Error("Anda hanya punya hak lihat di menu ini.");
  return access;
}
const refresh = () => { revalidatePath(PATH); revalidatePath("/portal/dashboard"); revalidatePath("/onboarding/form"); revalidatePath("/portal/persetujuan"); };
const digits = (v: string) => v.replace(/\D/g, "");

// Alamat halaman onboarding (absolut, untuk email undangan), email calon sudah terisi.
async function onboardingLink(email: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : (process.env.NEXTAUTH_URL ?? "https://www.citrabanjar.com");
  return `${base.replace(/\/$/, "")}/onboarding?email=${encodeURIComponent(email)}`;
}

// Email pemberitahuan tugas ke pewawancara / approver (yang punya email). Penilaian & keputusan tetap di portal.
async function notifyTask(userIds: string[], kind: "WAWANCARA" | "APPROVAL", candidate: string) {
  if (!userIds.length) return;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : (process.env.NEXTAUTH_URL ?? "https://www.citrabanjar.com");
  const link = `${base.replace(/\/$/, "")}/portal/persetujuan`;
  const users = await prisma.user.findMany({ where: { id: { in: userIds }, isActive: true, email: { not: null } }, select: { email: true, name: true } });
  await Promise.all(users.map((u) => sendCandidateTaskEmail(u.email!, u.name, kind, candidate, link)));
}

// HRD mendaftarkan calon: nama, email, nomor HP (WhatsApp). Undangan otomatis dikirim ke email calon.
// Wawancara / approval dipilih HRD per calon setelah calon mengirim data (kotak Reviewer).
export async function inviteCandidate(input: { name: string; email: string; phone: string }): Promise<Result & { id?: string; emailed?: boolean; link?: string; interview?: boolean }> {
  const access = await requireHR();
  const name = input.name.trim().toUpperCase(), email = input.email.trim().toLowerCase(), phone = input.phone.trim();
  if (!name) return { error: "Nama wajib diisi." };
  const setup = await getOnboardingSettings();
  if (!setup.enabled) return { error: "Modul Pra-Karyawan sedang nonaktif." };
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
  if (!c || !["DIUNDANG", "DIKEMBALIKAN"].includes(c.status)) return { error: "Calon tidak bisa diundang ulang." };
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

// Dikembalikan ke calon untuk diperbaiki; calon langsung diberi tahu lewat email (catatan + tombol Perbaiki Data).
export async function returnToCandidate(id: string, note: string): Promise<Result & { emailed?: boolean }> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || !["DIKIRIM", "MENUNGGU_APPROVAL"].includes(c.status)) return { error: "Hanya data yang sudah dikirim yang bisa dikembalikan." };
  if (!note.trim()) return { error: "Tulis catatan apa yang perlu diperbaiki." };
  const iv = readInterview(c.interview);
  // Approval data calon (tanpa wawancara) diulang dari awal setelah calon memperbaiki.
  const clearApproval = iv?.skipped ? { interview: Prisma.DbNull } : {};
  await prisma.candidate.update({ where: { id }, data: { status: "DIKEMBALIKAN", note: note.trim(), reviewedBy: access.name ?? null, ...clearApproval } });
  const emailed = await sendReturnedEmail(c.email, c.name, note.trim(), await onboardingLink(c.email));
  refresh();
  return { emailed };
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
  if (job.managerId && !(await prisma.user.findFirst({ where: { id: job.managerId, isActive: true }, select: { id: true } }))) problems.push("Calon atasan langsung tidak aktif / tidak ditemukan");
  return { missing: problems, org };
}

// HRD selesai mencocokkan data calon dengan berkas asli lalu memilih reviewer:
// Wawancara (pewawancara) dan/atau Approval (approver, berurutan). Tanpa wawancara, approval wajib.
export async function submitForApproval(id: string, data: CandidateData, job: CandidateJob, reviewers: OnboardingFlow): Promise<Result> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || !["DIKIRIM", "DIKEMBALIKAN"].includes(c.status)) return { error: "Calon belum mengirim data atau sudah diproses." };
  if (interviewApproved(readInterview(c.interview))) return { error: "Calon ini sudah lolos approval wawancara: langsung Daftarkan Karyawan." };
  const clean = readData(data, c.name, c.phone), j = readJob(job);
  await prisma.candidate.update({ where: { id }, data: { data: clean, job: j, reviewedBy: access.name ?? null } });
  const v = await validate(id, clean, j, c.email);
  if (v.missing.length) { refresh(); return { error: "Belum bisa dikirim:", missing: v.missing }; }

  // Reviewer harus karyawan aktif; nama diambil dari database.
  const f = normalizeOnboardingFlow(reviewers);
  const ids = [...f.interviewers, ...f.approvers].map((x) => x.id);
  const people = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true } });
  const known = new Map(people.map((u) => [u.id, u.name]));
  const keep = (list: { id: string; name: string }[]) => list.filter((x) => known.has(x.id)).map((x) => ({ id: x.id, name: known.get(x.id)! }));
  f.interviewers = f.interview ? keep(f.interviewers) : [];
  f.approvers = f.approval ? keep(f.approvers) : [];
  const problems = flowProblems(f);
  if (problems.length) return { error: problems.join(" ") };

  const now = new Date().toISOString();
  if (f.interview) {
    // Tawaran kerja diawali dari Data Pekerjaan; pewawancara boleh melengkapi (mis. gaji pokok).
    const interview: Interview = {
      ...emptyInterview(),
      reviews: f.interviewers.map((x) => emptyReview(x.id, x.name)),
      approvers: f.approvers,
      offer: {
        ...emptyInterview().offer, departmentName: j.departmentName, position: j.position, branch: j.branch,
        employmentStatus: j.employmentStatus || "KONTRAK", joinDate: j.joinDate, contractEndDate: j.contractEndDate,
        managerId: j.managerId, managerName: j.managerName,
      },
    };
    await prisma.candidate.update({ where: { id }, data: { status: "WAWANCARA", note: null, interview } });
    await notifyTask(f.interviewers.map((x) => x.id), "WAWANCARA", c.name);
    refresh();
    return {};
  }
  const wf: Interview = { ...emptyInterview(), skipped: true, submittedBy: access.name ?? "", submittedAt: now, approval: approvalFrom(f.approvers) };
  await prisma.candidate.update({ where: { id }, data: { status: "MENUNGGU_APPROVAL", note: null, interview: wf } });
  await notifyTask(actionableApprovers(wf.approval), "APPROVAL", c.name);
  refresh();
  return {};
}

type Org = NonNullable<Awaited<ReturnType<typeof validate>>["org"]>;
type CandidateRec = NonNullable<Awaited<ReturnType<typeof prisma.candidate.findUnique>>>;

// Calon menjadi karyawan (satu transaksi): data karyawan + keluarga, gaji pokok dari tawaran wawancara (bila ada).
async function createEmployee(id: string, c: CandidateRec, data: CandidateData, job: CandidateJob, org: Org, opts: { approvedBy: string | null; salary?: number }) {
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
        departmentId: org.departmentId, branch: org.branch, position: org.position,
        birthPlace: data.birthPlace || null, birthDate: date(data.birthDate), idType: data.idType || null,
        ktpNumber: digits(data.ktpNumber) || data.ktpNumber || null, gender: data.gender || null, maritalStatus: data.maritalStatus || null,
        religion: data.religion || null, address: data.address || null, addressSameAsId: data.addressSameAsId,
        currentAddress: data.addressSameAsId ? data.address || null : data.currentAddress || null,
        addressRegion: data.addressRegion || null, addressRegionName: data.addressRegionName || null,
        currentRegion: data.addressSameAsId ? data.addressRegion || null : data.currentRegion || null,
        currentRegionName: data.addressSameAsId ? data.addressRegionName || null : data.currentRegionName || null,
        addressPostal: data.addressPostal || null,
        currentPostal: data.addressSameAsId ? data.addressPostal || null : data.currentPostal || null,
        bankName: data.bankName || null, bankAccount: data.bankAccount || null, bankHolder: data.bankHolder || null,
        npwp: data.npwp ? digits(data.npwp) : null, ptkpStatus: data.ptkpStatus || null,
        bpjsTkNumber: data.bpjsTkNumber || null, bpjsKesNumber: data.bpjsKesNumber || null,
        passwordHash: await bcrypt.hash(password, 12),
        managerId: job.managerId || null,
        family: { create: data.family.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), idNumber: f.idNumber || null, relation: f.relation || "Lainnya" })) },
      },
    });
    if (opts.salary && opts.salary > 0 && job.joinDate) {
      await tx.employeeSalary.create({
        data: { userId: u.id, effectiveDate: new Date(`${job.joinDate}T00:00:00Z`), basicSalary: opts.salary, note: "Tawaran kerja (approval wawancara)", createdBy: opts.approvedBy },
      });
    }
    await tx.candidate.update({ where: { id }, data: { status: "DISETUJUI", userId: u.id, approvedBy: opts.approvedBy, approvedAt: new Date(), otpCode: null } });
    return u;
  });
  return { password, user };
}

// Persetujuan (sementara Super Admin, sampai peran Owner dibuat): calon menjadi karyawan.
export async function approveCandidate(id: string): Promise<Result & { password?: string; userId?: string }> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Owner / Super Admin yang bisa menyetujui." };
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status !== "MENUNGGU_APPROVAL") return { error: "Calon tidak sedang menunggu approval." };
  if (readInterview(c.interview)?.approval) return { error: "Calon ini diputus lewat workflow approval (menu Persetujuan)." };
  const data = readData(c.data, c.name, c.phone), job = readJob(c.job);
  const v = await validate(id, data, job, c.email);
  if (v.missing.length || !v.org) return { error: "Belum bisa disetujui:", missing: v.missing };
  const { password, user } = await createEmployee(id, c, data, job, v.org, { approvedBy: access.name ?? null });
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

// ─── Tahap wawancara ────────────────────────────────────────────────────────

const cleanInterview = (input: Interview, prev: Interview | null): Interview => {
  const i = readInterview(input) ?? emptyInterview();
  return { ...i, interviewer: i.interviewer.toUpperCase(), approval: prev?.approval ?? null, submittedBy: prev?.submittedBy ?? "", submittedAt: prev?.submittedAt ?? "", approvedAt: prev?.approvedAt ?? "" };
};

// HRD menyimpan tawaran kerja selama tahap wawancara (penilaian diisi pewawancara sendiri).
export async function saveInterview(id: string, input: Interview): Promise<Result> {
  await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status !== "WAWANCARA") return { error: "Calon tidak sedang di tahap wawancara." };
  const prev = readInterview(c.interview);
  const i = cleanInterview(input, prev);
  // Penilaian pewawancara tidak diubah HRD.
  if (prev?.reviews.length) i.reviews = prev.reviews;
  await prisma.candidate.update({ where: { id }, data: { interview: i } });
  refresh();
  return {};
}

// Semua pewawancara sudah menilai + tawaran lengkap → ke approver (bila Approval dicentang) atau langsung lolos.
async function finishInterview(c: CandidateRec, i: Interview, by: string): Promise<Result & { emailed?: boolean; sent?: boolean }> {
  const missing = missingInterview(i);
  if (i.offer.departmentName && i.offer.position) {
    const org = await orgCheck({ ...readJob(null), branch: i.offer.branch, departmentName: i.offer.departmentName, position: i.offer.position });
    missing.push(...org.problems);
  }
  if (missing.length) return { error: "Belum bisa diajukan:", missing };
  i.submittedBy = by;
  i.submittedAt = new Date().toISOString();
  if (i.approvers.length) {
    i.approval = approvalFrom(i.approvers);
    await prisma.candidate.update({ where: { id: c.id }, data: { status: "APPROVAL_WAWANCARA", interview: i, note: null } });
    await notifyTask(actionableApprovers(i.approval), "APPROVAL", c.name);
    return { sent: true };
  }
  // Tanpa approval: hasil wawancara langsung kembali ke Admin.
  i.approval = null;
  i.approvedAt = new Date().toISOString();
  return { emailed: await inviteAfterInterview(c, i), sent: false };
}

// Wawancara lolos: tawaran kerja masuk ke Data Pekerjaan. Calon yang sudah mengisi data → kembali ke Admin (siap didaftarkan);
// data lama (wawancara sebelum calon mengisi data) → undangan isi data dikirim ke email calon.
async function inviteAfterInterview(c: CandidateRec, i: Interview): Promise<boolean | undefined> {
  const job = {
    ...readJob(c.job), branch: i.offer.branch, departmentName: i.offer.departmentName, position: i.offer.position,
    employmentStatus: i.offer.employmentStatus, joinDate: i.offer.joinDate, contractEndDate: i.offer.employmentStatus === "TETAP" ? "" : i.offer.contractEndDate,
    managerId: i.offer.managerId, managerName: i.offer.managerName,
  };
  if (c.submittedAt) {
    await prisma.candidate.update({ where: { id: c.id }, data: { status: "SIAP_DAFTAR", interview: i, job: { ...readJob(c.job), ...job, employeeId: readJob(c.job).employeeId }, note: null } });
    return undefined;
  }
  await prisma.candidate.update({ where: { id: c.id }, data: { status: "DIUNDANG", interview: i, job, note: null } });
  return sendInviteEmail(c.email, c.name, await onboardingLink(c.email));
}

// HRD mengajukan hasil wawancara (mis. setelah melengkapi tawaran kerja). Semua pewawancara harus sudah menilai.
export async function submitInterview(id: string, input: Interview): Promise<Result> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c || c.status !== "WAWANCARA") return { error: "Calon tidak sedang di tahap wawancara." };
  const prev = readInterview(c.interview);
  const i = cleanInterview(input, prev);
  if (prev?.reviews.length) i.reviews = prev.reviews;
  await prisma.candidate.update({ where: { id }, data: { interview: i } });
  const r = await finishInterview(c, i, access.name ?? "");
  refresh();
  return r;
}

// Pewawancara mengisi penilaiannya sendiri (menu Persetujuan). submit = kirim; penilaian terakhir sekaligus mengajukan ke approver.
export async function saveReview(id: string, input: Pick<Review, "date" | "score" | "recommendation" | "notes">, offer: Interview["offer"], submit: boolean): Promise<Result & { sent?: boolean; done?: boolean }> {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) return { error: "Unauthorized" };
  const c = await prisma.candidate.findUnique({ where: { id } });
  const i = readInterview(c?.interview);
  if (!c || !i || c.status !== "WAWANCARA") return { error: "Calon tidak sedang di tahap wawancara." };
  const mine = i.reviews.find((x) => x.id === me);
  if (!mine) return { error: "Anda bukan pewawancara calon ini." };
  if (mine.at) return { error: "Penilaian Anda sudah dikirim." };
  Object.assign(mine, { date: input.date, score: input.score, recommendation: input.recommendation, notes: input.notes.trim() });
  // Tawaran kerja boleh dilengkapi pewawancara.
  i.offer = cleanInterview({ ...i, offer }, i).offer;
  if (submit) {
    const miss = missingReview(mine);
    if (miss.length) { await prisma.candidate.update({ where: { id }, data: { interview: i } }); refresh(); return { error: "Penilaian belum lengkap:", missing: miss }; }
    mine.at = new Date().toISOString();
    mine.name = session.user?.name ?? mine.name;
  }
  await prisma.candidate.update({ where: { id }, data: { interview: i } });
  if (submit && pendingReviews(i).length === 0) {
    const r = await finishInterview(c, i, session.user?.name ?? "");
    if (r.error) {
      // Penilaian tetap terkirim; tawaran kerja yang belum lengkap dilengkapi HRD lalu diajukan dari menu Pra-Karyawan.
      refresh();
      return { done: true, error: "Penilaian terkirim. Belum bisa diajukan ke approval karena:", missing: r.missing };
    }
    refresh();
    return { done: true, sent: r.sent };
  }
  refresh();
  return { done: submit };
}

// Approver memutus hasil wawancara. Semua setuju → undangan isi data otomatis ke email calon.
export async function decideInterview(id: string, decision: "SETUJU" | "TOLAK", note: string): Promise<Result & { emailed?: boolean; done?: boolean; ready?: boolean }> {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) return { error: "Unauthorized" };
  const c = await prisma.candidate.findUnique({ where: { id } });
  const i = readInterview(c?.interview);
  if (!c || !i?.approval || c.status !== (i.skipped ? "MENUNGGU_APPROVAL" : "APPROVAL_WAWANCARA")) return { error: "Calon tidak sedang menunggu approval." };
  if (decision === "TOLAK" && !note.trim()) return { error: "Tulis alasan penolakan." };
  const d = decideStep(i.approval, me, decision === "SETUJU", note, session.user?.name ?? null);
  if ("error" in d) return { error: "Belum giliran Anda memutus, atau Anda bukan approver calon ini." };
  const step = d.step;
  if (decision === "TOLAK") {
    await prisma.candidate.update({ where: { id }, data: { status: "DITOLAK", interview: i, note: `Ditolak saat approval ${i.skipped ? "data calon" : "wawancara"} (${step.name}): ${note.trim()}`, approvedBy: step.name, approvedAt: new Date() } });
    refresh();
    return { done: true };
  }
  if (!approvalComplete(i.approval)) {
    await prisma.candidate.update({ where: { id }, data: { interview: i } });
    // Giliran approver berikutnya.
    await notifyTask(actionableApprovers(i.approval), "APPROVAL", c.name);
    refresh();
    return { done: false };
  }
  i.approvedAt = new Date().toISOString();
  if (i.skipped) {
    // Tanpa wawancara: data calon disetujui → HRD tinggal mendaftarkan karyawan.
    await prisma.candidate.update({ where: { id }, data: { status: "SIAP_DAFTAR", interview: i, approvedBy: step.name, approvedAt: new Date() } });
    refresh();
    return { done: true, ready: true };
  }
  // Tawaran kerja yang disetujui masuk ke Data Pekerjaan; berkas kembali ke Admin.
  const emailed = await inviteAfterInterview(c, i);
  refresh();
  return emailed === undefined ? { done: true, ready: true } : { done: true, emailed };
}

// Jalur wawancara: setelah data calon cocok, HRD isi Employee ID & penempatan lalu langsung masuk database.
// Status kerja, jabatan, dan gaji pokok mengikuti tawaran yang sudah disetujui (tidak bisa diubah di sini).
export async function registerCandidate(id: string, data: CandidateData, job: CandidateJob): Promise<Result & { password?: string; userId?: string }> {
  const access = await requireHR();
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) return { error: "Calon tidak ditemukan." };
  const i = readInterview(c.interview);
  const viaData = c.status === "SIAP_DAFTAR" && !!i?.skipped && approvalComplete(i.approval);
  // Lolos wawancara: alur baru (SIAP_DAFTAR) atau data lama (wawancara dulu, lalu calon mengisi data).
  const viaInterview = (c.status === "SIAP_DAFTAR" || ["DIKIRIM", "DIKEMBALIKAN"].includes(c.status)) && interviewApproved(i);
  if (!i || (!viaData && !viaInterview)) return { error: "Calon ini belum lolos workflow approval." };
  const clean = readData(data, c.name, c.phone);
  // Status kerja dan jabatan mengikuti yang sudah disetujui approver.
  const approved = viaInterview ? { position: i.offer.position, employmentStatus: i.offer.employmentStatus } : { position: readJob(c.job).position, employmentStatus: readJob(c.job).employmentStatus };
  const j = { ...readJob(job), ...approved };
  if (j.employmentStatus === "TETAP") j.contractEndDate = "";
  await prisma.candidate.update({ where: { id }, data: { data: clean, job: j, reviewedBy: access.name ?? null } });
  const v = await validate(id, clean, j, c.email);
  if (v.missing.length || !v.org) { refresh(); return { error: "Belum bisa didaftarkan:", missing: v.missing }; }
  const { password, user } = await createEmployee(id, c, clean, j, v.org, { approvedBy: access.name ?? null, salary: viaInterview ? Number(i.offer.salary) || 0 : 0 });
  refresh();
  revalidatePath("/portal/admin/karyawan");
  return { password, userId: user.id };
}
