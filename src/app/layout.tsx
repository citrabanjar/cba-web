import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "PT. Citra Banjar Abadi",
    template: "%s | PT. Citra Banjar Abadi",
  },
  description: "Website resmi dan portal karyawan PT. Citra Banjar Abadi",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} h-full scroll-smooth`}>
      <body className="min-h-full flex flex-col antialiased bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
