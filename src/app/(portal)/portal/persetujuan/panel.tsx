import { prisma } from "@/lib/prisma";
import { type Approver, noWorkflow, requesterFilter, reviewsProfiles } from "@/lib/approval";
import type { FamilyRow, ProfileChanges } from "@/lib/profile-change";
import { actionableApprovers, APPROVAL_STATUSES, currentReviewer, readApproval, readInterview, stepCandidates } from "@/lib/onboarding-interview";
import { getMasterOptions } from "@/lib/master-data";
import { CANDIDATE_STATUS, readData, readJob } from "@/lib/onboarding";
import { Prisma } from "@prisma/client";
import { plannedHours, restDaysOf, restKey } from "@/lib/overtime";
import PersetujuanClient, { type ApprovalItem, type InterviewItem, type LoanItem, type ProfileItem, type SwapItem } from "./PersetujuanClient";
import { loanEarlyApprover, loanReviewTurn, loanTurn, readLoanFlow } from "@/lib/loans";
import { canEditMenu } from "@/lib/roles";

const LEGACY: Record<string, string> = { TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// Persetujuan (cuti, dinas, lembur, tukar shift, perubahan data, wawancara) untuk atasan / approver / Admin.
// Tampil sebagai modul "Persetujuan" di halaman Notifikasi; pemanggil memastikan a adalah approver.
export async function loadApprovals(a: Approver) {

  const user = requesterFilter(a);
  const since = daysAgo(60);
  const who = { select: { id: true, name: true, employeeId: true, position: true, department: { select: { name: true } } } };
  const reviewer = reviewsProfiles(a);
  // Pemantau (Super Admin & Admin Data Karyawan) melihat semua perubahan data yang masih menunggu, tanpa tombol putus.
  const monitor = reviewer || a.role === "SUPER_ADMIN";
  const loanAdmin = canEditMenu({ role: a.role, menuAccess: a.menuAccess ?? [] }, "pinjaman");
  const [leaves, trips, profileReqs, swapReqs, candidates, editReqs, ots, loanReqs] = await Promise.all([
    // Atasan langsung (pengajuan tanpa workflow) + pengajuan lewat menu Workflow (disaring per level di bawah).
    prisma.leaveRequest.findMany({
      where: { OR: [{ status: "PENDING" }, { approvedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }], AND: [{ OR: [{ user, ...noWorkflow }, { approval: { not: Prisma.DbNull } }] }] },
      include: { user: who, policy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    prisma.businessTrip.findMany({
      where: { OR: [{ status: "PENDING" }, { approvedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }], AND: [{ OR: [{ user, ...noWorkflow }, { approval: { not: Prisma.DbNull } }] }] },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    // Perubahan data pribadi dari Profil Saya (Admin Data Karyawan).
    // Dengan Workflow "Perubahan Data": penyetuju level (dicek per baris di bawah).
    prisma.profileChangeRequest.findMany({
      where: { userId: { not: a.id }, OR: [{ status: "PENDING" }, { decidedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }] },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    // Tukar shift: atasan langsung pemohon (A) dan atasan langsung rekan (B).
    prisma.shiftSwapRequest.findMany({
      where: { OR: [{ managerAId: a.id }, { managerBId: a.id }], status: { in: ["MENUNGGU_ATASAN", "DISETUJUI", "DITOLAK"] }, createdAt: { gte: since } },
      include: { requester: who, partner: who }, orderBy: { date: "asc" }, take: 200,
    }),
    // Approval Pra-Karyawan: hasil wawancara atau data calon (workflow di Pengaturan → Pra-Karyawan).
    prisma.candidate.findMany({
      where: { interview: { not: Prisma.DbNull }, OR: [{ status: { in: [...APPROVAL_STATUSES, "WAWANCARA"] } }, { updatedAt: { gte: since } }] },
      select: { id: true, name: true, email: true, phone: true, status: true, interview: true, job: true, data: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 100,
    }),
    // Ubah data karyawan oleh Admin berhak "Ajukan": diputus atasan langsung si Admin.
    prisma.employeeEditRequest.findMany({
      where: {
        OR: [
          { approverId: a.id, OR: [{ status: "PENDING" }, { decidedAt: { gte: since } }, { createdAt: { gte: since } }] },
          { data: { path: ["__approval"], array_contains: [{ id: a.id }] }, OR: [{ status: "PENDING" }, { decidedAt: { gte: since } }, { createdAt: { gte: since } }] },
          // Pengajuan saya sendiri (Admin pengaju): dipantau sampai diputus, lalu masuk riwayat.
          { requesterId: a.id, OR: [{ status: "PENDING" }, { decidedAt: { gte: since } }, { createdAt: { gte: since } }] },
          ...(monitor ? [{ status: "PENDING" }] : []),
        ],
      },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 100,
    }),
    // Pengajuan lembur karyawan (bila SPL tidak dipakai).
    prisma.overtime.findMany({
      where: { orderId: null, OR: [{ status: "PENDING" }, { decidedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }], AND: [{ OR: [{ user, ...noWorkflow }, { approval: { not: Prisma.DbNull } }] }] },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    // Pengajuan pinjaman: atasan langsung (tahap ATASAN) dan pimpinan puncak (melihat sejak pemeriksaan Admin, memutus di tahap PIMPINAN).
    prisma.employeeLoan.findMany({
      where: {
        OR: [
          { flow: { path: ["managerId"], equals: a.id } }, { flow: { path: ["topId"], equals: a.id } }, { flow: { path: ["who"], array_contains: [a.id] } },
          // Pemeriksa dokumen jalur normal (Admin berhak Edit Pinjaman): pengajuan yang menunggu pemeriksaan.
          ...(loanAdmin ? [{ status: "PENDING", OR: [{ stage: "ADMIN" }, { stage: null }] }] : []),
        ],
        AND: [{ OR: [{ status: "PENDING" }, { updatedAt: { gte: since } }] }],
      },
      include: { user: who }, orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);
  const otRest = await restDaysOf(ots);

  const person = (u: (typeof leaves)[number]["user"]) => ({
    name: u.name, employeeId: u.employeeId, position: u.position, department: u.department?.name ?? null,
  });
  // Pengajuan lewat Workflow hanya tampil untuk approver yang ada di levelnya; tombol hanya saat gilirannya.
  const flowOf = (raw: unknown) => {
    const f = readApproval(raw);
    if (!f) return { show: true, steps: null, mine: true };
    return { show: f.steps.some((s) => stepCandidates(s).includes(a.id)), steps: f, mine: actionableApprovers(f).includes(a.id) };
  };
  const items: ApprovalItem[] = [
    ...leaves.filter((l) => flowOf(l.approval).show).map((l) => ({
      flow: flowOf(l.approval).steps, mine: flowOf(l.approval).mine,
      id: l.id, kind: "CUTI" as const, status: l.status, person: person(l.user),
      title: l.policy?.name ?? LEGACY[l.type] ?? l.type, start: ymd(l.startDate), end: ymd(l.endDate), days: l.totalDays,
      delegate: l.delegateName,
      halfDay: l.halfDay, unpaidDays: l.unpaidDays, reason: l.reason, note: l.note, decidedBy: l.approvedBy,
      decidedAt: l.approvedAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString(),
    })),
    ...trips.filter((t) => flowOf(t.approval).show).map((t) => ({
      flow: flowOf(t.approval).steps, mine: flowOf(t.approval).mine,
      id: t.id, kind: "DINAS" as const, status: t.status, person: person(t.user),
      title: `Dinas Luar · ${t.destination}`, start: ymd(t.startDate), end: ymd(t.endDate), days: t.totalDays,
      halfDay: null, unpaidDays: 0, reason: t.purpose, note: t.note, decidedBy: t.approvedBy,
      decidedAt: t.approvedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
    })),
    ...ots.filter((o) => flowOf(o.approval).show).map((o) => ({
      flow: flowOf(o.approval).steps, mine: flowOf(o.approval).mine,
      id: o.id, kind: "LEMBUR" as const, status: o.status, person: person(o.user),
      title: "Lembur", start: ymd(o.date), end: ymd(o.date), days: 0,
      time: `${o.startTime}–${o.endTime}${o.breakStart ? ` · istirahat ${o.breakStart}–${o.breakEnd}` : ""} · ${String(plannedHours(o, otRest.has(restKey(o.userId, o.date)))).replace(".", ",")} jam`,
      halfDay: null, unpaidDays: 0, reason: o.reason ?? "", note: o.note, decidedBy: o.decidedBy,
      decidedAt: o.decidedAt?.toISOString() ?? null, createdAt: o.createdAt.toISOString(),
    })),
  ];

  // Tanpa Workflow: Admin Data Karyawan memutus. Dengan Workflow: tampil untuk penyetuju di jejaknya (memutus bila levelnya
  // sedang berjalan) dan untuk pemantau (Super Admin & Admin Data Karyawan).
  const profiles: ProfileItem[] = profileReqs.flatMap((r) => {
    const flow = readApproval(r.approval);
    const inFlow = !!flow?.steps.some((s) => stepCandidates(s).includes(a.id));
    if (flow ? !inFlow && !monitor : !reviewer) return [];
    return [{
      id: r.id, status: r.status, person: person(r.user), changes: r.changes as ProfileChanges, family: (r.family as FamilyRow[] | null) ?? null,
      reason: r.reason, note: r.note, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      mine: r.status === "PENDING" && (flow ? actionableApprovers(flow).includes(a.id) : reviewer),
      flow: flow ? flow.steps.map((s) => ({ name: s.name, decision: s.decision, by: s.by ?? "" })) : null,
    }];
  });

  const swaps: SwapItem[] = swapReqs.map((s) => ({
    id: s.id, date: ymd(s.date), status: s.status, requester: person(s.requester), partner: person(s.partner),
    requesterShift: s.requesterShift, partnerShift: s.partnerShift, reason: s.reason, note: s.note,
    mine: (s.managerAId === a.id && !s.managerAAt) || (s.managerBId === a.id && !s.managerBAt),
    managerA: s.managerAName, managerB: s.managerBId ? s.managerBName : undefined, decidedBy: s.decidedBy,
  }));

  const interviews: InterviewItem[] = candidates.flatMap((c) => {
    const iv = readInterview(c.interview);
    // Pewawancara (penilaian) atau approver calon ini.
    const myReview = iv?.reviews.find((x) => x.id === a.id) ?? null;
    if (!iv || (!myReview && !iv.approval?.steps.some((x) => stepCandidates(x).includes(a.id)))) return [];
    // Wawancara berurutan: hanya pewawancara yang mendapat giliran yang bisa mengisi.
    const reviewing = c.status === "WAWANCARA" && !!myReview && currentReviewer(iv)?.id === a.id;
    const d = readData(c.data, c.name, c.phone);
    return [{
      id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status, statusLabel: CANDIDATE_STATUS[c.status]?.label ?? c.status,
      interview: iv, job: readJob(c.job), review: reviewing ? myReview : null,
      candidate: ({ name: d.name, email: c.email, phone: d.phone, birthPlace: d.birthPlace, birthDate: d.birthDate, gender: d.gender, religion: d.religion,
      maritalStatus: d.maritalStatus, idType: d.idType, ktpNumber: d.ktpNumber, address: d.address, addressRegionName: d.addressRegionName }),
      mine: reviewing || (APPROVAL_STATUSES.includes(c.status) && actionableApprovers(iv.approval).includes(a.id)),
    }];
  });

  // Pilihan tawaran kerja untuk pewawancara (departemen, jabatan, cabang, calon atasan).
  // Pewawancara (usulan penempatan) dan approver jalur wawancara (usulan final) butuh pilihan organisasi.
  const master = interviews.some((i) => i.review || (i.mine && !i.interview.skipped && i.interview.reviews.length > 0))
    ? { ...(await getMasterOptions()), managers: (await prisma.user.findMany({ where: { isActive: true, employeeId: { not: null } }, orderBy: { employeeId: "asc" }, select: { id: true, name: true, employeeId: true } })).map((u) => ({ value: u.id, label: `${u.employeeId} - ${u.name}` })) }
    : null;

  const edits = editReqs.map((r) => ({
    id: r.id, status: r.status, person: person(r.user), requester: r.requesterName, approver: r.approverName, note: r.note,
    mine: r.status === "PENDING" && r.approverId === a.id,
    kind: String((r.data as { __kind?: unknown } | null)?.__kind ?? ""),
    title: ((r.data as { __title?: unknown } | null)?.__title as string | undefined) ?? null,
    hasTarget: !(r.data as { __kind?: unknown } | null)?.__kind || !!(r.data as { __target?: unknown } | null)?.__target,
    steps: (((r.data as { __approval?: unknown } | null)?.__approval as { name: string; level: number; decision: string; at: string; note: string }[] | undefined) ?? []),
    summary: (r.summary as { field: string; oldValue: string | null; newValue: string | null }[]) ?? [],
    createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
  // Pimpinan puncak baru melihat pengajuan setelah disetujui atasan (tahap pemeriksaan Admin dan seterusnya).
  const loans: LoanItem[] = loanReqs.filter((l) => {
    const f = readLoanFlow(l.flow);
    if (loanReviewTurn(l.status, l.stage, f, a.id, l.userId, loanAdmin)) return true;
    if (!loanEarlyApprover(f, a.id) && !(f.topId === a.id || f.topIds?.includes(a.id) || f.who?.includes(a.id))) return false;
    return loanEarlyApprover(f, a.id) || (l.status === "PENDING" ? l.stage !== "ATASAN" : !!f.adminAt);
  }).map((l) => {
    const flow = readLoanFlow(l.flow);
    const review = loanReviewTurn(l.status, l.stage, flow, a.id, l.userId, loanAdmin);
    return {
      review,
      id: l.id, status: l.status, stage: l.status === "PENDING" ? l.stage ?? "ADMIN" : null, person: person(l.user), principal: l.principal, tenor: l.tenor,
      startPeriod: l.startPeriod, purpose: l.purpose, note: l.note, flow, createdAt: l.createdAt.toISOString(), decidedAt: l.approvedAt?.toISOString() ?? null,
      mine: review || loanTurn(l.status, l.stage, flow, a.id),
    };
  });
  return { items, profiles: profiles.length || reviewer ? profiles : null, swaps, interviews, master, edits, loans };
}

export type ApprovalData = Awaited<ReturnType<typeof loadApprovals>>;

// Isi modul Persetujuan (semua pengajuan + riwayat), dari data yang sudah dimuat.
export default function PersetujuanPanel({ data }: { data: ApprovalData }) {
  return <PersetujuanClient {...data} />;
}
