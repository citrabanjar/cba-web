"use client";

import { useEffect, useState, useTransition } from "react";
import { MapPin, LogIn, LogOut, Loader2, AlertTriangle, CheckCircle2, Navigation, XCircle, Plane } from "lucide-react";
import { checkIn, checkOut } from "./actions";
import type { Attendance } from "@prisma/client";
import { T } from "@/components/i18n";
import { nearestLocation, type AllowedLocation } from "@/lib/work-location-client";
import AbsenMap from "./AbsenMap";

interface Props {
  today: Attendance | null;
  week: Attendance[];
  locations: AllowedLocation[];
  onTrip: boolean;
}

function getDurationStr(checkIn: Date, checkOut?: Date | null) {
  const end = checkOut ? new Date(checkOut) : new Date();
  const diff = Math.floor((end.getTime() - new Date(checkIn).getTime()) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}j ${m}m`;
}

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Halaman absen: status lokasi + peta kecil (Google Maps) dengan lingkaran radius area absen dan
// posisi karyawan, plus peringatan radius. Pengecekan tetap dilakukan server.
export default function AbsensiClient({ today, week, locations, onTrip }: Props) {
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(
    typeof navigator !== "undefined" && !navigator.geolocation ? "Browser tidak mendukung GPS." : null,
  );
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Pantau posisi GPS selama halaman terbuka.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
        setGpsError(null);
      },
      () => setGpsError("Izinkan akses lokasi untuk absensi GPS."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const best = pos ? nearestLocation(locations, pos.lat, pos.lng) : null;
  const near = best
    ? { name: best.location.name, distance: Math.round(best.distance), radius: best.location.radius, inside: best.inside }
    : null;

  const handleCheckIn = () => {
    if (!pos) return setMessage({ type: "err", text: "GPS belum siap. Tunggu sebentar." });
    setMessage(null);
    startTransition(async () => {
      const res = await checkIn(pos.lat, pos.lng);
      if ("error" in res) {
        setMessage({ type: "err", text: res.error ?? "" });
      } else {
        setMessage({
          type: "ok",
          text: res.location === "Dinas Luar"
            ? "Check-in berhasil (Dinas Luar). Lokasi Anda tersimpan."
            : res.location
              ? `Check-in berhasil di ${res.location} (${res.distance ?? 0} m). ✓`
              : "Check-in berhasil! ✓",
        });
      }
    });
  };

  const handleCheckOut = () => {
    if (!pos) return setMessage({ type: "err", text: "GPS belum siap." });
    setMessage(null);
    startTransition(async () => {
      const res = await checkOut(pos.lat, pos.lng);
      if ("error" in res) {
        setMessage({ type: "err", text: res.error ?? "" });
      } else {
        setMessage({ type: "ok", text: "Check-out berhasil! Sampai jumpa besok." });
      }
    });
  };

  // Tombol absen hanya aktif di dalam radius, kecuali saat Dinas Luar atau belum ada lokasi.
  const canAbsen = onTrip || locations.length === 0 || !!near?.inside;
  const hasCheckIn = !!today?.checkIn;
  const hasCheckOut = !!today?.checkOut;

  // Kartu status lokasi pengganti peta.
  const status = gpsError
    ? { tone: "bg-red-50 border-red-200 text-red-700", icon: AlertTriangle, title: gpsError, sub: "Aktifkan GPS dan izinkan akses lokasi di browser." }
    : !pos
      ? { tone: "bg-gray-50 border-gray-200 text-gray-600", icon: Loader2, title: "Mendeteksi lokasi GPS...", sub: "Pastikan GPS HP menyala." }
      : onTrip
        ? { tone: "bg-sky-50 border-sky-200 text-sky-700", icon: Plane, title: "Dinas Luar", sub: "Absen boleh di mana saja, lokasi Anda tetap disimpan." }
        : near?.inside
          ? { tone: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: CheckCircle2, title: `Anda di ${near.name}`, sub: `${near.distance} m dari titik lokasi, dalam area. Silakan absen.` }
          : near
            ? { tone: "bg-red-50 border-red-200 text-red-700", icon: XCircle, title: "Di luar area absen", sub: `${near.distance} m dari ${near.name} (radius ${near.radius} m). Absen tidak bisa dilakukan.` }
            : { tone: "bg-gray-50 border-gray-200 text-gray-600", icon: Navigation, title: "Lokasi GPS terbaca.", sub: "" };

  return (
    <div className="flex flex-col h-full">
      <div className="m-4 rounded-2xl border border-gray-200 bg-white p-4 space-y-4 overflow-y-auto">
        {/* Status lokasi */}
        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${status.tone}`}>
          <status.icon size={26} className={`mt-0.5 shrink-0 ${status.icon === Loader2 ? "animate-spin" : ""}`} />
          <div className="min-w-0">
            <p className="font-bold"><T>{status.title}</T></p>
            {status.sub && <p className="mt-0.5 text-sm opacity-90"><T>{status.sub}</T></p>}
            {pos && <p className="mt-1 text-[11px] opacity-70"><T>Akurasi GPS</T> ±{pos.accuracy} m</p>}
          </div>
        </div>

        {/* Peringatan radius */}
        {pos && !onTrip && near?.inside && near.distance > near.radius * 0.8 && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span><T>Anda hampir keluar area absen</T> ({near.distance} / {near.radius} m). <T>Mendekatlah ke titik lokasi supaya absen tidak ditolak.</T></span>
          </div>
        )}
        {pos && !onTrip && near && pos.accuracy > near.radius && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span><T>Sinyal GPS lemah</T> (±{pos.accuracy} m). <T>Pindah ke tempat terbuka atau tunggu beberapa detik supaya lokasinya lebih tepat.</T></span>
          </div>
        )}

        {/* Peta area absen */}
        {(locations.length > 0 || pos) && <AbsenMap locations={locations} pos={pos} inside={onTrip || locations.length === 0 ? null : near?.inside ?? null} />}

        {/* Pesan hasil */}
        {message && (
          <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${
            message.type === "ok" ? "bg-green-50 text-green-700" :
            message.type === "warn" ? "bg-amber-50 text-amber-700" :
            "bg-red-50 text-red-700"
          }`}>
            {message.type === "ok" ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> :
             <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
            <T>{message.text}</T>
          </div>
        )}

        {/* Status hari ini */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide"><T>Status Hari Ini</T></p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                <LogIn size={12} /> <T>Check-in</T>
              </p>
              <p className={`font-bold text-sm ${hasCheckIn ? "text-green-600" : "text-gray-300"}`}>
                {hasCheckIn ? new Date(today!.checkIn!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                <LogOut size={12} /> <T>Check-out</T>
              </p>
              <p className={`font-bold text-sm ${hasCheckOut ? "text-blue-600" : "text-gray-300"}`}>
                {hasCheckOut ? new Date(today!.checkOut!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
          </div>
          {hasCheckIn && (
            <div className="text-center border-t border-gray-200 pt-2">
              <p className="text-xs text-gray-400"><T>Durasi kerja</T></p>
              <p className="font-semibold text-ink text-sm mt-0.5">
                {getDurationStr(today!.checkIn!, today?.checkOut)}
                {!hasCheckOut && <span className="text-xs text-green-500 ml-1"><T>(sedang berjalan)</T></span>}
              </p>
            </div>
          )}
          {hasCheckIn && today?.checkInAddr && (
            <p className="text-xs text-gray-400 flex items-start gap-1">
              <MapPin size={11} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{today.checkInAddr}</span>
            </p>
          )}
        </div>

        {/* Tombol aksi */}
        {!hasCheckIn ? (
          <button
            onClick={handleCheckIn}
            disabled={isPending || !pos || !canAbsen}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {isPending ? <T>{"Memproses..."}</T> : <T>{"Check-in Sekarang"}</T>}
          </button>
        ) : !hasCheckOut ? (
          <button
            onClick={handleCheckOut}
            disabled={isPending || !pos || !canAbsen}
            className="w-full bg-ink text-white font-semibold py-3 rounded-xl hover:bg-brand transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            {isPending ? <T>{"Memproses..."}</T> : <T>{"Check-out Sekarang"}</T>}
          </button>
        ) : (
          <div className="bg-gray-100 text-gray-700 text-sm text-center py-3 rounded-xl font-medium">
            <T>✓ Absensi hari ini selesai</T>
          </div>
        )}

        {/* Rekap minggu ini */}
        {week.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><T>Minggu Ini</T></p>
            <div className="space-y-2">
              {week.map((rec) => {
                const d = new Date(rec.date);
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div key={rec.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isToday ? "bg-blue-50 border border-blue-100" : "bg-gray-50"}`}>
                    <div className="text-center w-8 shrink-0">
                      <p className="text-xs text-gray-400">{DAY_NAMES[d.getDay()]}</p>
                      <p className="text-sm font-bold text-gray-700">{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">
                        {rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                        {" → "}
                        {rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      rec.status === "HADIR" ? "bg-green-100 text-green-700" :
                      rec.status === "CUTI" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {rec.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
