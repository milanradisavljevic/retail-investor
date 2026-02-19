import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { DEFAULT_LANGUAGE } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/settings/ThemeProvider";
import { Shell } from "@/app/components/layout/Shell";
import { PWARegister } from "@/app/components/PWARegister";
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { isAuthBypassEnabledServer } from "@/lib/authMode";

export const metadata: Metadata = {
  title: "INTRINSIC — Deterministic Stock Analysis",
  description: "Transparente Aktienanalyse mit 4-Pillar Scoring für evidenzbasierte Investitionsentscheidungen",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "INTRINSIC",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1219",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = (DEFAULT_SETTINGS.general.language || DEFAULT_LANGUAGE) as typeof DEFAULT_LANGUAGE;
  const authBypassEnabled = isAuthBypassEnabledServer();

  const appTree = (
    <html lang={lang}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased bg-navy-900">
        <ThemeProvider>
          <PWARegister />
          <Shell>
            {children}
          </Shell>
        </ThemeProvider>
      </body>
    </html>
  );

  if (authBypassEnabled) {
    return appTree;
  }

  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      {appTree}
    </ClerkProvider>
  );
}
