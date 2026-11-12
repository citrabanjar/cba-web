import { prisma } from "@/lib/prisma";
import { AGENT_SETTING_KEY, dueReminders, normalizeAgentSettings, type AgentSettings, type DueReminder } from "@/lib/agent-hrd";
import { PAYROLL_SETTING_KEY, DEFAULT_PAYROLL_SETTINGS, type PayrollSettings } from "@/lib/payroll";
import { TAX_SETTING_KEY } from "@/lib/pph21";
import { loadInsights, type Task } from "./insights";
import { getOnboardingSettings } from "@/lib/onboarding-settings";

const DAY = 86_400_000;
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

export async function getAgentSettings(): Promise<AgentSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: AGENT_SETTING_KEY } });
  return normalizeAgentSettings(row?.value);
}

// Satu langkah panduan Setup Awal (SOP migrasi). Selesai/belum dideteksi dari data portal.
export type SetupStep = { key: string; phase: string; title: string; hint: string; done: boolean; note?: string; href: string; optional?: boolean };

async function loadSetup(): Promise<SetupStep[]> {
  const year = Number(todayKey().slice(0, 4));
  const active = { isActive: true, role: { not: "SUPER_ADMIN" as const } };
  const [branches, depts, positions, locations, shifts, holidays, policies, components, payrollSetting, taxSetting,
    employees, noPhoto, noSalary, leaveOpening, loanOpening, finalRuns] = await Promise.all([
    prisma.branch.count(), prisma.department.count(), prisma.position.count(),
    prisma.workLocation.count({ where: { isActive: true } }),
    prisma.workShift.count(),
    prisma.holiday.count({ where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } }),
    prisma.leavePolicy.count(),
    prisma.payComponent.count({ where: { isActive: true } }),
    prisma.appSetting.findUnique({ where: { key: PAYROLL_SETTING_KEY } }),
    prisma.appSetting.findUnique({ where: { key: TAX_SETTING_KEY } }),
    prisma.user.count({ where: active }),
    prisma.user.count({ where: { ...active, photo: { is: null } } }),
    prisma.user.count({ where: { ...active, salaries: { none: {} } } }),
    prisma.leaveBalanceEntry.count({ where: { kind: "SALDO_AWAL" } }),
    prisma.employeeLoan.count({ where: { isOpening: true } }),
    prisma.payrollRun.count({ where: { status: "FINAL" } }),
  ]);
  const taxYears = Object.keys((taxSetting?.value ?? {}) as Record<string, unknown>);
  return [
    { key: "org", phase: "1. Parameter organisasi", title: "Cabang, Departemen, Jabatan", hint: "Isi lewat Upload Parameter (template Excel) atau satu per satu di menu Organisasi.",
      done: branches > 0 && depts > 0 && positions > 0, note: `${branches} cabang · ${depts} departemen · ${positions} jabatan`, href: "/portal/admin/setup" },
    { key: "location", phase: "1. Parameter organisasi", title: "Lokasi absen (GPS)", hint: "Titik lokasi dan radius untuk absensi.",
      done: locations > 0, note: `${locations} lokasi`, href: "/portal/admin/schedule" },
    { key: "shift", phase: "2. Kebijakan", title: "Shift & pola kerja", hint: "Shift kerja dan pola jadwal karyawan.",
      done: shifts > 0, note: `${shifts} shift`, href: "/portal/admin/schedule" },
    { key: "holiday", phase: "2. Kebijakan", title: `Kalender libur ${year}`, hint: "Libur nasional, cuti bersama, dan libur perusahaan.",
      done: holidays > 0, note: `${holidays} hari libur`, href: "/portal/admin/schedule" },
    { key: "leave", phase: "2. Kebijakan", title: "Setup Leave (jenis cuti)", hint: "Kebijakan cuti dan jatahnya.",
      done: policies > 0, note: `${policies} jenis cuti`, href: "/portal/admin/leave" },
    { key: "pay", phase: "3. Payroll", title: "Komponen gaji & pengaturan payroll", hint: "Komponen Input/Rumus, periode gaji, tanggal gajian.",
      done: components > 0 && !!payrollSetting, note: payrollSetting ? `${components} komponen` : "Pengaturan Payroll belum disimpan", href: "/portal/admin/payroll" },
    { key: "tax", phase: "3. Payroll", title: `PTKP & tarif PPh 21 tahun ${year}`, hint: "Simpan Pengaturan PPh 21 tahun berjalan (dan cek tarif TER).",
      done: taxYears.includes(String(year)), href: "/portal/admin/payroll" },
    { key: "employees", phase: "4. Upload data", title: "Data karyawan", hint: "Import Karyawan dari template Excel (Super Admin).",
      done: employees > 0, note: `${employees} karyawan aktif`, href: "/portal/admin/karyawan" },
    { key: "photo", phase: "4. Upload data", title: "Foto karyawan", hint: "Upload Foto bisa satu folder sekaligus; nama file = Employee ID.",
      done: employees > 0 && noPhoto === 0, note: employees ? `${employees - noPhoto}/${employees} sudah ada foto` : undefined, href: "/portal/admin/karyawan" },
    { key: "salary", phase: "4. Upload data", title: "Gaji pokok karyawan", hint: "Setiap karyawan aktif punya data gaji (Penyesuaian Gaji / import).",
      done: employees > 0 && noSalary === 0, note: employees ? `${noSalary} karyawan belum ada gaji` : undefined, href: "/portal/admin/karyawan" },
    { key: "leave-balance", phase: "4. Upload data", title: "Saldo awal cuti", hint: "Upload saldo cuti dari aplikasi lama di Leave → Saldo Cuti.",
      done: leaveOpening > 0, note: `${leaveOpening} baris saldo awal`, href: "/portal/admin/leave" },
    { key: "loan-balance", phase: "4. Upload data", title: "Saldo awal pinjaman", hint: "Upload pinjaman yang masih berjalan di aplikasi lama (bila ada).",
      done: loanOpening > 0, note: `${loanOpening} pinjaman saldo awal`, href: "/portal/admin/pinjaman", optional: true },
    { key: "first-run", phase: "5. Mulai jalan", title: "Proses Gaji pertama difinalkan", hint: "Hitung, cek, lalu finalkan gaji pertama di portal.",
      done: finalRuns > 0, href: "/portal/admin/payroll" },
  ];
}

