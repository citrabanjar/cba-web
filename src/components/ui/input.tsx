"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"
import { useT } from "@/components/i18n"
import { DateInput } from "@/components/ui/date-input"

const INPUT_STYLE = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

// Kolom angka (type="number"): kolom ketik biasa tanpa panah naik-turun. Hanya angka (koma dibaca titik desimal),
// nol di depan dibuang ("012" → "12"), dan isi terseleksi saat diklik supaya langsung bisa ditimpa.
function cleanNumber(raw: string, allowNegative: boolean) {
  let s = raw.replace(/,/g, ".").replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, "")
  if (allowNegative) s = (s.startsWith("-") ? "-" : "") + s.replace(/-/g, "")
  const neg = s.startsWith("-")
  let body = neg ? s.slice(1) : s
  const dot = body.indexOf(".")
  if (dot >= 0) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, "")
  body = body.replace(/^0+(?=\d)/, "")
  return (neg ? "-" : "") + body
}

// Ketikan disimpan sementara selama kolom aktif, supaya "0," atau kolom kosong tidak langsung ditimpa nilai angka
// dari pemanggil (mis. Number("0.") = 0). Setelah kolom ditinggalkan, tampilan kembali mengikuti nilainya.
function NumberInput({ className, value, onChange, onFocus, onBlur, min, ...rest }: React.ComponentProps<"input">) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const allowNegative = min === undefined || Number(min) < 0
  const shown = draft ?? (value === undefined || value === null || (typeof value === "number" && Number.isNaN(value)) ? "" : String(value))
  return (
    <InputPrimitive
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-slot="input"
      className={cn(INPUT_STYLE, className)}
      {...rest}
      value={shown}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const v = cleanNumber(e.target.value, allowNegative)
        if (v !== e.target.value) e.target.value = v
        setDraft(v)
        onChange?.(e)
      }}
      onFocus={(e: React.FocusEvent<HTMLInputElement>) => { e.target.select(); onFocus?.(e) }}
      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setDraft(null); onBlur?.(e) }}
    />
  )
}

function Input({ className, type, placeholder, ...props }: React.ComponentProps<"input">) {
  const t = useT()
  // Semua kolom tanggal memakai DateInput: bisa diketik DD-MM-YYYY atau dipilih dari kalender.
  if (type === "date") return <DateInput className={className} placeholder={placeholder} {...props} />
  if (type === "number") return <NumberInput className={className} placeholder={placeholder === undefined ? undefined : t(placeholder)} {...props} />
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(INPUT_STYLE, className)}
      {...props}
      placeholder={placeholder === undefined ? undefined : t(placeholder)}
    />
  )
}

export { Input }
