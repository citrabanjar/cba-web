// Data karyawan dalam format kolom template import (Download Template berisi data).
import { prisma } from "@/lib/prisma";
import { templateDate, type TemplateRow } from "@/lib/employee-import";

// pay: sertakan gaji pokok (hanya untuk yang punya akses Payroll & Benefit).
export async function employeeTemplateRows(pay: boolean): Promise<TemplateRow[]> {
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
  const users = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, employeeId: { not: null } },
    orderBy: [{ employeeNo: "asc" }, { employeeId: "asc" }],
    include: {
      department: { select: { name: true } }, manager: { select: { employeeId: true } },
      salaries: pay ? { where: { effectiveDate: { lte: today } }, orderBy: { effectiveDate: "desc" }, take: 1, select: { basicSalary: true } } : false,
    },
  });
  const rows: TemplateRow[] = users.map((u) => {
    // Nama wilayah tersimpan "Kelurahan, Kecamatan, Kabupaten/Kota, Provinsi".
    const [village, district, city, province] = (u.addressRegionName ?? "").split(", ");
    return {
      employeeId: u.employeeId ?? "", name: u.name, email: u.email ?? undefined, managerRef: u.manager?.employeeId ?? undefined,
      branch: u.branch ?? undefined, departmentName: u.department?.name ?? undefined, position: u.position ?? undefined,
      employmentStatus: u.employmentStatus, joinDate: templateDate(u.joinDate), contractEndDate: templateDate(u.contractEndDate),
      resignDate: templateDate(u.resignDate), isActive: u.isActive ? "Aktif" : "Nonaktif",
      basicSalary: pay ? (u as { salaries?: { basicSalary: number }[] }).salaries?.[0]?.basicSalary : undefined,
      paymentSchedule: u.paymentSchedule ?? undefined,
      bpjsTkNumber: u.bpjsTkNumber ?? undefined, bpjsTkActive: u.bpjsTkActive ? "Ikut" : "Tidak Ikut",
      bpjsKesNumber: u.bpjsKesNumber ?? undefined, bpjsKesActive: u.bpjsKesActive ? "Ikut" : "Tidak Ikut",
      npwp: u.npwp ?? undefined, ptkpStatus: u.ptkpStatus ?? undefined, taxability: u.taxability ?? undefined,
      taxStatus: u.taxStatus ?? undefined, taxObjectCode: u.taxObjectCode ?? undefined,
      bankName: u.bankName ?? undefined, bankAccount: u.bankAccount ?? undefined, bankHolder: u.bankHolder ?? undefined,
      phone: u.phone ?? undefined, ktpNumber: u.ktpNumber ?? undefined, address: u.address ?? undefined,
      addressVillage: village || undefined, addressDistrict: district || undefined, addressCity: city || undefined, addressProvince: province || undefined,
      addressPostal: u.addressPostal ?? undefined, birthPlace: u.birthPlace ?? undefined, birthDate: templateDate(u.birthDate),
      gender: u.gender ?? undefined, religion: u.religion ?? undefined, maritalStatus: u.maritalStatus ?? undefined,
      nationality: u.nationality ?? undefined, emergencyName: u.emergencyName ?? undefined, emergencyPhone: u.emergencyPhone ?? undefined,
      emergencyRelation: u.emergencyRelation ?? undefined,
    };
  });
  return rows;
}
