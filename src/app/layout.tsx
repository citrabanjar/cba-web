import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { LangProvider } from "@/components/i18n";
import { LANG_COOKIE, toLang } from "@/lib/i18n";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "PT. Citra Banjar Abadi",
    template: "%s | PT. Citra Banjar Abadi",
  },
  description: "Website resmi dan portal karyawan PT. Citra Banjar Abadi",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = toLang((await cookies()).get(LANG_COOKIE)?.value);

  return (
    <html lang={lang} className={cn("h-full", "scroll-smooth", inter.variable, "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col antialiased bg-white text-gray-900">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
