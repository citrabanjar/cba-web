"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export type ComboboxOption = { value: string; label: string };

// Daftar ikut alur halaman di bawah isian, jadi selalu membuka ke bawah dan tidak
// terpotong oleh dialog. Pencarian mencocokkan nilai maupun nama, dan isian tetap
// boleh berisi teks di luar daftar. Nilai yang cocok dengan pilihan bernama tampil
// "ID - Nama" (nilai yang dikirim tetap ID-nya saja).
export default function EmployeeCombobox({
  id, value, options, onChange, onPick, placeholder, className,
}: {
  id: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  onPick?: (option: ComboboxOption) => void; // dipilih dari daftar (klik / Enter); isian tetap teks pencarian
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Pilihan yang sudah dipilih (atau diketik persis) tampil lengkap dengan namanya.
  const chosen = options.find((o) => o.label && o.value === value);
  const display = chosen ? `${chosen.value} - ${chosen.label}` : value;
  // Mengetik di atas isian lengkap: hapus = kosongkan, ketik = mulai cari dari huruf baru.
  function edit(e: React.ChangeEvent<HTMLInputElement>) {
    let text = e.target.value;
    if (chosen) {
      const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith("delete");
      text = deleting ? "" : text.startsWith(display) ? text.slice(display.length) : text;
    }
    onChange(text); setOpen(true); setActive(0);
  }

  const query = value.trim().toLowerCase();
  // Isian yang sudah cocok dengan satu pilihan tetap menampilkan seluruh daftar.
  const picked = options.some((o) => o.value.toLowerCase() === query);
  // ID yang cocok persis selalu di urutan pertama, supaya Enter memilih yang diketik.
  const exact = (o: ComboboxOption) => (o.value.toLowerCase() === query ? 0 : 1);
  const matches = options
    .filter((o) => picked || o.value.toLowerCase().includes(query) || o.label.toLowerCase().includes(query))
    .sort((x, y) => exact(x) - exact(y))
    .slice(0, 30);

  function choose(option: ComboboxOption) {
    if (onPick) onPick(option); else onChange(option.value);
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const listId = `${id}-options`;

  return (
    <div>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
        value={display}
        onChange={edit}
        onFocus={(e) => { setOpen(true); if (chosen) e.target.select(); }}
        // Dialog memfokuskan isian pertama saat dibuka, jadi klik juga harus membuka daftar.
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKey}
      />
      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          {matches.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={index === active}
              // Pakai mousedown supaya pilihan masuk sebelum isian kehilangan fokus.
              onMouseDown={(e) => { e.preventDefault(); choose(option); }}
              onMouseEnter={() => setActive(index)}
              className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${
                index === active ? "bg-gray-100" : ""
              }`}
            >
              {option.label ? (
                <>
                  <span className="font-mono text-xs text-gray-500 w-14 shrink-0">{option.value}</span>
                  <span className="text-gray-800 truncate">{option.label}</span>
                </>
              ) : (
                <span className="text-gray-800 truncate">{option.value}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
