"use client";

import dynamic from "next/dynamic";
import type { Attendance } from "@prisma/client";
import { Loader2 } from "lucide-react";

const AbsensiClient = dynamic(() => import("./AbsensiClient"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="animate-spin text-ink" size={32} />
    </div>
  ),
});

interface Props {
  today: Attendance | null;
  week: Attendance[];
}

export default function AbsensiWrapper({ today, week }: Props) {
  return <AbsensiClient today={today} week={week} />;
}
