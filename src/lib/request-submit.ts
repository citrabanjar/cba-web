// Inti pengajuan karyawan (Cuti, Dinas Luar, Pinjaman, Tukar Shift, Lembur) dengan identitas pengaju sebagai parameter.
// Dipanggil server action tiap menu (identitas dari sesi login) dan oleh Absen Uji (pengajuan uji). Bukan server
// action, jadi tidak bisa dipanggil langsung dari browser. Aturannya sama persis dengan pengajuan dari menu.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { EmployeeLoan } from "@prisma/client";
import { addMonths, countLeaveDays, eligible, hasBalance, legacyType, todayDate, visibleBalances } from "@/lib/leave-balance";
import { firstApproverName, hasApprover } from "@/lib/approval";
import { workflowSteps } from "@/lib/workflow-settings";
import { delegateLabel, delegateSteps, isPersonApprover, routeTo, withDelegation } from "@/lib/delegation";
import { formatDate } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { dinasOn, isTime, OT_ACTIVE, otBreakText, plannedHours, restDaysOf, restKey, shiftConflicts, splEnabled } from "@/lib/overtime";
import { isPeriod, loanStepIds, type LoanFlow } from "@/lib/loans";
import { nextLoanNo } from "@/lib/loan-view";
import { activeManager, planLoan, topLeaderOf } from "@/lib/loan-flow";
import { OPEN_SWAP, activeManager as swapManager, hasAttendance, periodFinal, swapShifts } from "@/lib/shift-swap";

export type Who = { id: string; name: string | null };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ","));

// ─── Cuti ───
export type LeaveInput = { policyId: string; startDate: string; endDate: string; reason: string; dayPart: string; delegateId: string };