// Pengecekan Payroll & Pajak.
async function loadPayrollTasks(s: AgentSettings): Promise<Task[]> {
  const today = todayKey();
  const [y, m, d] = today.split("-").map(Number);
  const period = today.slice(0, 7);
  const active = { isActive: true, role: { not: "SUPER_ADMIN" as const } };
  const [noSalary, pphComp, payRow, run, taxRow, loans] = await Promise.all([
    prisma.user.findMany({ where: { ...active, salaries: { none: {} } }, orderBy: { name: "asc" }, select: { id: true } }),
    prisma.payComponent.findFirst({ where: { method: "PPH21", isActive: true }, select: { id: true } }),
    prisma.appSetting.findUnique({ where: { key: PAYROLL_SETTING_KEY } }),
    prisma.payrollRun.findUnique({ where: { period }, select: { status: true } }),
    prisma.appSetting.findUnique({ where: { key: TAX_SETTING_KEY } }),
    prisma.employeeLoan.findMany({
      where: { status: "BERJALAN", user: { employmentStatus: "KONTRAK", contractEndDate: { not: null } } },
      select: { userId: true, installments: { where: { status: "BELUM" }, select: { period: true } }, user: { select: { contractEndDate: true } } },
    }),
  ]);
  const noPph = pphComp
    ? await prisma.user.findMany({ where: { ...active, payComponents: { none: { componentId: pphComp.id } } }, orderBy: { name: "asc" }, select: { id: true } })
    : [];
  const settings = { ...DEFAULT_PAYROLL_SETTINGS, ...((payRow?.value ?? {}) as Partial<PayrollSettings>) };
  // Tanggal gajian bulan ini (0 = akhir bulan).
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const payDay = settings.payDay > 0 ? Math.min(settings.payDay, last) : last;
  const daysToPay = payDay - d;
  const runDue = daysToPay >= 0 && daysToPay <= s.payrollRemindDays && run?.status !== "FINAL";
  const taxYears = Object.keys((taxRow?.value ?? {}) as Record<string, unknown>);
  const lateLoans = loans.filter((l) => {
    const end = l.user.contractEndDate!.toISOString().slice(0, 7);
    return l.installments.some((i) => i.period > end);
  });
  const profile = (id?: string, tab = "gaji") => (id ? `/portal/admin/karyawan/${id}?tab=${tab}` : undefined);
  return [
    { key: "pay-basic", title: "Lengkapi gaji pokok", hint: "Karyawan aktif tanpa data gaji tidak bisa dihitung di Proses Gaji.", count: noSalary.length, unit: "karyawan", href: profile(noSalary[0]?.id) },
    { key: "pay-pph", title: "Tempel komponen PPh 21", hint: "Karyawan tanpa komponen PPh 21 tidak dipotong pajak.", count: noPph.length, unit: "karyawan", href: profile(noPph[0]?.id) },
    { key: "pay-run", title: run ? "Finalkan Proses Gaji bulan ini" : "Hitung Proses Gaji bulan ini", hint: `Tanggal gajian ${payDay} (${daysToPay} hari lagi).`, count: runDue ? 1 : 0, unit: run ? "periode belum final" : "periode belum dihitung", href: "/portal/admin/payroll" },
    { key: "pay-tax-year", title: `Simpan PTKP & tarif PPh 21 tahun ${y + 1}`, hint: "Cek ketentuan PTKP dan TER tahun depan, lalu simpan di Pengaturan Payroll.", count: m >= 11 && !taxYears.includes(String(y + 1)) ? 1 : 0, unit: "tahun belum diatur", href: "/portal/admin/payroll" },
    { key: "pay-loan-contract", title: "Angsuran pinjaman melewati akhir kontrak", hint: "Sesuaikan sisa angsuran atau perpanjangan kontrak.", count: lateLoans.length, unit: "pinjaman", href: profile(lateLoans[0]?.userId, "pinjaman") },
  ];
}

