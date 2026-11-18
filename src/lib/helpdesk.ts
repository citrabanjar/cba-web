// Robot Help Desk (gratis, tanpa AI): menjawab pertanyaan karyawan dengan dua cara.
// 1) Pertanyaan tentang data pribadi (saldo cuti, jadwal shift, status pengajuan, slip gaji, lembur, pinjaman)
//    dijawab langsung dari data portal.
// 2) Pertanyaan lain dicari di Basis Pengetahuan (artikel SOP dari Admin) berdasarkan kata kunci.
// Pertanyaan yang tidak terjawab dicatat supaya Admin bisa menambahkan jawabannya ("robot belajar").
import { prisma } from "@/lib/prisma";
import { visibleBalances } from "@/lib/leave-balance";
import { getShiftCalendar } from "@/lib/schedule";
import { OT_APPROVED } from "@/lib/overtime-status";
import { plannedHours } from "@/lib/overtime";

export type HelpLink = { label: string; href: string };
export type HelpAnswer = { text: string; links?: HelpLink[]; articles?: { id: string; title: string; body: string }[]; questionId?: string; unanswered?: boolean };

const STOP = new Set(["saya", "aku", "gimana", "bagaimana", "cara", "caranya", "apa", "apakah", "berapa", "kapan", "dimana", "di", "ke", "dan", "atau",
  "yang", "untuk", "dengan", "ini", "itu", "bisa", "mau", "ingin", "tolong", "mohon", "pak", "bu", "om", "min", "kak", "ya", "dong", "sih", "kah", "nya", "ada", "tidak", "gak", "ga", "nggak",
  // kata umum yang tidak membedakan topik
  "jam", "hari", "bulan", "tahun", "buka", "tutup", "minta", "kalau", "kalo", "jika", "boleh", "harus", "sudah", "belum"]);
// Pertanyaan "cara / aturan / prosedur" dijawab dari artikel SOP, bukan dari data pribadi.
const HOW = ["cara", "gimana", "bagaimana", "prosedur", "aturan", "sop", "langkah", "syarat", "alur"];
export const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => normalize(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
const DAY = 86_400_000;
const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const fmt = (d: Date) => `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()}-${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getUTCMonth()]}-${d.getUTCFullYear()}`;
const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

// ── Jawaban dari data pribadi ──
async function dataAnswer(userId: string, q: string): Promise<HelpAnswer | null> {
  if (HOW.some((w) => q.split(" ").includes(w))) return null;
  if (has(q, "saldo cuti", "sisa cuti", "jatah cuti", "cuti saya tinggal", "cuti tinggal") || (has(q, "cuti") && has(q, "sisa", "saldo", "jatah", "berapa hari"))) {
    const rows = (await visibleBalances([userId])).filter((r) => r.balance > 0 || r.code === "CT");
    if (!rows.length) return { text: "Saat ini belum ada saldo cuti yang tercatat untuk Anda.", links: [{ label: "Buka menu Cuti", href: "/portal/cuti" }] };
    return {
      text: `Saldo cuti Anda saat ini:\n${rows.map((r) => `• ${r.policyName}: ${num(r.balance)} hari${r.pending ? ` (${num(r.pending)} hari masih menunggu persetujuan)` : ""}`).join("\n")}`,
      links: [{ label: "Ajukan cuti", href: "/portal/cuti" }],
    };
  }
  if (has(q, "jadwal", "shift", "masuk jam", "jam masuk", "jam kerja", "libur gak", "libur tidak") && !has(q, "tukar", "ganti shift")) {
    const base = today();
    const offset = has(q, "lusa") ? 2 : has(q, "besok") ? 1 : 0;
    const days = has(q, "minggu ini", "seminggu") ? 7 : 1;
    const from = new Date(base.getTime() + offset * DAY), to = new Date(from.getTime() + (days - 1) * DAY);
    const cal = await getShiftCalendar(userId, from, to);
    const lines: string[] = [];
    for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
      const d = new Date(t), s = cal[keyOf(d)];
      lines.push(`• ${fmt(d)}: ${!s ? "belum ada jadwal" : s.holiday ? `libur (${s.holiday})` : s.isOff ? "libur / OFF" : s.manual ? "jadwal manual belum diisi" : `${s.name} ${s.startTime}–${s.endTime}`}`);
    }
    return { text: `Jadwal kerja Anda:\n${lines.join("\n")}`, links: [{ label: "Buka Kehadiran", href: "/portal/kehadiran" }] };
  }
  if (has(q, "status pengajuan", "pengajuan saya", "sudah disetujui", "belum disetujui", "sampai mana", "di approve", "diapprove")) {
    const [leaves, trips, ots, loans, swaps] = await Promise.all([
      prisma.leaveRequest.count({ where: { userId, status: "PENDING" } }),
      prisma.businessTrip.count({ where: { userId, status: "PENDING" } }),
      prisma.overtime.count({ where: { userId, status: { in: ["PENDING", "MENUNGGU_KARYAWAN"] } } }),
      prisma.employeeLoan.count({ where: { userId, status: "PENDING" } }),
      prisma.shiftSwapRequest.count({ where: { requesterId: userId, status: { in: ["MENUNGGU_REKAN", "MENUNGGU_ATASAN"] } } }),
    ]);
    const parts = [[leaves, "cuti / izin"], [trips, "dinas luar"], [ots, "lembur"], [loans, "pinjaman"], [swaps, "tukar shift"]].filter(([n]) => (n as number) > 0);
    return parts.length
      ? { text: `Pengajuan Anda yang masih menunggu keputusan:\n${parts.map(([n, l]) => `• ${l}: ${n}`).join("\n")}\nRincian dan posisi persetujuannya dapat dilihat di Notifikasi.`, links: [{ label: "Buka Notifikasi", href: "/portal/notifikasi" }] }
      : { text: "Tidak ada pengajuan Anda yang sedang menunggu keputusan." };
  }
  if (has(q, "slip gaji", "slip", "gajian", "gaji bulan")) {
    const p = await prisma.payslip.findFirst({ where: { userId }, orderBy: { period: "desc" }, select: { periodLabel: true } });
    return { text: p ? `Slip gaji terbaru Anda: periode ${p.periodLabel}.` : "Belum ada slip gaji yang diterbitkan untuk Anda. Slip tersedia setelah proses gaji periode tersebut difinalkan.", links: [{ label: "Buka Slip Gaji", href: "/portal/payslip" }] };
  }
  if (has(q, "lembur") && has(q, "berapa", "jam", "total", "bulan ini")) {
    const t = today(), start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const rows = await prisma.overtime.findMany({ where: { userId, status: { in: OT_APPROVED }, date: { gte: start, lte: t } }, select: { date: true, startTime: true, endTime: true } });
    const hours = rows.reduce((a, o) => a + plannedHours(o), 0);
    return { text: rows.length ? `Bulan ini Anda memiliki ${rows.length} lembur yang disetujui, sekitar ${num(hours)} jam efektif (jam dibayar mengikuti absen pulang).` : "Bulan ini belum ada lembur Anda yang disetujui.", links: [{ label: "Buka Lembur", href: "/portal/lembur" }] };
  }
  if (has(q, "pinjaman", "kasbon", "angsuran", "cicilan") && has(q, "sisa", "berapa", "tinggal")) {
    const loans = await prisma.employeeLoan.findMany({ where: { userId, status: "BERJALAN" }, select: { installments: { where: { status: "BELUM" }, select: { amount: true } } } });
    const left = loans.flatMap((l) => l.installments);
    return { text: left.length ? `Sisa pinjaman Anda: ${rupiah(left.reduce((a, i) => a + i.amount, 0))} dalam ${left.length} angsuran.` : "Anda tidak memiliki pinjaman yang sedang berjalan.", links: [{ label: "Buka Pinjaman", href: "/portal/pinjaman" }] };
  }
  return null;
}

