"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, LogIn, LogOut, MapPin } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import type { DayShift } from "@/lib/schedule";
import { dayPenalty } from "@/lib/attendance-penalty";
import AttendanceEditor from "./AttendanceEditor";

type Attendance = {
  id: string; date: Date; checkIn: Date | null; checkOut: Date | null;
  checkInAddr: string | null; status: string; note: string | null;
};
type Range = { id: string; startDate: Date; endDate: Date; status: string };
type Leave = Range & { type: string; reason: string };
type Trip = Range & { destination: string };

// Warna tiap status, dipakai di kotak tanggal, keterangan, dan ringkasan.
const STATUS: Record<string, { label: string; cell: string; dot: string }> = {
  HADIR: { label: "Hadir", cell: "bg-emerald-50 border-emerald-200 text-emerald-800", dot: "bg-emerald-500" },
  IZIN: { label: "Izin", cell: "bg-blue-50 border-blue-200 text-blue-800", dot: "bg-blue-500" },
  SAKIT: { label: "Sakit", cell: "bg-amber-50 border-amber-200 text-amber-800", dot: "bg-amber-500" },
  ALPHA: { label: "Alpha", cell: "bg-rose-50 border-rose-200 text-rose-800", dot: "bg-rose-500" },
  CUTI: { label: "Cuti", cell: "bg-purple-50 border-purple-200 text-purple-800", dot: "bg-purple-500" },
  DINAS: { label: "Dinas", cell: "bg-sky-50 border-sky-200 text-sky-800", dot: "bg-sky-500" },
};
const ORDER = ["HADIR", "IZIN", "SAKIT", "ALPHA", "CUTI", "DINAS"];
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Tanggal @db.Date tersimpan tengah malam UTC, jadi kuncinya diambil dari bagian UTC.
const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
const keyOf = (y: number, m: number, day: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function fmtTime(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

// Hari yang tercakup cuti/dinas yang sudah disetujui.
function coveredDays(ranges: Range[], status: string, map: Map<string, string>) {
  for (const r of ranges) {
    if (r.status !== "APPROVED") continue;
    const day = new Date(dayKey(r.startDate));
    const end = new Date(dayKey(r.endDate));
    while (day <= end) {
      const k = day.toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, status);
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
}

export default function AttendanceCalendar({
  attendances, leaves, trips, shiftDays = {}, side, editUserId,
}: {
  attendances: Attendance[]; leaves: Leave[]; trips: Trip[]; shiftDays?: Record<string, DayShift>;
  editUserId?: string; // Super Admin (masa testing): boleh ubah/tambah absen sampai hari ini
  side?: React.ReactNode; // kartu tambahan di kolom kanan (mis. Jadwal Kerja)
}) {
  const t = useT();
  // Hari ini menurut waktu Jakarta (UTC+7), dihitung sekali saat kalender dibuka.
  const [nowJakarta] = useState(() => new Date(Date.now() + 7 * 3600_000));
  const todayKey = nowJakarta.toISOString().slice(0, 10);
  const [month, setMonth] = useState({ y: nowJakarta.getUTCFullYear(), m: nowJakarta.getUTCMonth() });
  const [selected, setSelected] = useState<string | null>(todayKey);

  const byDay = useMemo(() => new Map(attendances.map((a) => [dayKey(a.date), a])), [attendances]);
  const planned = useMemo(() => {
    const map = new Map<string, string>();
    coveredDays(leaves, "CUTI", map);
    coveredDays(trips, "DINAS", map);
    return map;
  }, [leaves, trips]);

  const statusOf = (k: string) => byDay.get(k)?.status ?? planned.get(k) ?? null;
  // Terlambat / pulang cepat dari jam absen vs shift; "tidak absen pulang" untuk hari yang sudah lewat.
  const penaltyOf = (k: string) => {
    const a = byDay.get(k);
    return a?.checkIn ? dayPenalty(shiftDays[k], k, new Date(a.checkIn), a.checkOut ? new Date(a.checkOut) : null) : null;
  };
  const noCheckOut = (k: string) => { const a = byDay.get(k); return !!a?.checkIn && !a.checkOut && k < todayKey; };

  // Kotak kalender dimulai hari Senin.
  const first = new Date(Date.UTC(month.y, month.m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const counts: Record<string, number> = {};
  const kondite = { late: 0, lateMinutes: 0, early: 0, earlyHours: 0, noOut: 0 };
  for (let d = 1; d <= daysInMonth; d++) {
    const k = keyOf(month.y, month.m, d);
    const s = statusOf(k);
    if (s) counts[s] = (counts[s] ?? 0) + 1;
    const p = penaltyOf(k);
    if (p?.late) { kondite.late++; kondite.lateMinutes += p.lateMinutes; }
    if (p && p.earlyHours > 0) { kondite.early++; kondite.earlyHours += p.earlyHours; }
    if (noCheckOut(k)) kondite.noOut++;
  }

  function shift(step: number) {
    setMonth(({ y, m }) => {
      const next = new Date(Date.UTC(y, m + step, 1));
      return { y: next.getUTCFullYear(), m: next.getUTCMonth() };
    });
    setSelected(null);
  }

  const sel = selected ? byDay.get(selected) : undefined;
  const selPlanned = selected ? planned.get(selected) : undefined;
  const selLeave = selected && selPlanned === "CUTI"
    ? leaves.find((l) => l.status === "APPROVED" && dayKey(l.startDate) <= selected && selected <= dayKey(l.endDate))
    : undefined;
  const selTrip = selected && selPlanned === "DINAS"
    ? trips.find((r) => r.status === "APPROVED" && dayKey(r.startDate) <= selected && selected <= dayKey(r.endDate))
    : undefined;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="section-head flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="section-icon"><CalendarDays size={17} /></span>
            <h3 className="font-semibold text-[15px]"><T>Kalender Kehadiran</T></h3>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => shift(-1)} aria-label={t("Bulan sebelumnya")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-32 text-center text-sm font-semibold text-gray-800">
              <T>{MONTHS[month.m]}</T> {month.y}
            </span>
            <button type="button" onClick={() => shift(1)} aria-label={t("Bulan berikutnya")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100">
              <ChevronRight size={16} />
            </button>
            <button type="button"
              onClick={() => { setMonth({ y: nowJakarta.getUTCFullYear(), m: nowJakarta.getUTCMonth() }); setSelected(todayKey); }}
              className="h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/85">
              <T>Hari ini</T>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DAYS.map((d, i) => (
              <div key={d} className={`pb-1 text-center text-[11px] font-semibold uppercase tracking-wider ${i === 6 ? "text-rose-400" : "text-gray-400"}`}>
                <T>{d}</T>
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`x${i}`} />;
              const k = keyOf(month.y, month.m, day);
              const a = byDay.get(k);
              const s = statusOf(k);
              const style = s ? STATUS[s] : null;
              const sunday = i % 7 === 6;
              const isToday = k === todayKey;
              const isSel = k === selected;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(k)}
                  className={[
                    "flex min-h-16 flex-col items-start rounded-xl border p-1.5 text-left transition-shadow sm:min-h-20 sm:p-2",
                    style ? style.cell : sunday ? "border-rose-100 bg-rose-50/40 text-rose-400" : "border-gray-100 bg-gray-50/60 text-gray-700",
                    isSel ? "ring-2 ring-ink ring-offset-1" : "hover:shadow-md",
                  ].join(" ")}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-brand text-white" : ""}`}>
                      {day}
                    </span>
                    {shiftDays[k]?.manual ? (
                      <span title={t("Belum diisi")} className="h-4 w-5 rounded-md border border-dashed border-amber-300 bg-amber-50" />
                    ) : shiftDays[k] && (
                      <span title={shiftDays[k].holiday ?? shiftDays[k].name}
                        className="rounded-md px-1 py-px text-[9px] font-bold leading-tight text-white sm:text-[10px]"
                        style={{ background: shiftDays[k].color }}>
                        {shiftDays[k].code}
                      </span>
                    )}
                  </span>
                  {style && (
                    <span className="mt-auto w-full truncate text-[10px] font-semibold sm:text-[11px]">
                      <T>{style.label}</T>
                    </span>
                  )}
                  {a?.checkIn && (
                    <span className="hidden w-full truncate text-[10px] tabular-nums opacity-80 sm:block">
                      {fmtTime(a.checkIn)}–{fmtTime(a.checkOut)}
                    </span>
                  )}
                  {(() => {
                    const p = penaltyOf(k);
                    const tags = [
                      p?.late && { label: `${t("Telat")} ${p.lateMinutes}m`, tone: "bg-orange-100 text-orange-700" },
                      p && p.earlyHours > 0 && { label: t("Pulang cepat"), tone: "bg-yellow-100 text-yellow-800" },
                      noCheckOut(k) && { label: t("Tdk absen pulang"), tone: "bg-gray-200 text-gray-700" },
                    ].filter(Boolean) as { label: string; tone: string }[];
                    return tags.length > 0 && (
                      <span className="mt-0.5 flex w-full flex-wrap gap-0.5">
                        {tags.map((g) => <span key={g.label} className={`truncate rounded px-1 text-[9px] font-semibold leading-4 ${g.tone}`}>{g.label}</span>)}
                      </span>
                    );
                  })()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS[s].dot}`} />
                <T>{STATUS[s].label}</T>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-5">
        {/* Ringkasan bulan yang sedang dilihat */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            <T>Ringkasan</T> <T>{MONTHS[month.m]}</T>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {ORDER.map((s) => (
              <div key={s} className={`rounded-xl border px-2 py-2.5 text-center ${STATUS[s].cell}`}>
                <p className="text-lg font-bold leading-none">{counts[s] ?? 0}</p>
                <p className="mt-1 text-[11px] font-medium"><T>{STATUS[s].label}</T></p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400"><T>Kondite</T></p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-2 py-2.5 text-center text-orange-800">
              <p className="text-lg font-bold leading-none">{kondite.late}</p>
              <p className="mt-1 text-[11px] font-medium"><T>Terlambat</T></p>
              {kondite.lateMinutes > 0 && <p className="text-[10px] opacity-75">{kondite.lateMinutes} <T>menit</T></p>}
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-2 py-2.5 text-center text-yellow-800">
              <p className="text-lg font-bold leading-none">{kondite.early}</p>
              <p className="mt-1 text-[11px] font-medium"><T>Pulang cepat</T></p>
              {kondite.earlyHours > 0 && <p className="text-[10px] opacity-75">{kondite.earlyHours.toLocaleString("id-ID")} <T>jam</T></p>}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-2.5 text-center text-gray-700">
              <p className="text-lg font-bold leading-none">{kondite.noOut}</p>
              <p className="mt-1 text-[11px] font-medium"><T>Tdk absen pulang</T></p>
            </div>
          </div>
        </section>

        {/* Rincian tanggal yang dipilih */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400"><T>Rincian</T></p>
          {!selected ? (
            <p className="mt-3 text-sm text-gray-400"><T>Pilih tanggal di kalender.</T></p>
          ) : (
            <>
              <p className="mt-2 text-base font-bold text-gray-900">{formatDate(new Date(selected))}</p>
              {shiftDays[selected] && (
                <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                  {shiftDays[selected].manual ? (
                    <span className="h-5 w-7 rounded-md border border-dashed border-amber-300 bg-amber-50" />
                  ) : (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: shiftDays[selected].color }}>
                      {shiftDays[selected].code}
                    </span>
                  )}
                  {shiftDays[selected].holiday
                    ? shiftDays[selected].holiday
                    : shiftDays[selected].manual
                      ? <T>Shift belum diisi</T>
                      : <>{shiftDays[selected].name}{shiftDays[selected].startTime && ` · ${shiftDays[selected].startTime}–${shiftDays[selected].endTime}`}</>}
                </p>
              )}
              {sel ? (
                <div className="mt-3 space-y-2.5 text-sm">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS[sel.status]?.cell ?? ""}`}>
                    <T>{STATUS[sel.status]?.label ?? sel.status}</T>
                  </span>
                  <p className="flex items-center gap-2 text-gray-700"><LogIn size={15} className="text-gray-400" /> <T>Masuk</T>: <b className="tabular-nums">{fmtTime(sel.checkIn)}</b></p>
                  <p className="flex items-center gap-2 text-gray-700"><LogOut size={15} className="text-gray-400" /> <T>Pulang</T>: <b className="tabular-nums">{fmtTime(sel.checkOut)}</b></p>
                  {(() => {
                    const p = penaltyOf(selected);
                    return (
                      <>
                        {p?.late && (
                          <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
                            <T>Terlambat</T> {p.lateMinutes} <T>menit</T>
                            {p.lateHours > 0 ? <> · <T>dipotong</T> {p.lateHours.toLocaleString("id-ID")} <T>jam</T></> : <> · <T>tidak dipotong (≤ 30 menit)</T></>}
                          </p>
                        )}
                        {p && p.earlyHours > 0 && (
                          <p className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800"><T>Pulang cepat</T> · <T>dipotong</T> {p.earlyHours.toLocaleString("id-ID")} <T>jam</T></p>
                        )}
                        {noCheckOut(selected) && <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700"><T>Tidak absen pulang.</T></p>}
                      </>
                    );
                  })()}
                  {sel.checkInAddr && (
                    <p className="flex items-start gap-2 text-xs text-gray-500"><MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" /> {sel.checkInAddr}</p>
                  )}
                  {sel.note && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{sel.note}</p>}
                </div>
              ) : selLeave ? (
                <div className="mt-3 space-y-1.5 text-sm text-gray-700">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS.CUTI.cell}`}><T>Cuti</T></span>
                  <p className="text-xs text-gray-500">{formatDate(selLeave.startDate)} – {formatDate(selLeave.endDate)}</p>
                  <p className="text-xs text-gray-600">{selLeave.reason}</p>
                </div>
              ) : selTrip ? (
                <div className="mt-3 space-y-1.5 text-sm text-gray-700">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS.DINAS.cell}`}><T>Dinas</T></span>
                  <p className="text-xs text-gray-500">{formatDate(selTrip.startDate)} – {formatDate(selTrip.endDate)}</p>
                  <p className="text-xs text-gray-600">{selTrip.destination}</p>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-400"><Clock size={15} /> <T>Belum ada catatan kehadiran.</T></p>
              )}
              {editUserId && selected <= todayKey && (
                <AttendanceEditor key={`${selected}-${sel?.checkIn ?? ""}-${sel?.checkOut ?? ""}-${sel?.status ?? ""}`} userId={editUserId} date={selected}
                  current={sel ? { checkIn: sel.checkIn, checkOut: sel.checkOut, status: sel.status, note: sel.note } : undefined} />
              )}
            </>
          )}
        </section>

        {side}
      </div>
    </div>
  );
}
