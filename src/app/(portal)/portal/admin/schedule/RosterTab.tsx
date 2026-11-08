"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, Copy, Eraser, Loader2, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { T, useT } from "@/components/i18n";
import type { DayShift } from "@/lib/schedule";
import { saveShiftDays } from "./actions";

type Shift = { id: string; code: string; name: string; color: string; isOff: boolean; startTime: string | null; endTime: string | null };
type Row = { id: string; name: string; employeeId: string; department: string | null; days: Record<string, DayShift>; unscheduled: number };

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ERASE = "__hapus__";
const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const shiftKey = (date: string, days: number) => {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

// Tabel jadwal bulanan: baris karyawan, kolom tanggal. Pilih kartu shift lalu klik atau seret
// di atas kotak tanggal untuk mengisi; kartu juga bisa diseret langsung ke kotak tanggal.
export default function RosterTab({
  year, month, showAll, rows, shifts,
}: {
  year: number; month: number; showAll: boolean; rows: Row[]; shifts: Shift[];
}) {
  const t = useT();
  const router = useRouter();
  const [brush, setBrush] = useState<string>(shifts.find((s) => !s.isOff)?.id ?? ERASE);
  const [changes, setChanges] = useState<Record<string, string>>({}); // "userId|date" → shiftId atau ERASE
  const [painting, setPainting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => keyOf(year, month, i + 1));
  const monthParam = (offset: number) => {
    const d = new Date(Date.UTC(year, month + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const shown = rows.filter((r) => !q || `${r.name} ${r.employeeId}`.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  // Isi kotak (atau hapus isiannya) dengan kartu yang dipilih.
  const paint = (userId: string, date: string, value = brush) =>
    setChanges((c) => ({ ...c, [`${userId}|${date}`]: value }));

  // Tampilan satu kotak: perubahan yang belum disimpan dulu, lalu data dari server.
  function cell(row: Row, date: string): { shift: DayShift | null; changed: boolean; cleared: boolean } {
    const change = changes[`${row.id}|${date}`];
    if (change === ERASE) return { shift: null, changed: true, cleared: true };
    if (change) {
      const s = byId.get(change)!;
      return { shift: { ...s, override: true }, changed: true, cleared: false };
    }
    return { shift: row.days[date] ?? null, changed: false, cleared: false };
  }

  // Kotak yang belum diisi diisi dengan shift 7 hari sebelumnya.
  function fillFromPreviousWeek() {
    const next = { ...changes };
    let filled = 0;
    for (const row of shown) {
      for (const date of dates) {
        const now = cell(row, date);
        if (now.shift && !now.shift.manual && !now.cleared) continue;
        const prevDate = shiftKey(date, -7);
        const prevChange = next[`${row.id}|${prevDate}`];
        const prevShift = prevChange && prevChange !== ERASE ? byId.get(prevChange) : null;
        const fromServer = row.days[prevDate];
        const source = prevShift?.id ?? (fromServer?.override || (fromServer && !fromServer.manual && !fromServer.holiday)
          ? shifts.find((s) => s.code === fromServer.code)?.id
          : undefined);
        if (source) { next[`${row.id}|${date}`] = source; filled += 1; }
      }
    }
    setChanges(next);
    setMsg({ ok: true, text: filled ? `${filled} kotak diisi dari minggu sebelumnya. Klik Simpan.` : "Tidak ada kotak kosong yang bisa diisi." });
  }

  function save() {
    setMsg(null);
    const list = Object.entries(changes).map(([k, v]) => {
      const [userId, date] = k.split("|");
      return { userId, date, shiftId: v === ERASE ? null : v };
    });
    start(async () => {
      const r = await saveShiftDays(list);
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setChanges({});
        setMsg({ ok: true, text: `${r.count} perubahan tersimpan.${r.marked ? ` ${r.marked} karyawan otomatis ditandai Jadwal Manual.` : ""}` });
        router.refresh();
      }
    });
  }

  const pendingCount = Object.keys(changes).length;
  // Kotak wajib diisi yang masih kosong: jadwal manual belum diisi, atau karyawan tanpa jadwal sama sekali.
  const isEmpty = (row: Row, date: string) => {
    const c = cell(row, date);
    return !c.changed && (c.shift ? !!c.shift.manual : row.unscheduled > 0);
  };
  const emptyByRow = shown.map((r) => dates.filter((d) => isEmpty(r, d)).length);
  const emptyCount = emptyByRow.reduce((a, b) => a + b, 0);
  const emptyPeople = emptyByRow.filter((n) => n > 0).length;

  return (
    <div className="space-y-4">
        {/* Bulan, filter, dan tombol aksi */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1 rounded-full border border-gray-200 p-1">
            <Link scroll={false} href={`?tab=jadwal&bulan=${monthParam(-1)}${showAll ? "&semua=1" : ""}`} aria-label={t("Bulan sebelumnya")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"><ChevronLeft size={16} /></Link>
            <span className="min-w-36 text-center text-sm font-semibold text-gray-800"><T>{MONTHS[month]}</T> {year}</span>
            <Link scroll={false} href={`?tab=jadwal&bulan=${monthParam(1)}${showAll ? "&semua=1" : ""}`} aria-label={t("Bulan berikutnya")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"><ChevronRight size={16} /></Link>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1 text-xs font-semibold">
            <Link scroll={false} href={`?tab=jadwal&bulan=${monthParam(0)}`} className={`rounded-full px-3 py-1.5 ${!showAll ? "bg-ink text-white" : "text-gray-500"}`}>
              <T>Jadwal Manual</T>
            </Link>
            <Link scroll={false} href={`?tab=jadwal&bulan=${monthParam(0)}&semua=1`} className={`rounded-full px-3 py-1.5 ${showAll ? "bg-ink text-white" : "text-gray-500"}`}>
              <T>Semua karyawan</T>
            </Link>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau ID...")}
            className="h-9 w-48 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm" />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={fillFromPreviousWeek}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Copy size={14} /> <T>Isi dari minggu sebelumnya</T>
            </button>
            {pendingCount > 0 && (
              <button type="button" onClick={() => { setChanges({}); setMsg(null); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <RotateCcw size={14} /> <T>Batalkan</T>
              </button>
            )}
            <button type="button" onClick={save} disabled={pending || pendingCount === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-40">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T> {pendingCount > 0 && `(${pendingCount})`}
            </button>
          </div>
        </div>

        {/* Kartu shift: pilih lalu klik/seret di tabel, atau seret kartunya ke kotak tanggal */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3">
          <span className="mr-1 text-xs font-semibold text-gray-500"><T>Kartu shift</T>:</span>
          {shifts.map((s) => (
            <button key={s.id} type="button" draggable
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", s.id); setBrush(s.id); }}
              onClick={() => setBrush(s.id)}
              title={s.isOff ? s.name : `${s.name} · ${s.startTime}–${s.endTime}`}
              className={`inline-flex h-9 cursor-grab items-center gap-2 rounded-xl px-3 text-xs font-bold text-white shadow-sm transition-transform active:cursor-grabbing ${brush === s.id ? "ring-2 ring-ink ring-offset-2 scale-105" : "opacity-85 hover:opacity-100"}`}
              style={{ background: s.color }}>
              {s.code}
              <span className="font-medium opacity-90">{s.name}</span>
            </button>
          ))}
          <button type="button" onClick={() => setBrush(ERASE)} draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", ERASE); setBrush(ERASE); }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 text-xs font-semibold text-gray-600 ${brush === ERASE ? "ring-2 ring-ink ring-offset-2" : ""}`}>
            <Eraser size={14} /> <T>Hapus isian</T>
          </button>
          <span className="text-[11px] text-gray-400">
            <T>Pilih kartu, lalu klik atau tahan-dan-geser di kotak tanggal. Kartu juga bisa diseret ke kotak.</T>
          </span>
        </div>

        {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
        {emptyCount > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              <b>{emptyCount} <T>hari kerja dari</T> {emptyPeople} <T>karyawan belum memiliki shift</T></b> <T>(kotak bergaris).</T>{" "}
              <T>Isi shift-nya di sini. Karyawan tanpa jadwal otomatis ditandai Jadwal Manual setelah disimpan; untuk karyawan kantor, tempel pola kerja di tab Pola Kerja.</T>
            </span>
          </p>
        )}

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-14 text-center">
            <CalendarRange size={28} className="mx-auto text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              {showAll ? <T>Tidak ada karyawan.</T> : <T>Belum ada karyawan Jadwal Manual di bulan ini.</T>}
            </p>
            {!showAll && (
              <p className="text-xs text-gray-400">
                <T>Tandai karyawan sebagai Jadwal Manual di profilnya (tab Kehadiran & Shift → Atur Jadwal), atau pilih Semua karyawan untuk tukar shift.</T>
              </p>
            )}
          </div>
        ) : (
          // Tabel digulir atas-bawah dan kiri-kanan sendiri; baris tanggal dan kolom nama tetap terlihat.
          <div className="max-h-[calc(100vh-200px)] min-h-64 overflow-auto rounded-2xl border border-gray-200 bg-white select-none">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-48 border-b border-r border-gray-200 bg-white px-3 py-2 text-left font-semibold text-gray-500">
                    <T>Karyawan</T>
                  </th>
                  {dates.map((d) => {
                    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                    return (
                      <th key={d} className={`sticky top-0 z-10 min-w-10 border-b border-gray-200 bg-white px-1 py-1.5 text-center font-semibold ${wd === 0 ? "text-rose-500" : "text-gray-500"}`}>
                        <div className="text-[10px] font-medium"><T>{DAYS[wd]}</T></div>
                        <div>{Number(d.slice(8))}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id}>
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1.5">
                      <p className="truncate font-semibold text-gray-900">{row.name}</p>
                      <p className="truncate text-[10px] text-gray-400">{[row.employeeId, row.department].filter(Boolean).join(" · ")}</p>
                      {row.unscheduled > 0 && (
                        <span className="mt-0.5 inline-flex rounded-full bg-rose-50 px-1.5 py-px text-[10px] font-semibold text-rose-600"><T>Belum ada jadwal</T></span>
                      )}
                    </td>
                    {dates.map((d) => {
                      const c = cell(row, d);
                      const s = c.shift;
                      const fromPattern = s && !s.override && !s.manual;
                      return (
                        <td key={d} className="border-b border-gray-100 p-0.5">
                          <div
                            onMouseDown={(e) => { e.preventDefault(); setPainting(true); paint(row.id, d); }}
                            onMouseEnter={() => { if (painting) paint(row.id, d); }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); const v = e.dataTransfer.getData("text/plain"); if (v) paint(row.id, d, v); }}
                            title={isEmpty(row, d) ? t("Belum diisi") : s ? (s.holiday ?? (s.manual ? t("Belum diisi") : `${s.name}${s.startTime ? ` · ${s.startTime}–${s.endTime}` : ""}`)) : ""}
                            className={[
                              "flex h-8 min-w-9 cursor-pointer items-center justify-center rounded-md text-[11px] font-bold transition-transform hover:scale-105",
                              c.changed ? "ring-2 ring-amber-400" : "",
                              c.cleared ? "border border-dashed border-gray-300 text-gray-300" : "",
                              isEmpty(row, d) ? "border border-dashed border-amber-300 bg-amber-50/60" : "",
                            ].join(" ")}
                            style={s && !s.manual ? { background: fromPattern ? `${s.color}33` : s.color, color: fromPattern ? s.color : "#fff" } : undefined}
                          >
                            {c.cleared ? "–" : s && !s.manual ? s.code : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-emerald-500" /> <T>Diisi di Jadwal Bulanan</T></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-emerald-500/20" /> <T>Dari pola kerja</T></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-amber-300 bg-amber-50" /> <T>Belum diisi</T></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded ring-2 ring-amber-400" /> <T>Belum disimpan</T></span>
        </div>
    </div>
  );
}
