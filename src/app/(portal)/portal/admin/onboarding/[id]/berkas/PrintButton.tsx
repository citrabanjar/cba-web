"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/components/i18n";

export default function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden h-9 gap-1.5 rounded-full px-4">
      <Printer size={14} /> <T>Cetak / Simpan PDF</T>
    </Button>
  );
}
