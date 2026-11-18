"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { canEditMenu } from "@/lib/roles";
import { answerQuestion, getGreeting, type HelpAnswer } from "@/lib/helpdesk";

// Chat Help Desk karyawan (tombol di pojok kanan bawah portal).
export async function askHelpDesk(question: string): Promise<HelpAnswer | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi berakhir. Silakan masuk lagi." };
  if (!question.trim()) return { error: "Silakan tulis pertanyaan Anda." };
  return answerQuestion(session.user.id, question.slice(0, 1000));
}

// Sapaan pembuka chat, sudah berisi nama depan karyawan.
export async function helpDeskGreeting(): Promise<string> {
  const session = await auth();
  const first = (session?.user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
  return (await getGreeting()).replace(/\{nama\}/gi, name).replace(/\s+([!,.])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

// "Tanya HRD": pertanyaan yang tidak terjawab robot diteruskan ke Admin pengelola Help Desk (kewenangan Pengaturan).
export async function forwardToHrd(questionId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi berakhir. Silakan masuk lagi." };
  const q = await prisma.helpQuestion.findUnique({ where: { id: questionId } });
  if (!q || q.userId !== session.user.id) return { error: "Pertanyaan tidak ditemukan." };
  if (!q.asked) {
    await prisma.helpQuestion.update({ where: { id: questionId }, data: { asked: true } });
    const admins = await prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true, role: true, menuAccess: true } });
    const to = admins.filter((a) => a.role === "SUPER_ADMIN" || canEditMenu(a, "pengaturan")).map((a) => a.id);
    await notify(to, `Help Desk: pertanyaan dari ${session.user.name ?? "karyawan"}`, q.question.slice(0, 200), "/portal/admin/helpdesk?tab=pertanyaan");
  }
  return {};
}
