import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { DEFAULT_LANGUAGE } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/settings/ThemeProvider";
import { Shell } from "@/app/components/layout/Shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intrinsic – Deterministic Stock Analysis",
  description: "Intrinsic: Deterministic Stock Analysis Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = (DEFAULT_SETTINGS.general.language || DEFAULT_LANGUAGE) as typeof DEFAULT_LANGUAGE;
  return (
    <html lang={lang}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-navy-900`}
      >
        <ThemeProvider>
          <Shell>
            {children}
          </Shell>
        </ThemeProvider>
      </body>
    </html>
  );
}