export type AgentData = {
  groups: { key: string; label: string; list: Task[] }[];
  ai: AiFindingView[];
  setup: SetupStep[] | null; // null = bukan Super Admin atau setup sudah ditandai selesai
  reminders: DueReminder[];
};

// Semua isi panel Agent HRD: monitoring (Admin & Super Admin), Setup Awal (Super Admin), pengingat SOP.
export async function loadAgent(isSuper: boolean): Promise<{ insights: Awaited<ReturnType<typeof loadInsights>>; agent: AgentData }> {
  const settings = await getAgentSettings();
  const [insights, payroll, setup, contract] = await Promise.all([
    loadInsights(),
    loadPayrollTasks(settings),
    isSuper && !settings.setupDone ? loadSetup() : Promise.resolve(null),
    // Kontrak berakhir mengikuti batas hari di pengaturan Agent HRD.
    prisma.user.findMany({
      where: {
        isActive: true, role: { not: "SUPER_ADMIN" }, employmentStatus: "KONTRAK",
        contractEndDate: { lte: new Date(Date.now() + settings.contractDays * DAY) },
      },
      orderBy: { contractEndDate: "asc" }, select: { id: true },
    }),
  ]);
  // Karyawan diangkat tetap 60 hari terakhir yang belum diberi penyesuaian saldo cuti sesudahnya.
  const since = new Date(Date.now() - 60 * DAY);
  const appointedLogs = await prisma.employeeChangeLog.findMany({
    where: { field: "employmentStatus", newValue: "TETAP", createdAt: { gte: since }, user: { isActive: true, employmentStatus: "TETAP" } },
    orderBy: { createdAt: "asc" }, select: { userId: true, createdAt: true },
  });
  const adjusted = await prisma.leaveBalanceEntry.findMany({
    where: { kind: "PENYESUAIAN", userId: { in: appointedLogs.map((l) => l.userId) } }, select: { userId: true, createdAt: true },
  });
  const appointedTodo = [...new Map(appointedLogs.map((l) => [l.userId, l])).values()]
    .filter((l) => !adjusted.some((x) => x.userId === l.userId && x.createdAt >= l.createdAt));
  const appointedTask: Task = {
    key: "leave-appointed", title: "Selesaikan cuti karyawan yang baru diangkat tetap",
    hint: "Jatah Cuti Tahunan prorata sudah masuk otomatis. Sisa Cuti Masa Kontrak diatur lewat penyesuaian saldo sesuai kesepakatan manajemen.",
    count: appointedTodo.length, unit: "karyawan", href: "/portal/admin/leave",
  };
  // Onboarding & karyawan yang belum di-setup payroll / jadwal.
  const activeEmp = { isActive: true, role: { not: "SUPER_ADMIN" as const } };
  const onbOn = (await getOnboardingSettings()).enabled;
  const [onbReview, onbApproval, noPay, noShift, noManager, profileChanges] = await Promise.all([
    onbOn ? prisma.candidate.count({ where: { status: "DIKIRIM" } }) : 0,
    onbOn ? prisma.candidate.count({ where: { status: "MENUNGGU_APPROVAL" } }) : 0,
    prisma.user.findMany({ where: { ...activeEmp, payComponents: { none: {} } }, orderBy: { name: "asc" }, select: { id: true } }),
    prisma.user.findMany({ where: { ...activeEmp, schedules: { none: {} } }, orderBy: { name: "asc" }, select: { id: true } }),
    // Tanpa atasan langsung aktif = pengajuan cuti/dinasnya tidak punya penyetuju (jatuh ke HRD).
    prisma.user.findMany({ where: { ...activeEmp, OR: [{ managerId: null }, { manager: { isActive: false } }] }, orderBy: { name: "asc" }, select: { id: true } }),
    prisma.profileChangeRequest.count({ where: { status: "PENDING" } }),
  ]);
  const onboardingTasks: Task[] = [
    { key: "profile-change", title: "Periksa perubahan data karyawan", hint: "Karyawan mengajukan perubahan data pribadi dari Profil Saya. Data baru berlaku setelah disetujui.", count: profileChanges, unit: "pengajuan", href: "/portal/persetujuan" },
    { key: "onb-review", title: "Periksa data calon karyawan", hint: "Cocokkan isian calon dengan dokumen fisik, lengkapi data pekerjaan, lalu ajukan approval.", count: onbReview, unit: "calon", href: "/portal/admin/onboarding" },
    { key: "onb-approval", title: "Setujui calon karyawan", hint: "Calon yang sudah diperiksa HRD menunggu approval Owner / Super Admin.", count: onbApproval, unit: "calon", href: "/portal/admin/onboarding" },
  ];
  const setupTasks: Task[] = [
    { key: "emp-no-pay", title: "Tempel komponen payroll", hint: "Karyawan aktif yang belum ditempel komponen gaji tidak ikut terhitung di Proses Gaji.", count: noPay.length, unit: "karyawan", href: noPay[0] ? `/portal/admin/karyawan/${noPay[0].id}` : "/portal/admin/payroll" },
    { key: "emp-no-manager", title: "Isi atasan langsung", hint: "Atasan langsung adalah penyetuju cuti dan dinas luar. Tanpa atasan aktif, karyawan tidak bisa mengajukan cuti atau dinas.", count: noManager.length, unit: "karyawan", href: noManager[0] ? `/portal/admin/karyawan/${noManager[0].id}?tab=pekerjaan` : "/portal/admin/karyawan" },
    { key: "emp-no-shift", title: "Atur jadwal kerja / shift", hint: "Karyawan tanpa pola kerja atau jadwal manual tidak bisa dinilai kehadirannya.", count: noShift.length, unit: "karyawan", href: noShift[0] ? `/portal/admin/karyawan/${noShift[0].id}` : "/portal/admin/schedule" },
  ];
  const on = new Set(settings.enabled);
  const keep = (list: Task[]) => list.filter((t) => on.has(t.key));
  const monthly = insights.monthly.map((t) => (t.key === "contract"
    ? { ...t, hint: `Kontrak yang berakhir dalam ${settings.contractDays} hari atau sudah lewat: perpanjang, angkat tetap, atau akhiri.`, count: contract.length, href: contract[0] ? `/portal/admin/karyawan/${contract[0].id}` : undefined }
    : t));
  return {
    insights,
    agent: {
      groups: [
        { key: "daily", label: "Harian", list: keep([...insights.daily, appointedTask, ...onboardingTasks]) },
        { key: "monthly", label: "Bulanan", list: keep(monthly) },
        { key: "payroll", label: "Payroll & Pajak", list: keep(payroll) },
        { key: "data", label: "Data Karyawan", list: [...(on.has("data") ? insights.data : []), ...keep(setupTasks)] },
      ],
      setup,
      reminders: dueReminders(settings, todayKey()),
      ai: await loadAiFindings(),
    },
  };
}

