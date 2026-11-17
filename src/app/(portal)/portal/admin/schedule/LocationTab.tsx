"use client";

import { proposedText } from "@/lib/approval-text";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Crosshair, ExternalLink, Loader2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { googleMapsLink } from "@/lib/google-maps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import LocationMap from "./LocationMap";
import { deleteLocation, saveLocation, type LocationInput } from "./actions";
import { askConfirm, showNotice } from "@/components/portal/Confirm";

export type Location = LocationInput & { id: string; address: string };
type Option = { id: string; label: string; sub?: string; color?: string; department?: string | null };

const EMPTY: LocationInput = {
  name: "", address: "", latitude: 0, longitude: 0, radius: 200, isActive: true,
  employeeIds: [], shiftIds: [], patternIds: [],
};

// Daftar centang dengan pencarian, dipakai untuk memilih karyawan/shift/pola kerja.
function PickList({
  options, selected, onChange, searchable = false,
}: {
  options: Option[]; selected: string[]; onChange: (ids: string[]) => void; searchable?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const shown = q
    ? options.filter((o) => `${o.label} ${o.sub ?? ""} ${o.department ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : options;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  // "Pilih semua" berlaku untuk daftar yang sedang tampil (hasil pencarian kalau ada).
  const allShown = shown.length > 0 && shown.every((o) => selected.includes(o.id));
  const someShown = !allShown && shown.some((o) => selected.includes(o.id));
  const toggleAll = () => {
    const ids = new Set(shown.map((o) => o.id));
    onChange(allShown ? selected.filter((x) => !ids.has(x)) : [...new Set([...selected, ...ids])]);
  };
  return (
    <div className="space-y-2">
      {searchable && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama, ID, atau departemen...")} className="pl-9" />
        </div>
      )}
      {shown.length > 1 && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border-b border-gray-100 px-2 pb-2 pt-1">
          <input type="checkbox" checked={allShown} ref={(el) => { if (el) el.indeterminate = someShown; }} onChange={toggleAll}
            className="h-4 w-4 accent-[var(--color-brand)]" />
          <span className="flex-1 text-sm font-semibold text-gray-800">
            {q ? <T>Pilih semua hasil pencarian</T> : <T>Pilih semua</T>} ({shown.length})
          </span>
          <span className="text-xs text-gray-400">{selected.length} <T>dipilih</T></span>
        </label>
      )}
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {shown.length === 0 && <p className="py-2 text-xs text-gray-400"><T>Tidak ada data.</T></p>}
        {shown.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
            {o.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.color }} />}
            <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{o.label}</span>
            {o.sub && <span className="shrink-0 text-xs text-gray-400">{o.sub}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

// Formulir lokasi di panel kanan (bukan dialog), seperti Jenis Cuti & Komponen Payroll.
function LocationForm({
  location, others, employees, shifts, patterns, onClose, onDirty,
}: {
  location: Location | "new"; others: Location[]; employees: Option[]; shifts: Option[]; patterns: Option[]; onClose: () => void; onDirty: (d: boolean) => void;
}) {
  const t = useT();
  const initial = useMemo<LocationInput>(() => (location === "new" ? EMPTY : location), [location]);
  const [form, setForm] = useState<LocationInput>(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const [scope, setScope] = useState<"karyawan" | "shift" | "pola">("karyawan");
  const [error, setError] = useState<string | null>(null);
  const [gps, setGps] = useState(false);
  const [pending, start] = useTransition();
  const hasPoint = !(form.latitude === 0 && form.longitude === 0);
  const point = useMemo(
    () => (hasPoint ? { latitude: form.latitude, longitude: form.longitude, radius: form.radius || 0 } : null),
    [hasPoint, form.latitude, form.longitude, form.radius],
  );
  const otherPoints = useMemo(
    () => others.filter((o) => location === "new" || o.id !== location.id).map((o) => ({ ...o })),
    [others, location],
  );
  const set = <K extends keyof LocationInput>(k: K, v: LocationInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pick = (lat: number, lng: number) => setForm((f) => ({ ...f, latitude: +lat.toFixed(6), longitude: +lng.toFixed(6) }));

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Browser tidak mendukung GPS.");
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { pick(p.coords.latitude, p.coords.longitude); setGps(false); },
      () => { setError("Izinkan akses lokasi untuk memakai posisi Anda."); setGps(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await saveLocation(location === "new" ? null : location.id, form);
      if (r.error) { void showNotice(t(r.error), "error"); return; }
      onDirty(false);
      void showNotice(r.proposed ? proposedText(r.proposed) : t("Lokasi absen tersimpan."));
      if (location === "new") onClose();
    });
  }
  function cancel() {
    if (location === "new") { onDirty(false); onClose(); return; }
    setForm(initial); setError(null);
  }

  const scopes = [
    { key: "karyawan", label: "Karyawan", count: form.employeeIds.length },
    { key: "shift", label: "Shift", count: form.shiftIds.length },
    { key: "pola", label: "Pola Kerja", count: form.patternIds.length },
  ] as const;

  return (
    <div>
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="outline" disabled={pending || (location !== "new" && !dirty)} onClick={cancel}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending || (location !== "new" && !dirty)} className="gap-1.5">
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
          </Button>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Nama Lokasi</T></Label>
              <Input value={form.name} placeholder={t("Contoh: Kantor Banjarmasin, Gudang, Proyek A")} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Alamat</T></Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900"><T>Titik & Radius</T></p>
              <button type="button" onClick={useMyLocation} disabled={gps}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {gps ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />} <T>Pakai lokasi saya</T>
              </button>
            </div>
            <LocationMap
              point={point}
              others={otherPoints}
              onPick={pick}
              onPlace={({ name, address }) => setForm((f) => ({
                ...f,
                name: f.name.trim() ? f.name : name,
                address: f.address.trim() ? f.address : address,
              }))}
            />
            <p className="text-[11px] text-gray-400"><T>Cari nama tempat, klik peta, atau geser titik merah untuk memindahkan lokasi. Lingkaran lain adalah lokasi yang sudah ada.</T></p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr]">
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input type="number" step="any" value={hasPoint ? form.latitude : ""} onChange={(e) => set("latitude", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input type="number" step="any" value={hasPoint ? form.longitude : ""} onChange={(e) => set("longitude", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Radius</T>: <b>{form.radius} m</b></Label>
                <input type="range" min={20} max={1000} step={10} value={form.radius}
                  onChange={(e) => set("radius", Number(e.target.value))} className="mt-2 w-full accent-[var(--color-brand)]" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900"><T>Berlaku untuk</T></p>
            <p className="text-[11px] text-gray-400">
              <T>Lokasi dari karyawan, shift, dan pola kerja digabung. Karyawan yang belum punya lokasi boleh absen di semua lokasi aktif.</T>
            </p>
            <div className="flex gap-1 rounded-full bg-gray-100 p-1">
              {scopes.map((s) => (
                <button key={s.key} type="button" onClick={() => setScope(s.key)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${scope === s.key ? "bg-ink text-white" : "text-gray-500 hover:text-gray-900"}`}>
                  <T>{s.label}</T> {s.count > 0 && <span className="ml-1 rounded-full bg-white/25 px-1.5">{s.count}</span>}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-gray-200 p-2">
              {scope === "karyawan" && <PickList searchable options={employees} selected={form.employeeIds} onChange={(v) => set("employeeIds", v)} />}
              {scope === "shift" && <PickList options={shifts} selected={form.shiftIds} onChange={(v) => set("shiftIds", v)} />}
              {scope === "pola" && <PickList options={patterns} selected={form.patternIds} onChange={(v) => set("patternIds", v)} />}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
            <T>Lokasi aktif</T>
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        </div>
    </div>
  );
}

