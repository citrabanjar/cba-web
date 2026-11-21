"use server";

import { prisma } from "@/lib/prisma";
import { requireImport } from "@/lib/import-access";
import { canEditMenu } from "@/lib/roles";
import { employeePayColumns } from "@/lib/employee-export";
import type { PayColumn } from "@/lib/employee-import";
import { addSalaryAdjustment } from "../karyawan/actions";

// Import Kenaikan Gaji Massal (Pengaturan -> Import Data). Template berisi gaji yang berlaku saat ini untuk semua
// karyawan aktif; Admin mengubah angka karyawan yang naik gaji. Setiap baris yang berubah disimpan lewat Penyesuaian
// Gaji yang sama dengan profil karyawan (riwayat gaji baru, tempelan komponen, approval Admin per karyawan).
// Baris yang angkanya sama dengan gaji saat ini dilewati.

export type SalaryTemplateRow = {
  employeeId: string; name: string; department: string; harian: boolean;
  basic: number; daily: number | null; factor: number | null; pay: Record<string, number>;
};
export type SalaryImportRow = {
  line: number; employeeId: string; effectiveDate: string; basic: number; daily: number; factor: number;
  pay: Record<string, number | null>; // null = kolom kosong (komponen tidak didapat)
  note: string;
};
export type SalaryImportResult = { saved: number; proposed: number; skipped: number; errors: string[] };

async function access() {
  const a = await requireImport("kenaikangaji");
  // Gaji termasuk data sensitif: Admin juga wajib punya hak edit menu Gaji.
  if (a.role !== "SUPER_ADMIN" && !canEditMenu(a, "gaji")) throw new Error("Import ini butuh hak edit menu Gaji.");
  return a;
}

// Gaji yang berlaku hari ini (atau riwayat paling akhir bila semuanya berlaku di masa depan).
async function currentSalaries(userIds: string[]) {
  const today = new Date(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const all = await prisma.employeeSalary.findMany({
    where: { userId: { in: userIds } }, orderBy: { effectiveDate: "asc" }, include: { components: true },
  });
  const map = new Map<string, (typeof all)[number]>();
  for (const s of all) if (s.effectiveDate <= today || !map.has(s.userId) || map.get(s.userId)!.effectiveDate > today) map.set(s.userId, s);
  return map;
}

export async function salaryTemplate(): Promise<{ pay: PayColumn[]; rows: SalaryTemplateRow[] }> {
  await access();
  const [pay, users] = await Promise.all([
    employeePayColumns(),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" } },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, employeeId: true, name: true, paymentSchedule: true, department: { select: { name: true } } },
    }),
  ]);
  const cur = await currentSalaries(users.map((u) => u.id));
  return {
    pay,
    rows: users.filter((u) => u.employeeId).map((u) => {
      const s = cur.get(u.id);
      return {
        employeeId: u.employeeId!, name: u.name, department: u.department?.name ?? "", harian: u.paymentSchedule === "Mingguan",
        basic: s?.basicSalary ?? 0, daily: s?.dailyWage ?? null, factor: s?.monthlyFactor ?? null,
        pay: Object.fromEntries(pay.map((p) => [p.code, s?.components.find((c) => c.code === p.code)?.amount ?? 0])),
      };
    }),
  };
}

export async function importSalaryRaises(rows: SalaryImportRow[]): Promise<SalaryImportResult> {
  await access();
  const ids = [...new Set(rows.map((r) => r.employeeId.trim().toUpperCase()).filter(Boolean))];
  const [users, masters] = await Promise.all([
    prisma.user.findMany({ where: { employeeId: { in: ids, mode: "insensitive" }, isActive: true, role: { not: "SUPER_ADMIN" } }, select: { id: true, employeeId: true, paymentSchedule: true } }),
    prisma.payComponent.findMany({ where: { isActive: true, method: "INPUT", code: { not: "GP" } }, select: { code: true, name: true, kind: true } }),
  ]);
  const byId = new Map(users.map((u) => [(u.employeeId ?? "").toUpperCase(), u]));
  const cur = await currentSalaries(users.map((u) => u.id));
  const res: SalaryImportResult = { saved: 0, proposed: 0, skipped: 0, errors: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const at = `Baris ${r.line}`;
    const u = byId.get(r.employeeId.trim().toUpperCase());
    if (!u) { res.errors.push(`${at}: ID Karyawan "${r.employeeId}" tidak ditemukan / tidak aktif.`); continue; }
    if (seen.has(u.id)) { res.errors.push(`${at}: ID Karyawan "${r.employeeId}" muncul lebih dari sekali.`); continue; }
    seen.add(u.id);
    const old = cur.get(u.id);
    const harian = u.paymentSchedule === "Mingguan";
    const daily = harian ? Math.round(r.daily) : 0;
    const factor = harian ? (r.factor > 0 ? r.factor : old?.monthlyFactor ?? 0) : 0;
    const basic = harian ? daily * factor : Math.round(r.basic);
    if (harian ? !(daily > 0 && factor > 0) : !(basic > 0)) { res.errors.push(`${at}: ${harian ? "Gaji Harian dan Pengali Bulanan" : "Gaji Pokok"} wajib diisi.`); continue; }

    // Komponen: yang tidak punya kolom di file (diketik bebas / bukan Input) tetap; kolom yang ada menggantikan nilainya.
    const inFile = new Set(Object.keys(r.pay));
    const components = (old?.components ?? [])
      .filter((c) => !c.code || !inFile.has(c.code))
      .map((c) => ({ type: c.type as "TUNJANGAN" | "POTONGAN", name: c.name, amount: c.amount, code: c.code }));
    for (const [code, amount] of Object.entries(r.pay)) {
      const m = masters.find((x) => x.code === code);
      if (m && amount && amount > 0) components.push({ type: m.kind === "POTONGAN" ? "POTONGAN" : "TUNJANGAN", name: m.name, amount: Math.round(amount), code });
    }
    const sig = (list: { code: string | null; name: string; amount: number }[]) => list.map((c) => `${c.code ?? c.name}=${c.amount}`).sort().join("|");
    const same = old && old.basicSalary === basic && (old.dailyWage ?? 0) === daily && (harian ? old.monthlyFactor === factor : true)
      && sig(old.components) === sig(components);
    if (same) { res.skipped++; continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveDate)) { res.errors.push(`${at}: Tanggal Berlaku wajib diisi (contoh 01-01-2027).`); continue; }

    try {
      const out = await addSalaryAdjustment(u.id, {
        effectiveDate: r.effectiveDate, basicSalary: basic, dailyWage: harian ? daily : null, monthlyFactor: harian ? factor : null,
        bpjsTkBase: old?.bpjsTkBase ?? undefined, bpjsKesBase: old?.bpjsKesBase ?? undefined,
        note: r.note.trim() || "Kenaikan gaji (import massal)", components,
      });
      if (out && "error" in out && out.error) res.errors.push(`${at} (${r.employeeId}): ${out.error}`);
      else if (out && "proposed" in out && out.proposed) res.proposed++;
      else res.saved++;
    } catch (e) {
      res.errors.push(`${at} (${r.employeeId}): ${e instanceof Error ? e.message : "gagal disimpan"}.`);
    }
  }
  return res;
}
