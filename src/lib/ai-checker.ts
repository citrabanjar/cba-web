import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { LineItem } from "@/lib/payroll-run";
import { AI_MODEL, AI_SETTING_KEY, normalizeAiSettings, type AiSettings } from "@/lib/ai-checker-settings";

// AI pemeriksa sistem, satu arah: portal menyiapkan RINGKASAN data (tanpa nama, No. KTP, rekening, alamat;
// karyawan disebut dengan Employee ID), dikirim lewat Message Batches API (diskon 50%), lalu hasilnya
// ditulis sebagai temuan di Task Admin. Dipanggil cron (lihat vercel.json) dan tombol di Pengaturan.

export async function getAiSettings(): Promise<AiSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_SETTING_KEY } });
  return normalizeAiSettings(row?.value);
}

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

const DAY = 86_400_000;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// ─── Ringkasan data ──────────────────────────────────────────────────────────

export async function buildSnapshot(includeSalary: boolean) {
  const since = new Date(Date.now() - 90 * DAY);
  const [users, components, runs] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "SUPER_ADMIN" }, OR: [{ isActive: true }, { resignDate: { gte: since } }] },
      orderBy: { employeeNo: "asc" },
      select: {
        id: true, employeeId: true, employeeNo: true, name: true, isActive: true, employmentStatus: true, position: true, branch: true,
        joinDate: true, contractEndDate: true, resignDate: true, paymentSchedule: true, birthDate: true, gender: true, maritalStatus: true,
        npwp: true, ptkpStatus: true, taxability: true, taxStatus: true, taxObjectCode: true,
        bpjsTkNumber: true, bpjsTkActive: true, bpjsKesNumber: true, bpjsKesActive: true,
        bankAccount: true, bankHolder: true, managerId: true,
        department: { select: { name: true } },
        family: { select: { relation: true } },
        payComponents: { select: { startDate: true, endDate: true, component: { select: { code: true } } } },
        salaries: { orderBy: { effectiveDate: "desc" }, take: 4, select: { effectiveDate: true, basicSalary: true, dailyWage: true } },
        loans: { where: { status: "BERJALAN" }, select: { principal: true, installments: { select: { period: true, amount: true, status: true } } } },
      },
    }),
    prisma.payComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, kind: true, method: true, base: true, taxable: true } }),
    prisma.payrollRun.findMany({
      where: { status: "FINAL", frequency: "BULANAN" }, orderBy: { period: "desc" }, take: 2,
      select: { period: true, lines: { select: { userId: true, gross: true, earnings: true, deductions: true, benefits: true, pph21: true, netPay: true, items: true } } },
    }),
  ]);

  const code = new Map(users.map((u) => [u.id, u.employeeId ?? `#${u.employeeNo ?? "?"}`]));
  const active = new Map(users.map((u) => [u.id, u.isActive]));

  // Kejanggalan yang bisa dihitung portal sendiri, supaya nama/rekening tidak perlu dikirim.
  const groups = (key: (u: (typeof users)[number]) => string | null, reason: string) => {
    const by = new Map<string, string[]>();
    for (const u of users) { const k = key(u); if (k) by.set(k, [...(by.get(k) ?? []), code.get(u.id)!]); }
    return [...by.values()].filter((g) => g.length > 1).map((employees) => ({ reason, employees }));
  };
  const duplicates = [
    ...groups((u) => (u.bankAccount ? u.bankAccount.replace(/\D/g, "") : null), "Nomor rekening sama"),
    ...groups((u) => (u.birthDate ? `${norm(u.name)}|${ymd(u.birthDate)}` : null), "Nama dan tanggal lahir sama"),
    ...groups((u) => (norm(u.name).length > 3 ? norm(u.name) : null), "Nama sama persis"),
  ];

  const lineOf = (run: (typeof runs)[number] | undefined, userId: string) => run?.lines.find((l) => l.userId === userId);
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

  const employees = users.map((u) => {
    const holder = norm(u.bankHolder);
    const cur = lineOf(runs[0], u.id);
    const prev = lineOf(runs[1], u.id);
    const salary = u.salaries[0];
    const unpaid = u.loans.flatMap((l) => l.installments).filter((i) => i.status !== "LUNAS");
    const lastLoanPeriod = unpaid.map((i) => i.period).sort().at(-1) ?? null;
    const payroll = (l: typeof cur) => l && (includeSalary
      ? {
        gross: l.gross, earnings: l.earnings, deductions: l.deductions, benefits: l.benefits, pph21: l.pph21, netPay: l.netPay,
        items: (l.items as LineItem[]).filter((i) => i.amount).map((i) => ({ code: i.code, kind: i.kind, amount: Math.round(i.amount) })),
      }
      : { deductionsPctOfEarnings: l.earnings ? Math.round((l.deductions / l.earnings) * 100) : null, itemCodes: (l.items as LineItem[]).filter((i) => i.amount).map((i) => i.code) });
    return {
      id: code.get(u.id),
      active: u.isActive,
      status: u.employmentStatus,
      department: u.department?.name ?? null,
      position: u.position,
      branch: u.branch,
      payType: salary?.dailyWage ? "HARIAN" : "BULANAN",
      paymentSchedule: u.paymentSchedule,
      joinDate: ymd(u.joinDate),
      contractEnd: ymd(u.contractEndDate),
      resignDate: ymd(u.resignDate),
      gender: u.gender,
      maritalStatus: u.maritalStatus,
      family: { spouse: u.family.filter((f) => /suami|istri/i.test(f.relation)).length, children: u.family.filter((f) => /anak/i.test(f.relation)).length },
      tax: { ptkp: u.ptkpStatus, hasNpwp: Boolean(u.npwp), taxability: u.taxability, method: u.taxStatus, objectCode: u.taxObjectCode },
      bpjs: { tkActive: u.bpjsTkActive, tkHasNumber: Boolean(u.bpjsTkNumber), kesActive: u.bpjsKesActive, kesHasNumber: Boolean(u.bpjsKesNumber) },
      bank: { hasAccount: Boolean(u.bankAccount), holderMatchesName: !holder ? null : holder.includes(norm(u.name)) || norm(u.name).includes(holder) },
      manager: u.managerId ? { id: code.get(u.managerId) ?? "(bukan karyawan aktif)", active: active.get(u.managerId) ?? false, self: u.managerId === u.id } : null,
      components: u.payComponents.filter((p) => !p.endDate || p.endDate > new Date()).map((p) => p.component.code),
      salary: includeSalary
        ? { basic: salary?.basicSalary ?? null, daily: salary?.dailyWage ?? null, changes: u.salaries.filter((s) => s.effectiveDate >= since).map((s) => ({ date: ymd(s.effectiveDate), basic: s.basicSalary })) }
        : { changedLast90Days: u.salaries.some((s) => s.effectiveDate >= since) },
      payroll: {
        [runs[0]?.period ?? "terakhir"]: payroll(cur) ?? null,
        [runs[1]?.period ?? "sebelumnya"]: payroll(prev) ?? null,
        netPayChangePct: cur && prev ? pct(cur.netPay, prev.netPay) : null,
      },
      loans: unpaid.length ? { remaining: unpaid.reduce((a, i) => a + i.amount, 0), lastPeriod: lastLoanPeriod, endsAfterContract: Boolean(u.contractEndDate && lastLoanPeriod && lastLoanPeriod > ymd(u.contractEndDate)!.slice(0, 7)) } : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    payrollPeriods: runs.map((r) => r.period),
    salaryIncluded: includeSalary,
    components,
    duplicates,
    employees,
  };
}

// ─── Prompt & skema hasil ───────────────────────────────────────────────────

const INSTRUCTIONS = `Anda adalah pemeriksa sistem HR & payroll PT. Citra Banjar Abadi (Indonesia). Anda membaca ringkasan data portal karyawan dan menulis temuan untuk admin HRD. Temuan Anda tampil di "Task Admin"; admin akan menindaklanjuti atau menandainya "Bukan masalah".

Data yang Anda terima: karyawan disebut dengan Employee ID (tanpa nama, No. KTP, rekening, alamat). "duplicates" adalah kelompok yang dihitung portal. Kalau salaryIncluded = false, angka gaji tidak dikirim; nilai lewat persentase saja.

Yang diperiksa:
1. Payroll: gaji bersih naik/turun jauh (lebih dari ±20%) dibanding periode sebelumnya tanpa sebab yang terlihat (perubahan gaji, lembur, THR/bonus, potongan mangkir); komponen yang tidak cocok dengan karyawannya (karyawan harian dengan komponen bulanan, tunjangan jabatan tidak lazim untuk jabatannya); nilai komponen jauh berbeda dari rekan sejabatan; total potongan lebih dari ±50% penghasilan; metode pajak (Gross/Gross Up/Net) yang tidak lazim dibanding rekan.
2. Pajak & BPJS: status PTKP tidak cocok dengan status kawin / jumlah tanggungan anak (maksimal 3); BPJS aktif tapi nomornya kosong, atau sebaliknya; NPWP kosong untuk karyawan yang sudah bekerja lebih dari 3 bulan.
3. Kualitas data: data kembar (lihat duplicates), nama pemilik rekening berbeda dengan nama karyawan (holderMatchesName = false), atasan langsung janggal (atasan tidak aktif, atasan diri sendiri, rantai atasan berputar), angsuran pinjaman melewati akhir kontrak.
4. Prioritas: pilih 3-5 hal paling mendesak untuk dikerjakan admin hari ini, dengan alasan singkat.

Aturan menulis:
- Bahasa Indonesia yang singkat dan jelas untuk admin HRD, bukan bahasa teknis. Sebut Employee ID yang terkait.
- Hanya laporkan hal yang benar-benar terlihat di data. Jangan menebak; kalau ragu, pakai severity RENDAH dan jelaskan apa yang perlu dicek.
- Satu temuan untuk satu masalah. Gabungkan karyawan dengan masalah yang sama dalam satu temuan.
- fingerprint: kunci tetap untuk masalah yang sama, format AREA:kode-singkat:ID-karyawan (urut abjad, dipisah koma), mis. "PAJAK_BPJS:ptkp-tidak-cocok:P012". Kalau masalahnya sama dengan temuan yang masih terbuka (openFindings), pakai fingerprint yang sama persis.
- Jangan laporkan lagi hal yang tercatat di catatan "Bukan masalah", kecuali kondisinya berubah.
- Ikuti SOP perusahaan dan aturan pengecekan tambahan di bawah ini bila ada.
- proposedRules: kalau Anda melihat pola janggal yang belum tercakup daftar di atas dan layak diperiksa rutin, usulkan sebagai aturan baru (judul + isi aturan). Super Admin akan menyetujui atau menolak. Kosongkan kalau tidak ada.
- summary: 1-2 kalimat gambaran umum kondisi data.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings", "proposedRules"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "severity", "title", "detail", "employeeIds", "fingerprint"],
        properties: {
          area: { type: "string", enum: ["PAYROLL", "PAJAK_BPJS", "DATA", "PRIORITAS"] },
          severity: { type: "string", enum: ["TINGGI", "SEDANG", "RENDAH"] },
          title: { type: "string" },
          detail: { type: "string" },
          employeeIds: { type: "array", items: { type: "string" } },
          fingerprint: { type: "string" },
        },
      },
    },
    proposedRules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "content"],
        properties: { title: { type: "string" }, content: { type: "string" } },
      },
    },
  },
} as const;

type AiOutput = {
  summary: string;
  findings: { area: string; severity: string; title: string; detail: string; employeeIds: string[]; fingerprint: string }[];
  proposedRules: { title: string; content: string }[];
};

// Buku catatan: SOP, aturan yang disetujui, dan catatan "Bukan masalah". Disusun stabil (urut tanggal dibuat)
// supaya bagian ini bisa di-cache antar pemeriksaan.
async function notebook() {
  const notes = await prisma.aiNote.findMany({ where: { status: "AKTIF" }, orderBy: { createdAt: "asc" } });
  const part = (kind: string, head: string) => {
    const list = notes.filter((n) => n.kind === kind);
    return list.length ? `## ${head}\n${list.map((n) => `### ${n.title}\n${n.content}`).join("\n\n")}` : "";
  };
  return [
    part("SOP", "SOP perusahaan"),
    part("ATURAN", "Aturan pengecekan tambahan (disetujui Super Admin)"),
    part("BUKAN_MASALAH", "Catatan \"Bukan masalah\" dari admin (jangan dilaporkan lagi kecuali kondisinya berubah)"),
  ].filter(Boolean).join("\n\n") || "Belum ada SOP atau catatan tambahan.";
}

