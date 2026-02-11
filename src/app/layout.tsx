import type { Metadata } from "next";
import "./globals.css";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { DEFAULT_LANGUAGE } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/settings/ThemeProvider";
import { Shell } from "@/app/components/layout/Shell";

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
      <body className="antialiased bg-navy-900">
        <ThemeProvider>
          <Shell>
            {children}
          </Shell>
        </ThemeProvider>
      </body>
    </html>
  );
}
