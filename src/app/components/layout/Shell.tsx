'use client';

import { useTranslation } from "@/lib/i18n/useTranslation";
import { WatchlistNavLink } from "@/app/components/WatchlistNavLink";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightLeft, Briefcase } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { isAuthBypassEnabledClient } from "@/lib/authMode";

export function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const authBypassEnabled = isAuthBypassEnabledClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (pathname?.startsWith('/sign-in') || pathname?.startsWith('/sign-up')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-navy-700 bg-navy-800">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="/branding/intrinsic-lockup.svg"
                alt="Intrinsic Logo"
                className="w-[300px] sm:w-[360px] h-auto transition-transform duration-150 group-hover:scale-[1.02]"
              />
              <span className="sr-only">Intrinsic Home</span>
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link
                href="/"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                {t("nav.dashboard")}
              </Link>
              <Link
                href="/strategy-lab"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                {t("nav.strategyLab")}
              </Link>
              <Link
                href="/compare"
                className="text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-4 h-4" />
                Run-Vergleich
              </Link>
              <Link
                href="/portfolio"
                className="text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
              >
                <Briefcase className="w-4 h-4" />
                Portfolio
              </Link>
              <WatchlistNavLink />
              <Link
                href="/settings"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                {t("nav.settings")}
              </Link>
              <Link
                href="/health"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                Datenqualität
              </Link>
              <Link
                href="/quality"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                Quality Observatory
              </Link>
              <Link
                href="/macro"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                Makro-Kontext
              </Link>
              {authBypassEnabled ? (
                <span className="text-[11px] text-accent-gold border border-accent-gold/40 px-2 py-1 rounded">
                  Auth Bypass (Dev)
                </span>
              ) : (
                <>
                  <SignedIn>
                    <div className="ml-2 flex items-center">
                      <UserButton afterSignOutUrl="/sign-in" />
                    </div>
                  </SignedIn>
                  <SignedOut>
                    <Link
                      href="/sign-in"
                      className="text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Anmelden
                    </Link>
                  </SignedOut>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>
          <main className="flex-1 max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-navy-700/50 bg-navy-800/30">
            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <p className="text-[10px] text-slate-600">
                {t("footer.disclaimer")}
              </p>
            </div>
          </footer>
        </div>
  );
}
