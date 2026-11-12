// Mencocokkan nama wilayah dari file impor (Kelurahan/Desa, Kecamatan, Kabupaten/Kota, Provinsi) ke data Kemendagri
// di /wilayah/*.json (dipakai di browser saat impor Excel). Penulisan tidak harus persis: huruf besar/kecil, spasi,
// tanda baca, dan awalan seperti "Kel.", "Desa", "Kec.", "Kab.", "Kabupaten", "Prov." diabaikan.
// Hasil null = tidak ketemu / masih ganda → wilayah dibiarkan kosong (diisi manual nanti).
import { regionLabel, type ProvinceFile, type WilayahRow } from "@/lib/wilayah";

export type RegionInput = { village?: string; district?: string; city?: string; province?: string };
export type RegionMatch = { code: string; name: string; postal: string };

const base = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const strip = (s: string, prefixes: string[]) => {
  let t = base(s);
  for (const p of prefixes) if (t.startsWith(p + " ")) { t = t.slice(p.length + 1); break; }
  return t;
};
const VILLAGE = ["KELURAHAN", "KEL", "DESA", "DS"];
const DISTRICT = ["KECAMATAN", "KEC"];
const CITY = ["KABUPATEN", "KAB", "KOTA ADMINISTRASI", "KOTA ADM", "KOTA"];
const PROVINCE = ["PROVINSI", "PROV"];
// Singkatan provinsi yang lazim ditulis di data karyawan.
const PROVINCE_ALIAS: Record<string, string> = {
  KALSEL: "KALIMANTAN SELATAN", KALTENG: "KALIMANTAN TENGAH", KALTIM: "KALIMANTAN TIMUR", KALBAR: "KALIMANTAN BARAT", KALTARA: "KALIMANTAN UTARA",
  JABAR: "JAWA BARAT", JATENG: "JAWA TENGAH", JATIM: "JAWA TIMUR", DKI: "DAERAH KHUSUS IBUKOTA JAKARTA", "DKI JAKARTA": "DAERAH KHUSUS IBUKOTA JAKARTA",
  JAKARTA: "DAERAH KHUSUS IBUKOTA JAKARTA", DIY: "DAERAH ISTIMEWA YOGYAKARTA", YOGYAKARTA: "DAERAH ISTIMEWA YOGYAKARTA", JOGJA: "DAERAH ISTIMEWA YOGYAKARTA",
  SUMUT: "SUMATERA UTARA", SUMBAR: "SUMATERA BARAT", SUMSEL: "SUMATERA SELATAN", SULSEL: "SULAWESI SELATAN", SULUT: "SULAWESI UTARA",
  SULTENG: "SULAWESI TENGAH", SULTRA: "SULAWESI TENGGARA", SULBAR: "SULAWESI BARAT", NTB: "NUSA TENGGARA BARAT", NTT: "NUSA TENGGARA TIMUR",
  BABEL: "KEPULAUAN BANGKA BELITUNG", KEPRI: "KEPULAUAN RIAU", MALUT: "MALUKU UTARA",
};

// Kandidat yang cocok: sama persis dulu, lalu tanpa awalan.
function candidates(rows: WilayahRow[], text: string | undefined, prefixes: string[]): WilayahRow[] {
  if (!text?.trim()) return [];
  const exact = rows.filter((r) => base(r[1]) === base(text));
  if (exact.length) return exact;
  const want = strip(text, prefixes);
  return rows.filter((r) => strip(r[1], prefixes) === want);
}
// Tepat satu yang cocok; ganda / tidak ada = null.
const pick = (rows: WilayahRow[], text: string | undefined, prefixes: string[]) => {
  const c = candidates(rows, text, prefixes);
  return c.length === 1 ? c[0] : null;
};

const fileCache = new Map<string, Promise<ProvinceFile>>();
const loadProvince = (code: string) => {
  if (!fileCache.has(code)) fileCache.set(code, fetch(`/wilayah/${code}.json`).then((r) => r.json() as Promise<ProvinceFile>));
  return fileCache.get(code)!;
};
let provinces: Promise<WilayahRow[]> | null = null;

export async function matchRegion(input: RegionInput): Promise<RegionMatch | null> {
  if (!input.village?.trim() || !input.district?.trim() || !input.city?.trim() || !input.province?.trim()) return null;
  provinces ??= fetch("/wilayah/provinsi.json").then((r) => r.json() as Promise<WilayahRow[]>);
  const provText = PROVINCE_ALIAS[strip(input.province, PROVINCE)] ?? input.province;
  const prov = pick(await provinces, provText, PROVINCE);
  if (!prov) return null;
  const file = await loadProvince(prov[0]);
  // Kabupaten/kota yang namanya ganda (mis. "Bekasi" = Kota & Kabupaten) dipilih dari yang punya kecamatan + kelurahan itu.
  const found: RegionMatch[] = [];
  for (const city of candidates(file.k, input.city, CITY)) {
    const district = pick(file.c[city[0]] ?? [], input.district, DISTRICT);
    const village = district ? pick(file.d[district[0]] ?? [], input.village, VILLAGE) : null;
    if (district && village) found.push({ code: village[0], name: regionLabel(village[1], district[1], city[1], prov[1]), postal: village[2] ?? "" });
  }
  return found.length === 1 ? found[0] : null;
}
