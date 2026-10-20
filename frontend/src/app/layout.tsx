import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "PharmaWMS", template: "%s · PharmaWMS" },
  description: "Hệ thống quản lý kho thuốc tây kết hợp AI dự báo nhu cầu nhập thuốc",
};

export const viewport: Viewport = {
  themeColor: "#0f6b5e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
