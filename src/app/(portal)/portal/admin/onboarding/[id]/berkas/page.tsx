export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CANDIDATE_STATUS, readData, readJob } from "@/lib/onboarding";
import { DeclarationText, fmtDeclared } from "@/components/portal/DeclarationText";
import { readInterview } from "@/lib/onboarding-interview";
import { InterviewSummary } from "@/components/portal/InterviewPanel";
import { T } from "@/components/i18n";
import PrintButton from "./PrintButton";

export const metadata: Metadata = { title: "Berkas Pra-Karyawan" };

// Berkas calon untuk Admin: penilaian pewawancara, tawaran kerja, dan jejak approval beserta catatannya (bisa dicetak / disimpan PDF).
export default async function BerkasPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "prakaryawan")) redirect("/portal/dashboard");
  const { id } = await params;
  const c = await prisma.candidate.findUnique({ where: { id } });
  const i = readInterview(c?.interview);
  if (!c || (!i && !c.submittedAt)) notFound();
  const d = readData(c.data, c.name, c.phone);
  const printed = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-full bg-gray-50 print:bg-white">
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 print:max-w-none print:p-0">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5 print:border-0 print:p-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500"><T>PT. Citra Banjar Abadi</T> · <T>Berkas Pra-Karyawan</T></p>
            <h1 className="mt-1 text-xl font-bold text-gray-900">{c.name}</h1>
            <p className="text-sm text-gray-600">{c.email} · {c.phone}</p>
            <p className="mt-1 text-xs text-gray-500"><T>Status</T>: <T>{CANDIDATE_STATUS[c.status]?.label ?? c.status}</T> · <T>dicetak</T> {printed}</p>
          </div>
          <PrintButton />
        </div>
        {i && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 print:border-0 print:p-0">
            <InterviewSummary interview={i} job={readJob(c.job)} candidate={({ name: d.name, email: c.email, phone: d.phone, birthPlace: d.birthPlace, birthDate: d.birthDate, gender: d.gender, religion: d.religion,
      maritalStatus: d.maritalStatus, idType: d.idType, ktpNumber: d.ktpNumber, address: d.address, addressRegionName: d.addressRegionName })} />
          </div>
        )}
        {d.declaredAt && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 print:break-before-page print:border-0 print:p-0">
            <DeclarationText name={d.name} idType={d.idType} idNumber={d.ktpNumber} />
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              ☑ <T>Disetujui secara elektronik oleh calon pada</T> <b>{fmtDeclared(d.declaredAt)}</b> <T>dari email</T> <b>{c.email}</b>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
