"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasMenu, isManagement, isSuperAdmin } from "@/lib/roles";
import { getAccess } from "@/lib/access";
import { AGENT_SETTING_KEY, MONITOR_CHECKS, normalizeAgentSettings, type AgentSettings, type SopReminder } from "@/lib/agent-hrd";

type Result = { error?: string };

async function load() {
  const row = await prisma.appSetting.findUnique({ where: { key: AGENT_SETTING_KEY } });
  return normalizeAgentSettings(row?.value);
}
async function store(value: AgentSettings, by: string | null) {
  await prisma.appSetting.upsert({
    where: { key: AGENT_SETTING_KEY },
    update: { value, updatedBy: by }, create: { key: AGENT_SETTING_KEY, value, updatedBy: by },
  });
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/admin/settings");
}
// Setup detail fitur dikerjakan Admin; Super Admin hanya menyalakan fitur (Pengaturan → Fitur).
async function requireAdminOnly() {
  const session = await auth();
  const access = await getAccess();
  if (!session?.user || !access || !hasMenu(access, "pengaturan") || isSuperAdmin(access.role)) throw new Error("Unauthorized");
  return session.user;
}
async function requireSuper() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) throw new Error("Unauthorized");
  return session.user;
}

// Pengecekan yang dinyalakan/dimatikan dan batas angkanya (Admin).
export async function saveAgentRules(input: { enabled: string[]; contractDays: number; payrollRemindDays: number }): Promise<Result> {
  const user = await requireAdminOnly();
  const keys = new Set<string>(MONITOR_CHECKS.map((c) => c.key));
  const s = await load();
  s.enabled = input.enabled.filter((k) => keys.has(k));
  s.contractDays = Math.max(1, Math.min(365, Math.round(Number(input.contractDays) || 30)));
  s.payrollRemindDays = Math.max(0, Math.min(31, Math.round(Number(input.payrollRemindDays) || 5)));
  await store(s, user.name ?? null);
  return {};
}

// Tambah / ubah pengingat SOP (Admin).
export async function saveReminder(input: SopReminder): Promise<Result> {
  const user = await requireAdminOnly();
  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Judul pengingat wajib diisi." };
  if (!["MONTHLY", "YEARLY", "ONCE"].includes(input.freq)) return { error: "Jenis pengingat tidak valid." };
  if (input.freq === "ONCE" && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal pengingat wajib diisi." };
  const r: SopReminder = {
    id: input.id || `r${Date.now().toString(36)}`, title, note: input.note.trim().slice(0, 500), freq: input.freq,
    day: Math.max(1, Math.min(31, Math.round(Number(input.day) || 1))), month: Math.max(1, Math.min(12, Math.round(Number(input.month) || 1))),
    date: input.freq === "ONCE" ? input.date : "", leadDays: Math.max(0, Math.min(60, Math.round(Number(input.leadDays) || 0))),
  };
  const s = await load();
  s.reminders = [...s.reminders.filter((x) => x.id !== r.id), r];
  await store(s, user.name ?? null);
  return {};
}

export async function deleteReminder(id: string): Promise<Result> {
  const user = await requireAdminOnly();
  const s = await load();
  s.reminders = s.reminders.filter((x) => x.id !== id);
  delete s.done[id];
  await store(s, user.name ?? null);
  return {};
}

// Tandai satu kejadian pengingat selesai (Admin & Super Admin).
export async function markReminderDone(id: string, occurrence: string): Promise<Result> {
  const session = await auth();
  if (!session?.user || !isManagement(session.user.role)) return { error: "Unauthorized" };
  const s = await load();
  if (!s.reminders.some((r) => r.id === id)) return { error: "Pengingat tidak ditemukan." };
  s.done[id] = occurrence;
  await store(s, session.user.name ?? null);
  return {};
}

// Sembunyikan / tampilkan lagi panduan Setup Awal (Super Admin).
export async function setSetupDone(done: boolean): Promise<Result> {
  const user = await requireSuper();
  const s = await load();
  s.setupDone = done;
  await store(s, user.name ?? null);
  return {};
}
