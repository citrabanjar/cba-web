export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import HelpDeskClient from "./HelpDeskClient";

export const metadata: Metadata = { title: "Help Desk" };

// Panel Admin → Help Desk: Basis Pengetahuan robot dan pertanyaan karyawan yang belum terjawab.
export default async function HelpDeskPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "pengaturan")) redirect("/portal/dashboard");
  const [articles, questions] = await Promise.all([
    prisma.helpArticle.findMany({ orderBy: [{ isActive: "desc" }, { title: "asc" }] }),
    prisma.helpQuestion.findMany({
      where: { answeredAt: null }, orderBy: [{ asked: "desc" }, { createdAt: "desc" }], take: 200,
      include: { user: { select: { name: true, employeeId: true } } },
    }),
  ]);
  const { tab } = await searchParams;
  return (
    <HelpDeskClient
      initialTab={tab === "pertanyaan" ? "pertanyaan" : "artikel"}
      articles={articles.map((a) => ({ id: a.id, title: a.title, body: a.body, keywords: a.keywords, isActive: a.isActive, hits: a.hits }))}
      questions={questions.map((q) => ({ id: q.id, question: q.question, asked: q.asked, createdAt: q.createdAt.toISOString(), who: `${q.user.name}${q.user.employeeId ? ` (${q.user.employeeId})` : ""}` }))}
    />
  );
}