// Temuan AI Pemeriksa yang belum ditindaklanjuti (Task Admin, label AI).
export type AiFindingView = { id: string; area: string; severity: string; title: string; detail: string; employeeIds: string[]; href: string | null; createdAt: string };
const SEVERITY_ORDER: Record<string, number> = { TINGGI: 0, SEDANG: 1, RENDAH: 2 };
async function loadAiFindings(): Promise<AiFindingView[]> {
  const list = await prisma.aiFinding.findMany({ where: { status: "BARU" }, orderBy: { createdAt: "desc" }, take: 50 });
  const codes = [...new Set(list.flatMap((f) => f.employeeIds))];
  const users = codes.length ? await prisma.user.findMany({ where: { employeeId: { in: codes } }, select: { id: true, employeeId: true } }) : [];
  const idOf = new Map(users.map((u) => [u.employeeId, u.id]));
  return list
    .sort((a, b) => (a.area === "PRIORITAS" ? -1 : 0) - (b.area === "PRIORITAS" ? -1 : 0) || (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))
    .map((f) => {
      const uid = f.employeeIds.length === 1 ? idOf.get(f.employeeIds[0]) : undefined;
      return { id: f.id, area: f.area, severity: f.severity, title: f.title, detail: f.detail, employeeIds: f.employeeIds, href: uid ? `/portal/admin/karyawan/${uid}` : null, createdAt: f.createdAt.toISOString() };
    });
}
