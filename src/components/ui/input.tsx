"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"
import { useT } from "@/components/i18n"
import { formatDate } from "@/lib/utils"

const INPUT_STYLE = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

// Tampilan bawaan isian tanggal mengikuti bahasa browser, jadi teksnya disembunyikan
// dan diganti tulisan dd-mmm-yyyy. Nilai yang dikirim tetap yyyy-mm-dd.
function DateInput({ className, value, defaultValue, onChange, onClick, ...props }: React.ComponentProps<"input">) {
  const [own, setOwn] = React.useState(String(defaultValue ?? ""))
  const shown = value === undefined ? own : String(value)
  return (
    <span className="relative block w-full">
      <InputPrimitive
        type="date"
        data-slot="input"
        className={cn(INPUT_STYLE, "cursor-pointer text-transparent", className)}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => { setOwn(e.target.value); onChange?.(e) }}
        onClick={(e) => {
          try { e.currentTarget.showPicker() } catch { /* peramban lama tetap bisa diketik */ }
          onClick?.(e)
        }}
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-base md:text-sm",
          !shown && "text-muted-foreground",
        )}
      >
        {shown ? formatDate(shown) : "dd-mmm-yyyy"}
      </span>
    </span>
  )
}

function Input({ className, type, placeholder, ...props }: React.ComponentProps<"input">) {
  const t = useT()
  if (type === "date") return <DateInput className={className} {...props} />
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