// ─── Kirim & ambil hasil ────────────────────────────────────────────────────

export async function startRun(trigger: "JADWAL" | "MANUAL", by: string | null): Promise<{ error?: string; runId?: string }> {
  if (!hasApiKey()) return { error: "ANTHROPIC_API_KEY belum diisi di Vercel." };
  if (await prisma.aiRun.findFirst({ where: { status: "MENUNGGU" } })) return { error: "Masih ada pemeriksaan yang berjalan. Tunggu hasilnya dulu." };
  const settings = await getAiSettings();
  const [snapshot, book, open] = await Promise.all([
    buildSnapshot(settings.includeSalary),
    notebook(),
    prisma.aiFinding.findMany({ where: { status: "BARU" }, select: { fingerprint: true, title: true } }),
  ]);
  const run = await prisma.aiRun.create({ data: { trigger, model: AI_MODEL, createdBy: by } });
  try {
    const client = new Anthropic();
    const batch = await client.messages.batches.create({
      requests: [{
        custom_id: run.id,
        params: {
          model: AI_MODEL,
          max_tokens: 32000,
          thinking: { type: "adaptive" },
          output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
          system: [
            { type: "text", text: INSTRUCTIONS },
            { type: "text", text: book, cache_control: { type: "ephemeral" } },
          ],
          messages: [{
            role: "user",
            content: `Tanggal hari ini: ${new Date().toLocaleDateString("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" })}.\n\nopenFindings (temuan yang masih terbuka):\n${JSON.stringify(open)}\n\nRingkasan data portal:\n${JSON.stringify(snapshot)}`,
          }],
        },
      }],
    });
    await prisma.aiRun.update({ where: { id: run.id }, data: { batchId: batch.id } });
    return { runId: run.id };
  } catch (e) {
    const msg = e instanceof Anthropic.AuthenticationError ? "API key Anthropic ditolak; periksa ANTHROPIC_API_KEY di Vercel."
      : e instanceof Anthropic.APIError ? `Anthropic API ${e.status}: ${e.message}` : String(e);
    await prisma.aiRun.update({ where: { id: run.id }, data: { status: "GAGAL", error: msg, finishedAt: new Date() } });
    return { error: msg };
  }
}

