// Periode Proses Gaji (aman dipakai di server dan browser).
// Bulanan ditulis "2026-11"; mingguan ditulis sebagai tanggal mulai minggu "2026-11-09";
// THR / Bonus yang dibayar terpisah ditulis "X-<tanggal bayar>-<kode komponen>", mis. "X-2027-03-05-THR".

const DAY = 86_400_000;
export const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const isWeekly = (period: string) => /^\d{4}-\d{2}-\d{2}$/.test(period);
export const isSeparate = (period: string) => /^X-\d{4}-\d{2}-\d{2}-[A-Z0-9_]+$/.test(period);
export const separatePeriod = (payDate: string, code: string) => `X-${payDate}-${code}`;
export const parseSeparate = (period: string) => ({ payDate: period.slice(2, 12), code: period.slice(13) });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const short = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;

export const periodLabel = (period: string) => {
  if (isSeparate(period)) {
    const { payDate, code } = parseSeparate(period);
    const d = new Date(`${payDate}T00:00:00Z`);
    return `${code} terpisah ${short(d)} ${d.getUTCFullYear()}`;
  }
  if (isWeekly(period)) {
    const a = new Date(`${period}T00:00:00Z`), b = new Date(a.getTime() + 6 * DAY);
    return `Minggu ${short(a)} - ${short(b)} ${b.getUTCFullYear()}`;
  }
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Tanggal mulai minggu payroll yang memuat tanggal tertentu (weekStartDay 0 = Minggu ... 6 = Sabtu).
export function weekStartOf(date: string, weekStartDay: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (((d.getUTCDay() - weekStartDay) % 7) + 7) % 7;
  return iso(new Date(d.getTime() - back * DAY));
}
