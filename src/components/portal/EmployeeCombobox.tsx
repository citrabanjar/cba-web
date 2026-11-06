"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export type ComboboxOption = { value: string; label: string };

// Daftar ikut alur halaman di bawah isian, jadi selalu membuka ke bawah dan tidak
// terpotong oleh dialog. Pencarian mencocokkan ID maupun nama.
export default function EmployeeCombobox({
  id, value, options, onChange,
}: {
  id: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const query = value.trim().toLowerCase();
  const matches = options
    .filter((o) => o.value.toLowerCase().includes(query) || o.label.toLowerCase().includes(query))
    .slice(0, 30);

  function choose(option: ComboboxOption) {
    onChange(option.value);
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
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
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
              <span className="font-mono text-xs text-gray-500 w-14 shrink-0">{option.value}</span>
              <span className="text-gray-800 truncate">{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
