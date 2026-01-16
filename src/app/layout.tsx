import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Privatinvestor MVP",
  description: "Deterministic Stock Analysis Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-navy-900`}
      >
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-navy-700 bg-navy-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <h1 className="text-xl font-semibold text-text-primary">
                    Privatinvestor
                  </h1>
                </div>
                <nav className="flex gap-6 text-sm">
                  <a
                    href="/"
                    className="text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Latest Briefing
                  </a>
                  <a
                    href="/history"
                    className="text-text-secondary hover:text-text-primary transition-colors"
                  >
                    History
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-navy-700 bg-navy-800/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <p className="text-xs text-text-muted">
                This application is for informational purposes only and does not
                constitute investment advice. Past performance does not guarantee
                future results. Always conduct your own research before making
                investment decisions.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
