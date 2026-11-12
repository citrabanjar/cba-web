"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { regionLabel, regionParts, type ProvinceFile, type WilayahRow } from "@/lib/wilayah";

// Pilihan wilayah bertingkat (Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa) dari data resmi Kemendagri
// yang disimpan di server sendiri (/wilayah/*.json). Nilai = kode kelurahan/desa; onChange juga mengirim nama lengkap.

const provinceCache: { list?: Promise<WilayahRow[]> } = {};
const fileCache = new Map<string, Promise<ProvinceFile>>();
const loadProvinces = () => (provinceCache.list ??= fetch("/wilayah/provinsi.json").then((r) => r.json() as Promise<WilayahRow[]>));
const loadProvince = (code: string) => {
  if (!fileCache.has(code)) fileCache.set(code, fetch(`/wilayah/${code}.json`).then((r) => r.json() as Promise<ProvinceFile>));
  return fileCache.get(code)!;
};
const nameOf = (rows: WilayahRow[] | undefined, code: string) => rows?.find((r) => r[0] === code)?.[1] ?? "";

const selectCls = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm disabled:bg-gray-50 disabled:text-gray-500";

// Kode pos (opsional): terisi otomatis dari kelurahan/desa yang dipilih bila datanya ada, dan tetap bisa diketik ulang.
export default function RegionSelect({ value, onChange, disabled, label, postal, onPostalChange }: {
  value: string; onChange: (code: string, name: string, postal: string) => void; disabled?: boolean; label?: string;
  postal?: string; onPostalChange?: (v: string) => void;
}) {
  const t = useT();
  const initial = regionParts(value || "");
  const [provinces, setProvinces] = useState<WilayahRow[]>([]);
  const [loaded, setLoaded] = useState<{ code: string; file: ProvinceFile } | null>(null);
  const [prov, setProv] = useState(initial.province);
  const [city, setCity] = useState(initial.city);
  const [district, setDistrict] = useState(initial.district);

  useEffect(() => { loadProvinces().then(setProvinces).catch(() => setProvinces([])); }, []);
  useEffect(() => {
    if (!prov) return;
    let alive = true;
    loadProvince(prov).then((f) => { if (alive) setLoaded({ code: prov, file: f }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [prov]);
  const file = loaded && loaded.code === prov ? loaded.file : null;
  const loading = !!prov && !file;

  const cities = prov && file ? file.k : [];
  const districts = city && file ? file.c[city] ?? [] : [];
  const villages = district && file ? file.d[district] ?? [] : [];
  const village = value && regionParts(value).district === district ? value : "";

  const pickVillage = (code: string) => {
    if (!code) { onChange("", "", ""); return; }
    const postalFound = villages.find((r) => r[0] === code)?.[2] ?? "";
    onChange(code, regionLabel(nameOf(villages, code), nameOf(districts, district), nameOf(cities, city), nameOf(provinces, prov)), postalFound);
  };
  const box = (lbl: string, val: string, rows: WilayahRow[], onPick: (v: string) => void, off: boolean) => (
    <label className="space-y-1">
      <span className="text-[11px] text-gray-500"><T>{lbl}</T></span>
      <select value={val} disabled={disabled || off} onChange={(e) => onPick(e.target.value)} className={selectCls}>
        <option value="">{t(off ? "—" : "Pilih")}</option>
        {rows.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-1.5">
      {label && <p className="flex items-center gap-1.5 text-xs font-medium"><T>{label}</T>{loading && <Loader2 size={12} className="animate-spin text-gray-400" />}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {box("Provinsi", prov, provinces, (v) => { setProv(v); setCity(""); setDistrict(""); onChange("", "", ""); }, false)}
        {box("Kabupaten / Kota", city, cities, (v) => { setCity(v); setDistrict(""); onChange("", "", ""); }, !prov || !file)}
        {box("Kecamatan", district, districts, (v) => { setDistrict(v); onChange("", "", ""); }, !city)}
        {box("Kelurahan / Desa", village, villages, pickVillage, !district)}
        {onPostalChange && (
          <label className="space-y-1">
            <span className="text-[11px] text-gray-500"><T>Kode pos</T></span>
            <input inputMode="numeric" maxLength={5} value={postal ?? ""} disabled={disabled} placeholder="70xxx"
              onChange={(e) => onPostalChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className={`${selectCls} ${postal && postal.length !== 5 ? "border-rose-400" : ""}`} />
          </label>
        )}
      </div>
      {onPostalChange && village && !postal && <p className="text-[11px] text-amber-700"><T>Kode pos kelurahan ini belum ada di data. Isi sesuai KTP / surat.</T></p>}
    </div>
  );
}
