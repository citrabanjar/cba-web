import { prisma } from "@/lib/prisma";
import { pendingRevisions, syncRevisions } from "@/lib/overtime";
import { AGENT_SETTING_KEY, dueReminders, normalizeAgentSettings, type AgentSettings, type DueReminder } from "@/lib/agent-hrd";
import { PAYROLL_SETTING_KEY, DEFAULT_PAYROLL_SETTINGS, type PayrollSettings } from "@/lib/payroll";
import { TAX_SETTING_KEY } from "@/lib/pph21";
import { loadInsights, type Task } from "./insights";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import { aiFeatureOn } from "@/lib/ai-checker";
import { MENUS, canEditMenu, hasMenu, type MenuKey } from "@/lib/roles";
import { notify } from "@/lib/notify";

const DAY = 86_400_000;
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

export async function getAgentSettings(): Promise<AgentSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: AGENT_SETTING_KEY } });
  return normalizeAgentSettings(row?.value);
}

// Satu langkah panduan Setup Awal (SOP migrasi). Selesai/belum dideteksi dari data portal.
// owner = pelaksana (Super Admin atau Admin pemegang kewenangannya); mine = langkah milik pengguna yang membuka;
// next = langkah wajib pertama yang belum selesai (langkah berikutnya untuk seluruh tim).
export type SetupStep = {
  key: string; phase: string; title: string; hint: string; done: boolean; note?: string; href: string; optional?: boolean;
  owner: string; mine: boolean; next?: boolean;
};

// Setup Awal dikerjakan berurutan seperti estafet (keputusan pemilik 2026-11-18):
// Super Admin (organisasi, import karyawan, Admin) -> Admin Absensi & Cuti (kehadiran, cuti) -> Admin Data Karyawan (foto)
// -> Admin Payroll (payroll, PPh 21, gaji pertama). Semua pihak melihat urutan lengkap; langkah milik pihak lain tampil abu-abu.
// Saat langkah berikutnya berpindah ke pelaksana lain, pelaksana itu menerima notifikasi.
const IMPORT_TAB = "/portal/admin/settings?tab=import";
const SETUP_NEXT_KEY = "setup.next";
type SetupAccess = { id?: string; role: string; menuAccess: string[] };
type StepDef = Omit<SetupStep, "owner" | "mine" | "next"> & { menu: MenuKey | "SUPER" };

