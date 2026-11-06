export const dynamic = "force-dynamic";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import KaryawanDetailClient from "./KaryawanDetailClient";

function tenure(joinDate: Date | null): string | null {
  if (!joinDate) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - joinDate.getFullYear()) * 12 +
    (now.getMonth() - joinDate.getMonth());
  if (now.getDate() < joinDate.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} bulan`;
  return rest === 0 ? `${years} tahun` : `${years} tahun ${rest} bulan`;
}

export default async function KaryawanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (session.user.role !== "ADMIN") redirect("/portal/dashboard");

  const { id } = await params;

  // Pakai select eksplisit supaya passwordHash tidak ikut terkirim ke client.
  const employee = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      employmentStatus: true,
      position: true,
      joinDate: true,
      bankName: true,
      bankAccount: true,
      bankHolder: true,
      isActive: true,
      department: { select: { id: true, name: true } },
      attendances: {
        orderBy: { date: "desc" },
        take: 31,
        select: {
          id: true, date: true, checkIn: true, checkOut: true,
          checkInAddr: true, status: true, note: true,
        },
      },
      leaves: {
        orderBy: { startDate: "desc" },
        take: 50,
        select: {
          id: true, type: true, startDate: true, endDate: true,
          totalDays: true, reason: true, status: true,
        },
      },
      businessTrips: {
        orderBy: { startDate: "desc" },
        take: 50,
        select: {
          id: true, destination: true, purpose: true, startDate: true,
          endDate: true, totalDays: true, status: true,
        },
      },
      payslips: {
        orderBy: { period: "desc" },
        take: 12,
        select: {
          id: true, periodLabel: true, basicSalary: true, overtimePay: true,
          mealAllowance: true, travelAllowance: true, otherBenefits: true,
          pph21: true, bpjsKesehatan: true, bpjsKetenagakerjaan: true,
          otherDeductions: true, netPay: true, paidAt: true, paidVia: true,
        },
      },
    },
  });

  if (!employee) notFound();

  return <KaryawanDetailClient employee={employee} tenure={tenure(employee.joinDate)} />;
}
