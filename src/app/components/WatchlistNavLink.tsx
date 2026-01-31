'use client';

import Link from 'next/link';
import { useWatchlist } from '@/lib/watchlist/useWatchlist';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function WatchlistNavLink() {
  const { count } = useWatchlist();
  const { t } = useTranslation();

  return (
    <Link
      href="/watchlist"
      className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
    >
      {t('nav.watchlist') || 'Watchlist'}
      {count > 0 && (
        <span className="px-2 py-0.5 text-xs bg-accent-blue text-white rounded-full leading-none">
          {count}
        </span>
      )}
    </Link>
  );
}