async function loadSetup(user: SetupAccess): Promise<SetupStep[]> {
  const year = Number(todayKey().slice(0, 4));
  const active = { isActive: true, role: { not: "SUPER_ADMIN" as const } };
  const [branches, depts, positions, locations, shifts, holidays, policies, components, payrollSetting, taxSetting,
    employees, noPhoto, admins, leaveOpening, loanOpening, finalRuns, staff] = await Promise.all([
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
    prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
    prisma.leaveBalanceEntry.count({ where: { kind: "SALDO_AWAL" } }),
    prisma.employeeLoan.count({ where: { isOpening: true } }),
    prisma.payrollRun.count({ where: { status: "FINAL" } }),
    prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true, name: true, role: true, menuAccess: true }, orderBy: { name: "asc" } }),
  ]);
  const taxYears = Object.keys((taxSetting?.value ?? {}) as Record<string, unknown>);

  const defs: StepDef[] = [
    { menu: "SUPER", key: "org", phase: "1. Rumah karyawan", title: "Parameter organisasi", hint: "Import Parameter Organisasi (cabang, departemen, jabatan) di Pengaturan → Import Data, atau isi di menu Organisasi.",
      done: branches > 0 && depts > 0 && positions > 0, note: `${branches} cabang · ${depts} departemen · ${positions} jabatan`, href: IMPORT_TAB },
    { menu: "SUPER", key: "employees", phase: "2. Data karyawan", title: "Import data karyawan", hint: "Import Data Karyawan (termasuk gaji pokok) di Pengaturan → Import Data.",
      done: employees > 0, note: `${employees} karyawan aktif`, href: IMPORT_TAB },
    { menu: "SUPER", key: "admins", phase: "3. Admin", title: "Tentukan Admin", hint: "Buat Peran Admin dan kewenangannya, lalu tambahkan anggotanya di Anggota Admin.",
      done: admins > 0, note: `${admins} Admin`, href: "/portal/admin/settings?tab=peran" },
    { menu: "absensi", key: "location", phase: "4. Kehadiran", title: "Lokasi absen (GPS)", hint: "Titik lokasi dan radius untuk absensi.",
      done: locations > 0, note: `${locations} lokasi`, href: "/portal/admin/schedule" },
    { menu: "absensi", key: "shift", phase: "4. Kehadiran", title: "Shift & pola kerja", hint: "Shift kerja dan pola jadwal, lalu tempel ke karyawan.",
      done: shifts > 0, note: `${shifts} shift`, href: "/portal/admin/schedule" },
    { menu: "absensi", key: "holiday", phase: "4. Kehadiran", title: `Kalender libur ${year}`, hint: "Libur nasional, cuti bersama, dan libur perusahaan.",
      done: holidays > 0, note: `${holidays} hari libur`, href: "/portal/admin/schedule" },
    { menu: "absensi", key: "leave", phase: "5. Cuti", title: "Jenis cuti", hint: "Kebijakan cuti dan jatahnya.",
      done: policies > 0, note: `${policies} jenis cuti`, href: "/portal/admin/leave" },
    { menu: "absensi", key: "leave-balance", phase: "5. Cuti", title: "Saldo awal cuti", hint: "Import Saldo dari aplikasi lama di Cuti → Saldo Cuti.",
      done: leaveOpening > 0, note: `${leaveOpening} baris saldo awal`, href: "/portal/admin/leave" },
    { menu: "karyawan", key: "photo", phase: "6. Data pelengkap", title: "Foto karyawan", hint: "Upload Foto di Data Karyawan; nama file = Employee ID.",
      done: employees > 0 && noPhoto === 0, note: employees ? `${employees - noPhoto}/${employees} sudah ada foto` : undefined, href: "/portal/admin/karyawan", optional: true },
    { menu: "gaji", key: "pay", phase: "7. Payroll", title: "Komponen gaji & pengaturan payroll", hint: "Komponen gaji, periode gaji, tanggal gajian, jadwal THR / Bonus.",
      done: components > 0 && !!payrollSetting, note: payrollSetting ? `${components} komponen` : "Pengaturan Payroll belum disimpan", href: "/portal/admin/payroll" },
    { menu: "gaji", key: "tax", phase: "7. Payroll", title: `PTKP & tarif PPh 21 tahun ${year}`, hint: "Simpan Pengaturan PPh 21 tahun berjalan (dan cek tarif TER).",
      done: taxYears.includes(String(year)), href: "/portal/admin/payroll" },
    { menu: "pinjaman", key: "loan-balance", phase: "7. Payroll", title: "Saldo awal pinjaman", hint: "Upload Saldo Awal pinjaman yang masih berjalan di aplikasi lama (menu Pinjaman, bila ada).",
      done: loanOpening > 0, note: `${loanOpening} pinjaman saldo awal`, href: "/portal/admin/pinjaman", optional: true },
    { menu: "gaji", key: "first-run", phase: "8. Mulai jalan", title: "Proses Gaji pertama difinalkan", hint: "Hitung, cek, lalu finalkan gaji pertama di portal.",
      done: finalRuns > 0, href: "/portal/admin/payroll" },
  ];

  // Pelaksana tiap langkah: Super Admin, atau Admin yang memegang hak Edit menu langkah itu.
  const holders = (menu: StepDef["menu"]) => menu === "SUPER"
    ? staff.filter((u) => u.role === "SUPER_ADMIN")
    : staff.filter((u) => u.role === "ADMIN" && canEditMenu(u, menu));
  const ownerLabel = (menu: StepDef["menu"]) => {
    if (menu === "SUPER") return "Super Admin";
    const names = holders(menu).map((u) => u.name.split(" ")[0]);
    const label = MENUS.find((m) => m.key === menu)?.label ?? menu;
    return names.length ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""} (Admin ${label})` : `Admin ${label} (belum ditentukan)`;
  };
  const mine = (menu: StepDef["menu"]) => (menu === "SUPER" ? user.role === "SUPER_ADMIN" : user.role === "ADMIN" && hasMenu(user, menu));
  const nextIdx = defs.findIndex((d) => !d.optional && !d.done);
  const steps: SetupStep[] = defs.map(({ menu, ...d }, i) => ({ ...d, owner: ownerLabel(menu), mine: mine(menu), next: i === nextIdx }));

  // Estafet: beri tahu pelaksana langkah berikutnya bila langkahnya berganti (sekali per orang).
  if (nextIdx >= 0) {
    const to = holders(defs[nextIdx].menu).map((u) => u.id);
    const row = await prisma.appSetting.findUnique({ where: { key: SETUP_NEXT_KEY } });
    const prev = (row?.value as { key?: string; to?: string[] } | null) ?? {};
    if (prev.key !== defs[nextIdx].key) {
      const fresh = to.filter((id) => !(prev.to ?? []).includes(id));
      await prisma.appSetting.upsert({
        where: { key: SETUP_NEXT_KEY }, update: { value: { key: defs[nextIdx].key, to } }, create: { key: SETUP_NEXT_KEY, value: { key: defs[nextIdx].key, to } },
      });
      if (fresh.length) await notify(fresh, `Setup Awal siap dilanjutkan: ${defs[nextIdx].title}`, defs[nextIdx].hint, "/portal/dashboard?setup=1");
    }
  }
  return steps;
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
  setup: SetupStep[] | null; // null = tidak ada langkah untuk peran ini, atau setup sudah ditandai selesai
  reminders: DueReminder[];
};

// Semua isi panel Agent HRD: monitoring (Admin & Super Admin), Setup Awal (sesuai peran), pengingat SOP.
export async function loadAgent(isSuper: boolean, user?: SetupAccess | null): Promise<{ insights: Awaited<ReturnType<typeof loadInsights>>; agent: AgentData }> {
  const settings = await getAgentSettings();
  const [insights, payroll, setup, contract] = await Promise.all([
    loadInsights(),
    loadPayrollTasks(settings),
    user && !settings.setupDone ? loadSetup(user).then((x) => (x.length ? x : null)) : Promise.resolve(null),
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
  await syncRevisions().catch(() => 0);
  const [onbReview, onbApproval, noPay, noShift, noManager, profileChanges, otRevisions, femaleNotTk0, noTaxStatus] = await Promise.all([
    onbOn ? prisma.candidate.count({ where: { status: { in: ["DIKIRIM", "SIAP_DAFTAR"] } } }) : 0,
    onbOn ? prisma.candidate.count({ where: { status: "MENUNGGU_APPROVAL" } }) : 0,
    prisma.user.findMany({ where: { ...activeEmp, payComponents: { none: {} } }, orderBy: { name: "asc" }, select: { id: true } }),
    noScheduleThisMonth(),
    // Tanpa atasan langsung aktif = pengajuan cuti/dinasnya tidak punya penyetuju (jatuh ke HRD).
    prisma.user.findMany({ where: { ...activeEmp, OR: [{ managerId: null }, { manager: { isActive: false } }] }, orderBy: { name: "asc" }, select: { id: true } }),
    prisma.profileChangeRequest.count({ where: { status: "PENDING" } }),
    pendingRevisions(),
    // Karyawan wanita wajib berstatus PTKP TK/0 walaupun sudah menikah: cari yang statusnya selain TK/0.
    prisma.user.findMany({
      where: { ...activeEmp, gender: { equals: "Perempuan", mode: "insensitive" }, ptkpStatus: { not: null }, NOT: { ptkpStatus: { equals: "TK/0", mode: "insensitive" } } },
      orderBy: { name: "asc" }, select: { id: true },
    }),
    // Status Pajak (Pegawai Tetap / Tidak Tetap) menentukan Kode Objek Pajak dan cara hitung PPh 21; belum ada di
    // isian calon karyawan, jadi dilengkapi Admin setelah karyawan didaftarkan.
    prisma.user.findMany({ where: { ...activeEmp, OR: [{ taxStatus: null }, { taxStatus: "" }] }, orderBy: { name: "asc" }, select: { id: true } }),
  ]);
  // Revisi jam lembur wajib diselesaikan (gaji periode itu tidak bisa difinalkan sebelum diputus).
  const otTask: Task = {
    key: "ot-revision", title: "Putuskan revisi jam lembur",
    hint: "Karyawan absen pulang melewati jam akhir Surat Perintah Lembur. Setujui atau tolak di Payroll & Benefit; gaji periode itu baru bisa difinalkan setelahnya.",
    count: otRevisions, unit: "revisi", href: "/portal/admin/payroll",
  };
  const onboardingTasks: Task[] = [
    { key: "profile-change", title: "Periksa perubahan data karyawan", hint: "Karyawan mengajukan perubahan data pribadi dari Profil Saya. Data baru berlaku setelah disetujui.", count: profileChanges, unit: "pengajuan", href: "/portal/persetujuan" },
    { key: "onb-review", title: "Periksa data calon karyawan", hint: "Cocokkan isian calon dengan dokumen fisik dan lengkapi data pekerjaan lalu ajukan approval, atau daftarkan calon yang sudah disetujui.", count: onbReview, unit: "calon", href: "/portal/admin/onboarding" },
    { key: "onb-approval", title: "Setujui calon karyawan", hint: "Calon yang sudah diperiksa HRD menunggu keputusan approver sesuai workflow Pra-Karyawan.", count: onbApproval, unit: "calon", href: "/portal/persetujuan" },
  ];
  const setupTasks: Task[] = [
    { key: "emp-no-pay", title: "Karyawan belum memiliki komponen gaji", hint: "Komponen gaji perlu dibuat dan ditempelkan kepada karyawan melalui menu Payroll & Benefit → Komponen agar diperhitungkan dalam Proses Gaji.", count: noPay.length, unit: "karyawan", href: noPay.length === 1 ? `/portal/admin/karyawan/${noPay[0].id}?tab=gaji` : "/portal/admin/payroll" },
    { key: "emp-no-manager", title: "Isi atasan langsung", hint: "Atasan langsung adalah penyetuju cuti dan dinas luar. Tanpa atasan aktif, karyawan tidak bisa mengajukan cuti atau dinas.", count: noManager.length, unit: "karyawan", href: noManager[0] ? `/portal/admin/karyawan/${noManager[0].id}?tab=pekerjaan` : "/portal/admin/karyawan" },
    { key: "emp-female-ptkp", title: "Karyawan wanita belum berstatus pajak TK/0", hint: "Karyawan wanita wajib berstatus PTKP TK/0 walaupun sudah menikah. Ubah Status PTKP di profil karyawan (tab Payroll, bagian Pajak).", count: femaleNotTk0.length, unit: "karyawan", href: femaleNotTk0[0] ? `/portal/admin/karyawan/${femaleNotTk0[0].id}?tab=gaji` : "/portal/admin/karyawan" },
    { key: "emp-no-taxstatus", title: "Karyawan belum memiliki Status Pajak", hint: "Status Pajak (Pegawai Tetap / Pegawai Tidak Tetap) menentukan Kode Objek Pajak dan cara hitung PPh 21. Isi di profil karyawan (tab Payroll, bagian Pajak).", count: noTaxStatus.length, unit: "karyawan", href: noTaxStatus[0] ? `/portal/admin/karyawan/${noTaxStatus[0].id}?tab=gaji` : "/portal/admin/karyawan" },
    { key: "emp-no-shift", title: "Karyawan belum memiliki jadwal kerja bulan ini", hint: "Tempel pola kerja atau isi Jadwal Bulanan untuk bulan berjalan supaya kehadirannya bisa dinilai.", count: noShift.length, unit: "karyawan", href: "/portal/admin/schedule?tab=jadwal" },
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
        // Revisi jam lembur: tugas Admin Payroll.
        { key: "daily", label: "Harian", list: [...(isSuper || hasMenu(user, "gaji") ? [otTask] : []), ...keep([...insights.daily, appointedTask, ...onboardingTasks])] },
        { key: "monthly", label: "Bulanan", list: keep(monthly) },
        { key: "payroll", label: "Payroll & Pajak", list: keep(payroll) },
        { key: "data", label: "Data Karyawan", list: keep(setupTasks) },
      ],
      setup,
      reminders: dueReminders(settings, todayKey()),
      ai: (await aiFeatureOn()) ? await loadAiFindings() : [],
    },
  };
}

// Karyawan aktif tanpa jadwal kerja di bulan berjalan: tidak punya pola kerja yang berlaku (jadwal POLA terakhir
// yang mulai berlaku sampai akhir bulan ini) dan tidak punya isian Jadwal Bulanan (per hari) di bulan ini.
async function noScheduleThisMonth() {
  const [y, m] = todayKey().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: "SUPER_ADMIN" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      schedules: { where: { effectiveDate: { lte: end } }, orderBy: { effectiveDate: "desc" }, take: 1, select: { type: true, patternId: true } },
      shiftDays: { where: { date: { gte: start, lte: end } }, take: 1, select: { id: true } },
    },
  });
  return users.filter((u) => !(u.schedules[0]?.type === "POLA" && u.schedules[0].patternId) && u.shiftDays.length === 0).map((u) => ({ id: u.id }));
}

// Temuan Agent HRD (AI) yang belum ditindaklanjuti (Task Admin, label AI).
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