async function fail(id: string, error: string) {
  await prisma.aiRun.update({ where: { id }, data: { status: "GAGAL", error, finishedAt: new Date() } });
}

// Ambil hasil batch yang sudah selesai dan tulis temuannya. Aman dipanggil berulang.
export async function collectRuns(): Promise<{ collected: number }> {
  const waiting = await prisma.aiRun.findMany({ where: { status: "MENUNGGU" } });
  if (!waiting.length || !hasApiKey()) return { collected: 0 };
  const client = new Anthropic();
  let collected = 0;
  for (const run of waiting) {
    if (!run.batchId) { if (Date.now() - run.createdAt.getTime() > 3_600_000) await fail(run.id, "Batch tidak terkirim."); continue; }
    try {
      const batch = await client.messages.batches.retrieve(run.batchId);
      if (batch.processing_status !== "ended") {
        if (Date.now() - run.createdAt.getTime() > 25 * 3_600_000) await fail(run.id, "Batch tidak selesai dalam 24 jam.");
        continue;
      }
      for await (const res of await client.messages.batches.results(run.batchId)) {
        if (res.custom_id !== run.id) continue;
        if (res.result.type !== "succeeded") { await fail(run.id, `Hasil batch: ${res.result.type}`); continue; }
        const msg = res.result.message;
        const usage = {
          inputTokens: msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0),
          outputTokens: msg.usage.output_tokens,
          cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        };
        if (msg.stop_reason === "refusal") { await prisma.aiRun.update({ where: { id: run.id }, data: usage }); await fail(run.id, "AI menolak memeriksa data ini."); continue; }
        if (msg.stop_reason === "max_tokens") { await prisma.aiRun.update({ where: { id: run.id }, data: usage }); await fail(run.id, "Jawaban AI terpotong (batas token)."); continue; }
        const text = msg.content.find((b) => b.type === "text");
        let out: AiOutput;
        try { out = JSON.parse(text && text.type === "text" ? text.text : "") as AiOutput; } catch { await fail(run.id, "Jawaban AI bukan JSON yang valid."); continue; }
        const count = await saveFindings(run.id, out);
        await prisma.aiRun.update({ where: { id: run.id }, data: { ...usage, status: "SELESAI", summary: out.summary, findingCount: count, finishedAt: new Date() } });
        collected++;
      }
    } catch (e) {
      // Gangguan sementara: coba lagi di panggilan berikutnya.
      if (e instanceof Anthropic.NotFoundError) await fail(run.id, "Batch tidak ditemukan di Anthropic.");
      else if (!(e instanceof Anthropic.APIError)) throw e;
    }
  }
  return { collected };
}