// ── Cari artikel: kata kunci bernilai 3, judul 2, isi 1 ──
async function searchArticles(q: string) {
  const words = tokens(q);
  if (!words.length) return [];
  const list = await prisma.helpArticle.findMany({ where: { isActive: true }, select: { id: true, title: true, body: true, keywords: true } });
  const nq = normalize(q);
  return list.map((a) => {
    const kw = a.keywords.split(",").map((k) => normalize(k)).filter(Boolean);
    const title = normalize(a.title), body = normalize(a.body);
    let score = kw.filter((k) => k.includes(" ") && nq.includes(k)).length * 4; // frasa utuh, mis. "tukar shift"
    for (const w of words) {
      if (kw.some((k) => k.split(" ").includes(w))) score += 3;
      if (title.split(" ").includes(w)) score += 2;
      else if (body.includes(w)) score += 1;
    }
    return { a, score };
  }).filter((x) => x.score >= 3).sort((x, y) => y.score - x.score).slice(0, 3).map((x) => x.a);
}

export async function answerQuestion(userId: string, question: string): Promise<HelpAnswer> {
  const q = normalize(question);
  if (!q) return { text: "Silakan tulis pertanyaan Anda." };
  const data = await dataAnswer(userId, q);
  if (data) return data;
  const found = await searchArticles(question);
  if (found.length) {
    await prisma.helpArticle.update({ where: { id: found[0].id }, data: { hits: { increment: 1 } } });
    return { text: found[0].body, articles: found.map((a) => ({ id: a.id, title: a.title, body: a.body })) };
  }
  // Tidak terjawab: dicatat supaya Admin dapat menambahkan jawabannya.
  const row = await prisma.helpQuestion.create({ data: { userId, question: question.trim().slice(0, 1000) } });
  return { text: "Maaf, saya belum menemukan jawaban untuk pertanyaan tersebut. Pertanyaan Anda sudah dicatat. Anda dapat meneruskannya ke HRD agar dijawab langsung.", questionId: row.id, unanswered: true };
}

// Sapaan pembuka robot (diubah Admin di menu Help Desk). {nama} diganti nama depan karyawan.
export const GREETING_KEY = "helpdesk.greeting";
export const DEFAULT_GREETING = "Halo {nama}! Silakan tanyakan seputar cuti, absensi, lembur, jadwal, slip gaji, pinjaman, atau SOP perusahaan.";
export async function getGreeting(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: GREETING_KEY } });
  const v = (row?.value as { text?: unknown } | null)?.text;
  return typeof v === "string" && v.trim() ? v : DEFAULT_GREETING;
}