// opts.absence = diajukan lewat menu Pengajuan Absen (Potong Cuti Tahunan / Izin Tanpa Hak Cuti): hanya hari ini atau
// tanggal yang sudah lewat (31 hari terakhir), tanpa batas H-x dan tanpa delegasi; tetap lewat penyetuju cuti dan cek saldo.
export async function createLeave(userId: string, input: LeaveInput, opts: { absence?: boolean } = {}) {
  // Penyetuju = Level workflow Cuti bila aktif (menu Workflow); selain itu atasan langsung aktif, tanpa itu pengajuan tidak bisa dikirim.
  const wf = await workflowSteps("CUTI", userId);
  if (wf.error) return { error: wf.error };
  if (!wf.flow && !(await hasApprover(userId))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  // Penyetuju yang sedang cuti dengan delegasi → pengajuan baru dialihkan ke delegasinya.
  const flow = await withDelegation(wf.flow, userId);

  const { policyId, startDate, endDate, reason, dayPart } = input;
  if (!policyId || !startDate || !endDate || !reason) return { error: "Semua field wajib diisi." };

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { error: "Tanggal tidak valid." };
  if (end < start) return { error: "Tanggal akhir tidak boleh sebelum tanggal mulai." };

  // Tanggal cuti tidak boleh beririsan dengan cuti / dinas luar yang sedang diajukan atau sudah disetujui,
  // maupun dengan kehadiran Cuti / Dinas yang sudah tercatat. Pengecualian: dua cuti setengah hari yang
  // berbeda bagian (pagi & siang) pada tanggal yang sama.
  {
    const range = (a: Date, b: Date) => `${formatDate(a)}${a.getTime() === b.getTime() ? "" : ` – ${formatDate(b)}`}`;
    const overlap = { startDate: { lte: end }, endDate: { gte: start } };
    const newHalf = dayPart === "AWAL" || dayPart === "AKHIR" ? dayPart : null;
    const [leaves, trip, att] = await Promise.all([
      prisma.leaveRequest.findMany({ where: { userId, status: { in: ["PENDING", "APPROVED"] }, ...overlap }, orderBy: { startDate: "asc" }, include: { policy: { select: { name: true } } } }),
      prisma.businessTrip.findFirst({ where: { userId, status: { in: ["PENDING", "APPROVED"] }, ...overlap }, orderBy: { startDate: "asc" } }),
      prisma.attendance.findFirst({ where: { userId, status: { in: ["CUTI", "DINAS"] }, date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    ]);
    const leave = leaves.find((l) => !(newHalf && l.halfDay && l.halfDay !== newHalf && start.getTime() === end.getTime()
      && l.startDate.getTime() === start.getTime() && l.endDate.getTime() === end.getTime()));
    if (leave) {
      return { error: `Tanggal beririsan dengan ${leave.policy?.name ?? "cuti"} (${range(leave.startDate, leave.endDate)}) yang ${leave.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}. Pilih tanggal lain atau batalkan pengajuan itu dulu.` };
    }
    if (trip) {
      return { error: `Tanggal beririsan dengan dinas luar ${trip.destination} (${range(trip.startDate, trip.endDate)}) yang ${trip.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}.` };
    }
    if (att) return { error: `Tanggal ${formatDate(att.date)} sudah tercatat ${att.status === "CUTI" ? "Cuti" : "Dinas"} di kehadiran Anda.` };
  }

  const [policy, me] = await Promise.all([
    prisma.leavePolicy.findUnique({ where: { id: policyId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { employmentStatus: true, gender: true, joinDate: true } }),
  ]);
  if (!policy || !me) return { error: "Jenis cuti tidak ditemukan." };
  const today = todayDate();
  const ownBalance = hasBalance(policy) ? (await visibleBalances([userId])).find((r) => r.policyId === policy.id)?.balance ?? 0 : 0;
  if (!eligible(policy, me, today, ownBalance) || policy.category === "DINAS") return { error: "Jenis cuti ini tidak berlaku untuk Anda." };

  if (opts.absence) {
    if (end > today) return { error: "Pengajuan Absen hanya untuk hari ini atau tanggal yang sudah lewat. Untuk tanggal mendatang gunakan menu Cuti." };
    if (start.getTime() < today.getTime() - 31 * 86_400_000) return { error: "Pengajuan Absen hanya untuk 31 hari terakhir. Hubungi Admin untuk tanggal yang lebih lama." };
    if ((await periodFinal(start)) || (await periodFinal(end))) return { error: "Periode gaji bulan itu sudah final." };
  } else if (policy.noticeDays > 0 && start.getTime() < today.getTime() + policy.noticeDays * 86_400_000) {
    // Tidak masuk hari ini / tanggal lewat → arahkan ke menu Pengajuan Absen (Potong Cuti Tahunan / Izin Tanpa Hak Cuti).
    if (start <= today) return { error: "Cuti untuk hari ini atau tanggal yang sudah lewat tidak bisa diajukan di sini. Gunakan menu Pengajuan Absen (Potong Cuti Tahunan atau Izin Tanpa Hak Cuti)." };
    return { error: `Jenis cuti ini harus diajukan paling lambat ${policy.noticeDays} hari sebelum tanggal mulai.` };
  }

  // Delegasi tanggung jawab (Cuti Tahunan): wajib bila pemohon seorang penyetuju, opsional untuk karyawan lain.
  let delegate: { id: string; name: string } | null = null;
  if (policy.category === "TAHUNAN" && !opts.absence) {
    if (input.delegateId) {
      const d = await prisma.user.findUnique({ where: { id: input.delegateId }, select: { id: true, name: true, isActive: true } });
      if (!d?.isActive || d.id === userId) return { error: "Delegasi harus karyawan aktif selain Anda." };
      const busy = await prisma.leaveRequest.findFirst({ where: { userId: d.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } }, select: { id: true } });
      if (busy) return { error: `${d.name} juga mengajukan / sedang cuti di tanggal itu. Pilih delegasi lain.` };
      delegate = { id: d.id, name: d.name };
    } else if (await isPersonApprover(userId)) {
      return { error: "Anda memegang hak persetujuan, jadi pilih delegasi tanggung jawab selama cuti." };
    }
  }

  // Shift setengah hari (mis. Sabtu) dihitung 0,5 hari.
  let totalDays = await countLeaveDays(userId, start, end, policy.unit, { halfShifts: true });
  if (totalDays <= 0) return { error: "Tidak ada hari kerja di rentang tanggal itu." };
  // Setengah hari: satu tanggal kerja, dihitung 0,5 hari.
  const halfDay = dayPart === "AWAL" || dayPart === "AKHIR" ? dayPart : null;
  if (halfDay) {
    if (!policy.allowHalfDay) return { error: "Jenis cuti ini tidak bisa setengah hari." };
    if (start.getTime() !== end.getTime() || totalDays !== 1) return { error: "Cuti setengah hari hanya untuk satu tanggal hari kerja." };
    totalDays = 0.5;
  }

  if (policy.quota !== null && !hasBalance(policy)) {
    if (policy.unit === "BULAN") {
      if (end >= addMonths(start, policy.quota)) return { error: `Paling lama ${policy.quota} bulan untuk jenis cuti ini.` };
    } else if (totalDays > policy.quota) {
      return { error: `Paling banyak ${policy.quota} hari untuk jenis cuti ini.` };
    }
  }

  const unpaidDays = 0; // kelebihan saldo kini ditolak (bukan lagi cuti di luar tanggungan)
  if (hasBalance(policy) || policy.deductsAnnual) {
    const rows = await visibleBalances([userId]);
    const row = hasBalance(policy) ? rows.find((r) => r.policyId === policy.id) : rows[0];
    if (!row) return { error: "Saldo cuti Anda belum tersedia. Hubungi HRD." };
    if (row.problem) return { error: "Saldo cuti Anda belum bisa dihitung (tanggal masuk kosong). Hubungi HRD." };
    // Saldo kurang: pengajuan ditolak (keputusan pemilik 2026-11-17); kelebihannya diajukan sebagai Izin Tanpa Hak Cuti.
    // Saldo yang dipakai = saldo dikurangi pengajuan lain yang masih menunggu.
    const available = Math.max(0, row.balance - row.pending);
    if (totalDays > available) {
      return { error: `Saldo ${hasBalance(policy) ? policy.name : "Cuti Tahunan"} Anda tinggal ${fmt(available)} hari. Kurangi jumlah hari, atau ajukan kelebihannya sebagai Izin Tanpa Hak Cuti.` };
    }
  }

  const clash = await prisma.leaveRequest.findFirst({
    where: { userId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true },
  });
  if (clash) return { error: "Tanggal itu bertabrakan dengan pengajuan cuti lain." };

  await prisma.leaveRequest.create({
    data: {
      userId, policyId: policy.id, type: legacyType(policy.category),
      startDate: start, endDate: end, totalDays, halfDay, unpaidDays, reason, status: "PENDING", ...(flow ? { approval: flow } : {}),
      urgent: !!opts.absence,
      ...(delegate ? { delegateId: delegate.id, delegateName: delegate.name } : {}),
    },
  });

  // Notifikasi info (tanpa tombol keputusan), keputusan pemilik 2026-11-17:
  // - jalur default (atasan langsung memutus) → atasan dari atasan langsung mendapat info;
  // - jalur Workflow (atasan langsung bisa terlewati) → atasan langsung mendapat info, bila ia bukan penyetuju di jalur itu.
  const approver = await firstApproverName(flow, userId);
  const chainOf = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, manager: { select: { id: true, isActive: true, manager: { select: { id: true, isActive: true } } } } } });
  const m = chainOf?.manager?.isActive ? chainOf.manager : null;
  const approverIds = new Set((flow?.steps ?? []).flatMap((x) => (x.ids?.length ? x.ids : [x.id])));
  const infoTo = wf.flow
    ? (m && !approverIds.has(m.id) ? m.id : null)
    : (m?.manager?.isActive && m.manager.id !== userId && !approverIds.has(m.manager.id) ? m.manager.id : null);
  if (infoTo) {
    const range = `${formatDate(start)}${start.getTime() === end.getTime() ? "" : ` – ${formatDate(end)}`}`;
    await notify(infoTo, "Info: pengajuan cuti", `${chainOf?.name ?? ""} mengajukan ${policy.name} ${range} (${fmt(totalDays)} hari). Diputus oleh ${approver}.`, "/portal/notifikasi?modul=cuti");
  }

  revalidatePath("/portal/cuti");
  revalidatePath("/portal/lupa-absen");
  revalidatePath("/portal/kehadiran");
  revalidatePath("/portal/admin/leave");
  return { ok: true, days: fmt(totalDays), unpaid: unpaidDays > 0 ? fmt(unpaidDays) : null, approver };
}


// ─── Dinas Luar ───
export type TripInput = { destination: string; purpose: string; startDate: string; endDate: string };
export async function submitTripFor(u: Who, input: TripInput) {
  // Penyetuju = Level workflow Dinas Luar bila aktif (menu Workflow); selain itu atasan langsung aktif.
  const { flow: wfFlow, error: flowError } = await workflowSteps("DINAS", u.id);
  if (flowError) return { error: flowError };
  if (!wfFlow && !(await hasApprover(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  // Penyetuju yang sedang cuti dengan delegasi → pengajuan baru dialihkan ke delegasinya.
  const flow = await withDelegation(wfFlow, u.id);

  const { destination, purpose, startDate, endDate } = input;

  if (!destination || !purpose || !startDate || !endDate) {
    return { error: "Semua field wajib diisi." };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: "Tanggal tidak valid." };
  }
  if (end < start) {
    return { error: "Tanggal akhir tidak boleh sebelum tanggal mulai." };
  }

  // Tanggal dinas tidak boleh beririsan dengan dinas atau cuti yang sedang diajukan / sudah disetujui,
  // maupun dengan catatan kehadiran Dinas / Cuti yang sudah ada.
  const userId = u.id;
  const range = (a: Date, b: Date) => `${formatDate(a)}${a.getTime() === b.getTime() ? "" : ` – ${formatDate(b)}`}`;
  const overlap = { startDate: { lte: end }, endDate: { gte: start } };
  const [trip, leave, att, ot] = await Promise.all([
    prisma.businessTrip.findFirst({ where: { userId, status: { in: ["PENDING", "APPROVED"] }, ...overlap }, orderBy: { startDate: "asc" } }),
    prisma.leaveRequest.findFirst({ where: { userId, status: { in: ["PENDING", "APPROVED"] }, ...overlap }, orderBy: { startDate: "asc" } }),
    prisma.attendance.findFirst({ where: { userId, status: { in: ["DINAS", "CUTI"] }, date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    prisma.overtime.findFirst({ where: { userId, status: { in: OT_ACTIVE }, date: { gte: start, lte: end } }, orderBy: { date: "asc" }, include: { order: { select: { number: true } } } }),
  ]);
  if (trip) {
    return { error: `Tanggal beririsan dengan dinas luar ${trip.destination} (${range(trip.startDate, trip.endDate)}) yang ${trip.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}. Pilih tanggal lain atau batalkan pengajuan itu dulu.` };
  }
  if (leave) {
    return { error: `Tanggal beririsan dengan cuti (${range(leave.startDate, leave.endDate)}) yang ${leave.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}.` };
  }
  if (att) {
    return { error: `Tanggal ${formatDate(att.date)} sudah tercatat ${att.status === "DINAS" ? "Dinas" : "Cuti"} di kehadiran Anda.` };
  }

  if (ot) {
    return { error: `Tanggal beririsan dengan lembur ${ot.order ? `${ot.order.number} ` : ""}${formatDate(ot.date)} (${ot.startTime}–${ot.endTime}). Lembur dan dinas tidak boleh di tanggal yang sama; batalkan lemburnya dulu.` };
  }

  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  await prisma.businessTrip.create({
    data: {
      userId: u.id,
      ...(flow ? { approval: flow } : {}),
      destination,
      purpose,
      startDate: start,
      endDate: end,
      totalDays,
      status: "PENDING",
    },
  });

  revalidatePath("/portal/dinas");
  return { ok: true, days: totalDays, approver: await firstApproverName(flow, u.id) };
}

// ─── Pinjaman ───
export type LoanInput = { amount: number; tenor: number; startPeriod: string; purpose: string; recalc?: { mergeIds: string[]; installment?: number } };
export async function requestLoanFor(u: Who, input: LoanInput): Promise<{ error?: string; proposed?: string }> {
  const amount = Math.round(Number(input.amount) || 0);
  let tenor = Math.round(Number(input.tenor) || 0);
  if (amount < 1000) return { error: "Jumlah pinjaman wajib diisi." };
  const each = Math.round(Number(input.recalc?.installment) || 0);
  if (!(input.recalc?.mergeIds.length && each > 0) && (tenor < 1 || tenor > 120)) return { error: "Jumlah angsuran 1-120 kali." };
  if (!isPeriod(input.startPeriod)) return { error: "Pilih periode potongan pertama." };
  if (!input.purpose.trim()) return { error: "Keperluan wajib diisi." };
  const pending = await prisma.employeeLoan.count({ where: { userId: u.id, status: "PENDING" } });
  if (pending) return { error: "Masih ada pengajuan yang menunggu persetujuan." };
  // Ringkasan bila masih ada pinjaman berjalan: potongan per bulan sebelum → sesudah (dan hitung ulang bila digabung).
  let request;
  if (await prisma.employeeLoan.count({ where: { userId: u.id, status: "BERJALAN" } })) {
    const mergeIds = input.recalc?.mergeIds ?? [];
    const p = await planLoan({ userId: u.id } as EmployeeLoan, { principal: amount, tenor, startPeriod: input.startPeriod, installment: mergeIds.length && each > 0 ? each : undefined, mergeIds }, true);
    if ("error" in p) return { error: p.error };
    request = p.plan;
    if (mergeIds.length) tenor = p.rows.length;
  }
  // Menu Workflow modul Pinjaman (bila aktif) menggantikan jalur normal sepenuhnya:
  // level sebelum Pemeriksa dokumen memutus dulu → level Pemeriksa dokumen memeriksa & menyusun angsuran → level terakhir memutus.
  const wf = await workflowSteps("PINJAMAN", u.id);
  if (wf.error) return { error: wf.error };
  let flow: LoanFlow, stage: string;
  if (wf.flow) {
    const raw = wf.flow.steps, last = raw[raw.length - 1];
    // Delegasi diterapkan ke langkah sebelum pemutus; pemutus dialihkan saat Admin mengirim hasil pemeriksaan.
    const steps = [...(await delegateSteps({ ...wf.flow, steps: raw.slice(0, -1) }, u.id)).steps, last];
    const ci = steps.findIndex((x) => x.check);
    if (ci === steps.length - 1) return { error: "Pemutus pinjaman pada Workflow tidak bisa memutus pengajuannya sendiri. Hubungi HRD." };
    const checker = ci >= 0 ? steps[ci] : null;
    const pre = steps.slice(0, ci >= 0 ? ci : -1).map((x) => ({ id: x.id, ...(x.ids?.length ? { ids: x.ids } : {}), name: x.name, decision: "" as const, at: "", note: "" }));
    const topIds = loanStepIds(last);
    const checkIds = checker ? loanStepIds(checker) : [];
    flow = {
      workflow: true, ...(request ? { request } : {}), pre, topId: last.id, topIds, topName: last.name,
      ...(checker ? { checkIds, checkName: checker.name } : {}), who: [...new Set([...pre.flatMap(loanStepIds), ...checkIds, ...topIds])],
    };
    stage = pre.length ? "ATASAN" : "ADMIN";
  } else {
    const manager = await activeManager(u.id);
    if (!manager) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
    const top = (await topLeaderOf(u.id)) ?? manager;
    // Atasan langsung = pimpinan puncak: tahap atasan dilewati, langsung ke pemeriksaan Admin; pimpinan memutus setelahnya.
    const skip = manager.id === top.id;
    const m = await routeTo(manager, u.id);
    flow = { ...(request ? { request } : {}), ...(skip ? {} : { managerId: m.id, managerName: delegateLabel(m) }), topId: top.id, topName: top.name, who: [m.id, top.id] };
    stage = skip ? "ADMIN" : "ATASAN";
  }
  await prisma.employeeLoan.create({
    data: {
      userId: u.id, seqNo: await nextLoanNo(u.id), principal: amount, tenor, startPeriod: input.startPeriod,
      purpose: input.purpose.trim().slice(0, 500), createdBy: u.name ?? null, stage, flow,
    },
  });
  // Penyetuju yang mendapat giliran cukup melihat kartu "Menunggu keputusan Anda" (tanpa notifikasi ganda, sama seperti cuti).
  // Pemeriksa dan pimpinan cukup melihat kartu pengajuan di Notifikasi → Pinjaman (tanpa notifikasi ganda).
  revalidatePath("/portal/pinjaman");
  revalidatePath("/portal/admin/pinjaman");
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/notifikasi");
  // Nama penyetuju pertama untuk pemberitahuan "diajukan ke … untuk approval".
  const first = stage === "ATASAN" ? (flow.pre?.[0]?.name ?? flow.managerName ?? "atasan langsung") : flow.checkName ?? "Admin";
  return { proposed: first };
}

// ─── Tukar shift ───
const SWAP_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SWAP_ATT = "Salah satu karyawan sudah check-in/check-out di tanggal itu, tukar shift tidak bisa lagi.";
function swapRefresh() {
  for (const p of ["/portal/tukar-shift", "/portal/persetujuan", "/portal/notifikasi", "/portal/dashboard", "/portal/profil", "/portal/admin/schedule"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}
export type SwapInput = { date: string; partnerId: string; reason: string };
export async function submitSwapFor(u: Who, input: SwapInput): Promise<{ error?: string }> {
  if (!SWAP_DATE.test(input.date) || !input.partnerId) return { error: "Pilih tanggal dan rekan." };
  if (input.partnerId === u.id) return { error: "Pilih rekan lain." };
  const date = new Date(`${input.date}T00:00:00Z`);
  const partner = await prisma.user.findUnique({ where: { id: input.partnerId }, select: { isActive: true } });
  if (!partner?.isActive) return { error: "Rekan tidak ditemukan atau tidak aktif." };
  if (!(await swapManager(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif. Hubungi HRD." };
  if (!(await swapManager(input.partnerId))) return { error: "Atasan langsung rekan belum diatur atau sudah tidak aktif. Hubungi HRD." };
  if (await periodFinal(date)) return { error: "Periode gaji bulan itu sudah final." };
  if (await hasAttendance([u.id, input.partnerId], date)) return { error: SWAP_ATT };
  const s = await swapShifts(u.id, input.partnerId, date);
  if ("error" in s.a) return { error: `Jadwal Anda: ${s.a.error}.` };
  if ("error" in s.b) return { error: `Jadwal rekan: ${s.b.error}.` };
  if (s.a.code === s.b.code) return { error: "Shift Anda dan rekan sama, tidak perlu ditukar." };
  const busy = await prisma.shiftSwapRequest.findFirst({
    where: { date, status: { in: OPEN_SWAP }, OR: [{ requesterId: { in: [u.id, input.partnerId] } }, { partnerId: { in: [u.id, input.partnerId] } }] },
  });
  if (busy) return { error: "Sudah ada pengajuan tukar shift yang berjalan di tanggal itu untuk Anda atau rekan." };
  await prisma.shiftSwapRequest.create({
    data: { requesterId: u.id, partnerId: input.partnerId, date, requesterShift: s.a.code, partnerShift: s.b.code, reason: input.reason.trim() || null },
  });
  swapRefresh();
  return {};
}

// ─── Lembur (pengajuan karyawan) ───
function otRefresh() {
  for (const p of ["/portal/lembur", "/portal/persetujuan", "/portal/notifikasi", "/portal/admin/lembur", "/portal/profil"]) revalidatePath(p);
}
export type OvertimeInput = { date: string; startTime: string; endTime: string; reason: string };
export async function submitOvertimeFor(u: Who, input: OvertimeInput): Promise<{ error?: string; approver?: string }> {
  if (await splEnabled()) return { error: "Lembur memakai Surat Perintah Lembur dari Admin; pengajuan sendiri tidak dipakai." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal lembur wajib diisi." };
  if (!isTime(input.startTime) || !isTime(input.endTime)) return { error: "Jam mulai dan jam selesai lembur wajib diisi." };
  if (input.startTime === input.endTime) return { error: "Jam selesai harus berbeda dengan jam mulai." };
  if (!input.reason.trim()) return { error: "Tulis keperluan lembur." };
  const date = new Date(`${input.date}T00:00:00Z`);
  // Istirahat lembur dipotong otomatis (hari kerja 18:00-19:00; hari libur juga 12:00-13:00) bila tercakup penuh.
  const row = { date, startTime: input.startTime, endTime: input.endTime, breakStart: null, breakEnd: null };
  const rest = (await restDaysOf([{ userId: u.id, date }])).has(restKey(u.id, date));
  if (plannedHours(row, rest) < 1) return { error: `Lembur minimal 1 jam (di luar istirahat ${otBreakText(rest)}).` };
  const conflict = (await shiftConflicts([u.id], date, input.startTime, input.endTime)).get(u.id);
  if (conflict) return { error: `Jam lembur bentrok dengan ${conflict}.` };
  const clash = await prisma.overtime.findFirst({ where: { userId: u.id, date, status: { in: ["PENDING", "APPROVED", "MENUNGGU_KARYAWAN", "DISETUJUI"] } } });
  if (clash) return { error: `Sudah ada lembur di ${formatDate(date)} (${clash.startTime}–${clash.endTime}).` };
  const dinas = (await dinasOn([u.id], date)).get(u.id);
  if (dinas) return { error: `Tanggal ${formatDate(date)} beririsan dengan ${dinas}; lembur tidak bisa diajukan saat dinas.` };
  const { flow: wfFlow, error } = await workflowSteps("LEMBUR", u.id);
  if (error) return { error };
  if (!wfFlow && !(await hasApprover(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  // Penyetuju yang sedang cuti dengan delegasi → pengajuan baru dialihkan ke delegasinya.
  const flow = await withDelegation(wfFlow, u.id);
  await prisma.overtime.create({
    data: { userId: u.id, ...row, reason: input.reason.trim(), status: "PENDING", createdBy: u.name, ...(flow ? { approval: flow } : {}) },
  });
  otRefresh();
  return { approver: await firstApproverName(flow, u.id) };
}
