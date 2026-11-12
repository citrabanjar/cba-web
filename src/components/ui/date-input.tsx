"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"
import { cn } from "cn"
import { formatDate } from "@/lib/utils"

// Kolom tanggal seragam untuk seluruh portal.
// - Bisa DIKETIK: angka saja "29021980" → otomatis "29-02-1980"; juga menerima "29/02/1980", "29.02.1980", "29-Feb-1980".
// - Bisa DIPILIH dari kalender (ikon) — memakai kalender bawaan browser.
// - Hanya tanggal yang benar-benar ada (mis. 29-02 hanya di tahun kabisat, tahun 4 angka) yang dikirim; selain itu kolom
//   ditandai merah dan nilainya kosong. Saat tidak sedang diketik, tampilannya dd-mmm-yyyy (06-Nov-2026) seperti seluruh portal.
// Nilai yang dikirim tetap yyyy-mm-dd lewat <input type="date"> tersembunyi (name/required/min/max/onChange tetap bekerja,
// termasuk untuk form yang memakai FormData).

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
}
const isoToText = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ""
}
// Ketikan angka → DD-MM-YYYY bertahap.
const mask = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`
}
// Teks → yyyy-mm-dd bila tanggalnya sah; null bila belum lengkap / tidak ada.
function toIso(text: string, min?: string, max?: string): string | null {
  const t = text.trim()
  let dd: number, mm: number, yyyy: number
  const num = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/.exec(t)
  const named = /^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ](\d{4})$/.exec(t)
  if (num) { dd = +num[1]; mm = +num[2]; yyyy = +num[3] }
  else if (named) { dd = +named[1]; mm = MONTHS[named[2].slice(0, 3).toLowerCase()] ?? 0; yyyy = +named[3] }
  else return null
  if (yyyy < 1900 || yyyy > 2100 || mm < 1 || mm > 12) return null
  const d = new Date(Date.UTC(yyyy, mm - 1, dd))
  if (d.getUTCDate() !== dd || d.getUTCMonth() !== mm - 1) return null
  const iso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
  if ((min && iso < min) || (max && iso > max)) return null
  return iso
}

export function DateInput({ className, value, defaultValue, onChange, disabled, placeholder, min, max, id, ...props }: React.ComponentProps<"input">) {
  const native = React.useRef<HTMLInputElement>(null)
  const emitting = React.useRef(false) // perubahan dari ketikan (bukan dari kalender) → teks jangan ditimpa
  const controlled = value !== undefined
  const start = String((controlled ? value : defaultValue) ?? "")
  const [text, setText] = React.useState(isoToText(start))
  const [iso, setIso] = React.useState(start)
  const [focused, setFocused] = React.useState(false)
  // Nilai dari induk berubah (bukan karena ketikan di sini) → tampilkan ulang.
  const [seen, setSeen] = React.useState(start)
  if (controlled && String(value ?? "") !== seen) {
    const v = String(value ?? "")
    setSeen(v)
    if (v !== iso) { setIso(v); setText(isoToText(v)) }
  }

  // Kirim nilai ke <input type="date"> tersembunyi supaya onChange/FormData induk menerima yyyy-mm-dd.
  const emit = (next: string) => {
    setIso(next)
    const el = native.current
    if (!el) return
    emitting.current = true
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, next)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    emitting.current = false
  }
  const minS = typeof min === "string" ? min : undefined
  const maxS = typeof max === "string" ? max : undefined
  const typedIso = text ? toIso(text, minS, maxS) : ""
  // Merah bila 8 angka sudah lengkap tapi tanggalnya tidak ada, atau saat kolom ditinggalkan dengan isian yang belum sah.
  const invalid = text !== "" && !typedIso && (!focused || text.replace(/\D/g, "").length >= 8)

  const handleText = (raw: string) => {
    const next = /[A-Za-z]/.test(raw) ? raw.slice(0, 20) : mask(raw)
    setText(next)
    const parsed = next ? toIso(next, minS, maxS) : ""
    const out = parsed ?? ""
    if (out !== iso) emit(out)
  }

  return (
    <span className="relative block w-full">
      <span className="relative block">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        disabled={disabled}
        placeholder={placeholder && placeholder !== "dd-mmm-yyyy" ? placeholder : "DD-MM-YYYY"}
        aria-invalid={invalid || undefined}
        title={invalid ? "Tanggal tidak valid" : undefined}
        value={!focused && typedIso ? formatDate(typedIso) : text}
        onFocus={(e) => {
          setFocused(true)
          if (typedIso) setText(isoToText(typedIso))
          // Pilih seluruh isi supaya ketikan baru langsung mengganti tanggal lama.
          const el = e.currentTarget
          setTimeout(() => el.select(), 0)
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => handleText(e.target.value)}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-9 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
          invalid && "border-rose-500 ring-3 ring-rose-500/20 focus-visible:border-rose-500 focus-visible:ring-rose-500/30",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Pilih tanggal"
        onClick={() => { const el = native.current; if (!el) return; try { el.showPicker() } catch { el.focus() } }}
        className="absolute inset-y-0 right-1.5 my-auto flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
      >
        <CalendarDays size={15} />
      </button>
      </span>
      {invalid && <span className="mt-0.5 block text-[11px] font-medium text-rose-600">Tanggal tidak valid (DD-MM-YYYY)</span>}
      {/* Pembawa nilai yyyy-mm-dd + kalender bawaan browser (tidak terlihat). */}
      <input
        ref={native}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        min={min}
        max={max}
        {...(controlled ? { value: iso } : { defaultValue: start })}
        onChange={(e) => {
          const v = e.target.value
          setIso(v)
          if (!emitting.current) setText(isoToText(v)) // dipilih dari kalender
          onChange?.(e)
        }}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-full opacity-0"
        {...props}
      />
    </span>
  )
}