export default function LocationTab({
  locations, employees, shifts, patterns,
}: {
  locations: Location[]; employees: Option[]; shifts: Option[]; patterns: Option[];
}) {
  const t = useT();
  const [creating, setCreating] = useState(false); // formulir lokasi baru di panel kanan
  const [dirty, setDirty] = useState(false); // ada isian yang belum disimpan
  const [showForm, setShowForm] = useState(false); // formulir ubah: dibuka / disembunyikan
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canEdit = useCanEdit(); // hak lihat saja: tanpa tambah/ubah/hapus lokasi
  const names = (ids: string[], list: Option[]) => ids.map((id) => list.find((o) => o.id === id)?.label).filter(Boolean) as string[];
  const selected = locations.find((l) => l.id === selectedId) ?? locations[0];

  async function leave(go: () => void) {
    if (dirty && !(await askConfirm(t("Perubahan belum disimpan. Tinggalkan tanpa menyimpan?")))) return;
    setDirty(false);
    go();
  }
  async function remove(l: Location) {
    if (!await askConfirm(t("Hapus lokasi ini?"))) return;
    start(async () => {
      const r = await deleteLocation(l.id);
      if (r.error) void showNotice(t(r.error), "error");
      else if (r.proposed) void showNotice(proposedText(r.proposed));
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="section-head flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="section-icon"><MapPin size={17} /></span>
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px]"><T>Lokasi Absen</T></h3>
            <p className="text-xs text-gray-500"><T>Absen di luar radius ditolak. Saat Dinas Luar, absen boleh di mana saja dan lokasinya tetap disimpan.</T></p>
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={() => leave(() => { setCreating(true); setShowForm(true); })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <Plus size={14} /> <T>Tambah Lokasi</T>
          </button>
        )}
      </div>

      <div className="p-5">
        {locations.length === 0 && !creating ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center">
            <MapPin size={28} className="mx-auto text-gray-300" />
            <p className="mt-2 text-sm text-gray-500"><T>Belum ada lokasi absen.</T></p>
            <p className="text-xs text-gray-400"><T>Selama belum ada lokasi, absen belum dibatasi lokasi.</T></p>
          </div>
        ) : (
          /* Daftar lokasi di kiri, rincian lokasi terpilih di kanan (seperti Jenis Cuti). */
          <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
            <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {locations.map((l) => {
                const on = !creating && l.id === selected?.id;
                return (
                  <button key={l.id} type="button" onClick={() => { if (!on) leave(() => { setCreating(false); setSelectedId(l.id); }); }}
                    className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"} ${l.isActive ? "" : "opacity-55"}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-rose-400 text-white"><MapPin size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}>{l.name}</span>
                      <span className="block text-[11px] text-gray-400"><T>Radius</T> {l.radius} m{!l.isActive && <> · <T>Nonaktif</T></>}</span>
                    </span>
                    <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
                  </button>
                );
              })}
              {locations.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400"><T>Belum ada lokasi absen.</T></p>}
            </nav>

            {creating && canEdit && (
              <div className="relative h-fit min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <span className="absolute inset-y-0 left-0 w-1.5 bg-ink" />
                <div className="p-4 pl-5">
                  <p className="mb-4 font-bold text-gray-900"><T>Tambah Lokasi Absen</T></p>
                  <LocationForm key="new" location="new" others={locations} employees={employees} shifts={shifts} patterns={patterns}
                    onDirty={setDirty} onClose={() => { setDirty(false); setCreating(false); }} />
                </div>
              </div>
            )}
            {!creating && selected && (() => {
              const l = selected;
              const emp = names(l.employeeIds, employees);
              const sh = names(l.shiftIds, shifts);
              const pa = names(l.patternIds, patterns);
              const scopeText = [
                emp.length ? `${emp.length} ${t("karyawan")}` : null,
                sh.length ? `${t("Shift")}: ${sh.join(", ")}` : null,
                pa.length ? `${t("Pola")}: ${pa.join(", ")}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <div className="relative h-fit min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-brand" />
                  <div className="p-4 pl-5">
                    <div className={`flex items-start gap-3 ${l.isActive ? "" : "opacity-55"}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><MapPin size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">{l.name}</p>
                        <p className="text-xs text-gray-500">{l.address || `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`}</p>
                      </div>
                      {canEdit && <button type="button" onClick={() => remove(l)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 font-semibold text-rose-700"><T>Radius</T> {l.radius} m</span>
                      {!l.isActive && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-600"><T>Nonaktif</T></span>}
                      <a href={googleMapsLink(l.latitude, l.longitude)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 font-semibold text-gray-700 hover:bg-gray-200">
                        <ExternalLink size={11} /> <T>Buka di Google Maps</T>
                      </a>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{scopeText || t("Belum ditempel ke karyawan, shift, atau pola kerja.")}</p>
                    {/* Peta lokasi terpilih; disembunyikan saat formulir dibuka (formulir punya peta sendiri). */}
                    {!showForm && (
                      <div className="mt-3">
                        <LocationMap key={`${l.id}:${l.latitude}:${l.longitude}:${l.radius}`} point={null} height={260}
                          others={[{ latitude: l.latitude, longitude: l.longitude, radius: l.radius, name: l.name }]} />
                      </div>
                    )}
                    {canEdit && (
                      <>
                        {/* Garis pembatas sekaligus tombol buka / sembunyikan formulir ubah. */}
                        <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}
                          className="group mt-4 flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-brand">
                          <span className="h-px flex-1 bg-gray-200 group-hover:bg-brand/40" />
                          <T>{showForm ? "Sembunyikan pengaturan" : "Tampilkan pengaturan"}</T>
                          <ChevronDown size={14} className={`transition-transform ${showForm ? "rotate-180" : ""}`} />
                          <span className="h-px flex-1 bg-gray-200 group-hover:bg-brand/40" />
                        </button>
                        {showForm && (
                          <div className="pt-4">
                            <LocationForm key={`${l.id}:${JSON.stringify(l)}`} location={l} others={locations} employees={employees} shifts={shifts} patterns={patterns}
                              onDirty={setDirty} onClose={() => {}} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}
