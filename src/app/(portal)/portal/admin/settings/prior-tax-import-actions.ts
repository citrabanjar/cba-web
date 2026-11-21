"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireImport } from "@/lib/import-access";

// Import PPh 21 Pindahan (Pengaturan -> Import Data): data BPA1 pemberi kerja sebelumnya untuk karyawan yang
// pindah di tahun pajak berjalan, sama isinya dengan isian manual di profil karyawan -> Payroll -> PPh 21 Pindahan.
// Baris dengan karyawan + tahun + nomor BPA1 yang sudah ada diperbarui; selain itu ditambahkan.
export type PriorTaxImportRow = {
  line: number; employeeId: string; year: number; slipNumber: string; employerName: string; net: number; pph21: number;
};
export type PriorTaxImportResult = { created: number; updated: number; errors: string[] };

export async function importPriorTaxSlips(rows: PriorTaxImportRow[]): Promise<PriorTaxImportResult> {
  const access = await requireImport("pph21pindahan");
  const ids = [...new Set(rows.map((r) => r.employeeId.trim().toUpperCase()).filter(Boolean))];
  const users = await prisma.user.findMany({ where: { employeeId: { in: ids } }, select: { id: true, employeeId: true } });
  const byId = new Map(users.map((u) => [(u.employeeId ?? "").toUpperCase(), u.id]));
  const errors: string[] = [];
  let created = 0, updated = 0;
  for (const r of rows) {
    const at = `Baris ${r.line}`;
    const userId = byId.get(r.employeeId.trim().toUpperCase());
    const year = Math.round(Number(r.year));
    const net = Math.round(Number(r.net)), pph21 = Math.round(Number(r.pph21));
    const slipNumber = r.slipNumber.trim();
    if (!userId) { errors.push(`${at}: ID Karyawan "${r.employeeId}" tidak ditemukan.`); continue; }
    if (!(year >= 2020 && year <= 2100)) { errors.push(`${at}: Tahun Pajak tidak valid.`); continue; }
    if (!slipNumber) { errors.push(`${at}: Nomor BPA1 wajib diisi.`); continue; }
    if (!(net > 0)) { errors.push(`${at}: Penghasilan Neto wajib diisi.`); continue; }
    if (!(pph21 >= 0)) { errors.push(`${at}: PPh 21 Dipotong tidak valid (isi 0 bila tidak ada).`); continue; }
    const data = {
      userId, year, slipNumber, employerName: r.employerName.trim().toUpperCase(), net, pph21,
      kind: "BPA1", monthFrom: 1, monthTo: 12, gross: 0,
    };
    const existing = await prisma.priorTaxSlip.findFirst({ where: { userId, year, slipNumber }, select: { id: true } });
    if (existing) { await prisma.priorTaxSlip.update({ where: { id: existing.id }, data }); updated++; }
    else { await prisma.priorTaxSlip.create({ data: { ...data, createdBy: access.name ?? null, note: "Import PPh 21 Pindahan" } }); created++; }
  }
  revalidatePath("/portal/admin/karyawan", "layout");
  revalidatePath("/portal/admin/payroll");
  return { created, updated, errors };
}
