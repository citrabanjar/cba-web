"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMenuApply } from "@/lib/access";
import { notify } from "@/lib/notify";
import { DEFAULT_HELP_ARTICLES } from "@/lib/helpdesk-defaults";
import { GREETING_KEY } from "@/lib/helpdesk";

const PATH = "/portal/admin/helpdesk";
export type ArticleInput = { title: string; body: string; keywords: string; isActive: boolean };
// "Cuti, saldo cuti ,  CUTI" → "cuti, saldo cuti"
const cleanKeywords = (s: string) => [...new Set(s.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean))].join(", ");

export async function saveArticle(id: string | null, input: ArticleInput): Promise<{ error?: string; id?: string }> {
  const user = await requireMenuApply("pengaturan");
  const title = input.title.trim(), body = input.body.trim();
  if (!title) return { error: "Judul artikel wajib diisi." };
  if (!body) return { error: "Isi artikel wajib diisi." };
  const data = { title: title.slice(0, 200), body, keywords: cleanKeywords(input.keywords), isActive: input.isActive };
  const row = id ? await prisma.helpArticle.update({ where: { id }, data }) : await prisma.helpArticle.create({ data: { ...data, createdBy: user.name ?? null } });
  revalidatePath(PATH);
  return { id: row.id };
}

export async function deleteArticle(id: string): Promise<{ error?: string }> {
  await requireMenuApply("pengaturan");
  await prisma.helpArticle.delete({ where: { id } }).catch(() => null);
  revalidatePath(PATH);
  return {};
}

// Sapaan pembuka robot. Kosong = kembali ke sapaan bawaan.
export async function saveGreeting(text: string): Promise<{ error?: string }> {
  const user = await requireMenuApply("pengaturan");
  const value = text.trim().slice(0, 500);
  await prisma.appSetting.upsert({
    where: { key: GREETING_KEY }, update: { value: { text: value }, updatedBy: user.name ?? null }, create: { key: GREETING_KEY, value: { text: value }, updatedBy: user.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}

// Muat artikel SOP bawaan (judul yang sudah ada dilewati).
export async function loadDefaultArticles(): Promise<{ error?: string; added?: number }> {
  const user = await requireMenuApply("pengaturan");
  const have = new Set((await prisma.helpArticle.findMany({ select: { title: true } })).map((a) => a.title.toLowerCase()));
  const fresh = DEFAULT_HELP_ARTICLES.filter((a) => !have.has(a.title.toLowerCase()));
  if (fresh.length) await prisma.helpArticle.createMany({ data: fresh.map((a) => ({ ...a, createdBy: user.name ?? null })) });
  revalidatePath(PATH);
  return { added: fresh.length };
}

// Jawab pertanyaan karyawan: jawaban dikirim ke karyawan lewat notifikasi; opsional sekaligus dijadikan artikel
// supaya pertanyaan serupa berikutnya dijawab robot.
export async function answerQuestionAdmin(id: string, answer: string, asArticle: { title: string; keywords: string } | null): Promise<{ error?: string }> {
  const user = await requireMenuApply("pengaturan");
  const text = answer.trim();
  if (!text) return { error: "Jawaban wajib diisi." };
  const q = await prisma.helpQuestion.findUnique({ where: { id } });
  if (!q) return { error: "Pertanyaan tidak ditemukan." };
  await prisma.helpQuestion.update({ where: { id }, data: { answer: text, answeredBy: user.name ?? null, answeredAt: new Date() } });
  await notify(q.userId, "Jawaban Help Desk", `${q.question.slice(0, 120)}\n\n${text}`.slice(0, 2000), null);
  if (asArticle?.title.trim()) {
    await prisma.helpArticle.create({ data: { title: asArticle.title.trim().slice(0, 200), body: text, keywords: cleanKeywords(asArticle.keywords), createdBy: user.name ?? null } });
  }
  revalidatePath(PATH);
  return {};
}

// Tutup pertanyaan tanpa jawaban (mis. pertanyaan tidak jelas / sudah ditangani langsung).
export async function dismissQuestion(id: string): Promise<{ error?: string }> {
  const user = await requireMenuApply("pengaturan");
  await prisma.helpQuestion.update({ where: { id }, data: { answeredBy: user.name ?? null, answeredAt: new Date() } }).catch(() => null);
  revalidatePath(PATH);
  return {};
}
