// Mencocokkan nama wilayah dari file impor (Kelurahan/Desa, Kecamatan, Kabupaten/Kota, Provinsi) ke data Kemendagri
// di /wilayah/*.json (dipakai di browser saat impor Excel). Harus PERSIS sama dengan nama parameter — tidak ada
// perbaikan otomatis: awalan "KEL." / "KEC." / "PROV.", singkatan (KALSEL, JABAR), atau nama kota tanpa "KOTA"/"KABUPATEN"
// dianggap tidak cocok. Hanya spasi berlebih dan huruf besar/kecil yang diabaikan.
// Hasil null = tidak ketemu → wilayah dibiarkan kosong (diisi manual nanti), karyawan tetap terimport.
import { regionLabel, type ProvinceFile, type WilayahRow } from "@/lib/wilayah";

export type RegionInput = { village?: string; district?: string; city?: string; province?: string };
export type RegionMatch = { code: string; name: string; postal: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

// Tepat satu baris yang namanya sama persis; tidak ada / ganda = null.
function pick(rows: WilayahRow[], text: string | undefined): WilayahRow | null {
  if (!text?.trim()) return null;
  const want = norm(text);
  const found = rows.filter((r) => norm(r[1]) === want);
  return found.length === 1 ? found[0] : null;
}

const fileCache = new Map<string, Promise<ProvinceFile>>();
const loadProvince = (code: string) => {
  if (!fileCache.has(code)) fileCache.set(code, fetch(`/wilayah/${code}.json`).then((r) => r.json() as Promise<ProvinceFile>));
  return fileCache.get(code)!;
};
let provinces: Promise<WilayahRow[]> | null = null;

export async function matchRegion(input: RegionInput): Promise<RegionMatch | null> {
  provinces ??= fetch("/wilayah/provinsi.json").then((r) => r.json() as Promise<WilayahRow[]>);
  const prov = pick(await provinces, input.province);
  if (!prov) return null;
  const file = await loadProvince(prov[0]);
  const city = pick(file.k, input.city);
  const district = city ? pick(file.c[city[0]] ?? [], input.district) : null;
  const village = district ? pick(file.d[district[0]] ?? [], input.village) : null;
  if (!city || !district || !village) return null;
  return { code: village[0], name: regionLabel(village[1], district[1], city[1], prov[1]), postal: village[2] ?? "" };
}
