export { cn } from "cn";

export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Satu format tanggal untuk seluruh portal: dd-mmm-yyyy, misalnya 06-Nov-2026.
// Kolom tanggal saja tersimpan tengah malam UTC, sedangkan waktu kejadian memakai Asia/Jakarta.
// Zona waktu ditulis eksplisit supaya hasil server dan browser sama.
export function formatDate(date: Date | string, timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "numeric", year: "numeric", timeZone,
  }).formatToParts(new Date(date));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}-${MONTHS[Number(part("month")) - 1]}-${part("year")}`;
}

export function formatDateTime(date: Date | string): string {
  const time = new Date(date).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
  return `${formatDate(date, "Asia/Jakarta")} ${time}`;
}

export function formatRupiah(amount: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount ?? 0);
}
