export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCandidateSession } from "@/lib/onboarding-session";
import { readData } from "@/lib/onboarding";
import CandidateFormClient from "./CandidateFormClient";

export default async function OnboardingFormPage() {
  const id = await getCandidateSession();
  if (!id) redirect("/onboarding");
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) redirect("/onboarding");
  return <CandidateFormClient name={c.name} status={c.status} note={c.note} initial={readData(c.data, c.name, c.phone)} />;
}
