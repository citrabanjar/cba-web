import type { Metadata } from "next";

export const metadata: Metadata = { title: "Onboarding Calon Karyawan" };

// Halaman calon karyawan: di luar portal, tanpa login portal (masuk dengan OTP).
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="portal-theme flex min-h-screen flex-col">{children}</div>;
}