export async function saveFindings(runId: string, out: AiOutput) {
  const [open, dismissed, rules] = await Promise.all([
    prisma.aiFinding.findMany({ where: { status: "BARU" } }),
    prisma.aiFinding.findMany({ where: { status: "BUKAN_MASALAH" }, select: { fingerprint: true } }),
    prisma.aiNote.findMany({ where: { kind: "ATURAN" }, select: { title: true } }),
  ]);
  const skip = new Set(dismissed.map((d) => d.fingerprint));
  const seen = new Set<string>();
  let count = 0;
  for (const f of out.findings ?? []) {
    const fp = String(f.fingerprint || `${f.area}:${f.title}`).slice(0, 200);
    if (skip.has(fp) || seen.has(fp)) continue;
    seen.add(fp);
    count++;
    const data = { runId, area: f.area, severity: f.severity, title: f.title.slice(0, 300), detail: f.detail, employeeIds: f.employeeIds ?? [] };
    const existing = open.find((o) => o.fingerprint === fp);
    if (existing) await prisma.aiFinding.update({ where: { id: existing.id }, data });
    else await prisma.aiFinding.create({ data: { ...data, fingerprint: fp } });
  }
  // Temuan lama yang tidak dilaporkan lagi dianggap sudah teratasi.
  const gone = open.filter((o) => !seen.has(o.fingerprint)).map((o) => o.id);
  if (gone.length) {
    await prisma.aiFinding.updateMany({ where: { id: { in: gone } }, data: { status: "SELESAI", resolvedBy: "AI: tidak ditemukan lagi", resolvedAt: new Date() } });
  }
  const known = new Set(rules.map((r) => norm(r.title)));
  for (const r of out.proposedRules ?? []) {
    if (!r.title?.trim() || known.has(norm(r.title))) continue;
    known.add(norm(r.title));
    await prisma.aiNote.create({ data: { kind: "ATURAN", title: r.title.slice(0, 200), content: r.content, status: "USULAN", source: "AI" } });
  }
  return count;
}

// Dipanggil cron: ambil hasil yang sudah siap, lalu kirim pemeriksaan baru kalau jadwalnya sudah tiba.
export async function runScheduled() {
  const { collected } = await collectRuns();
  const settings = await getAiSettings();
  if (!settings.enabled || !hasApiKey()) return { collected, started: false, reason: "nonaktif" };
  const last = await prisma.aiRun.findFirst({ where: { trigger: "JADWAL", status: { not: "GAGAL" } }, orderBy: { createdAt: "desc" } });
  // Toleransi 3 jam karena jam cron Vercel bisa bergeser.
  if (last && Date.now() - last.createdAt.getTime() < settings.intervalDays * DAY - 3 * 3_600_000) return { collected, started: false, reason: "belum jadwal" };
  const res = await startRun("JADWAL", null);
  return { collected, started: !res.error, reason: res.error };
}
