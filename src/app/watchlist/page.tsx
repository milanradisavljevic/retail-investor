'use client';

import Link from 'next/link';
import { useWatchlist } from '@/lib/watchlist/useWatchlist';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function WatchlistPage() {
  const { t } = useTranslation();
  const { watchlist, isLoading, removeFromWatchlist, clearWatchlist } = useWatchlist();

  if (isLoading) {
    return <div className="text-text-secondary">{t('watchlist.loading')}</div>;
  }

  if (watchlist.length === 0) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">{t('watchlist.pageTitle')}</h1>
            <p className="text-text-muted mt-2">{t('watchlist.emptyTitle')}</p>
          </div>
        </header>
        <div className="rounded-lg border border-navy-700 bg-navy-800 p-6 text-center space-y-4">
          <p className="text-text-secondary">
            {t('watchlist.emptySubtitle')}
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors"
          >
            {t('watchlist.goToBriefing')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">{t('watchlist.pageTitle')}</h1>
          <p className="text-text-muted mt-2">
            {t('watchlist.watchedStocks')
               .replace('{count}', watchlist.length.toString())
               .replace('{singularPlural}', watchlist.length === 1 ? t('watchlist.stock') : t('watchlist.stocks'))}
          </p>
        </div>
        <button
          onClick={clearWatchlist}
          className="px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-700 rounded-lg transition-colors"
        >
          {t('watchlist.clearAll')}
        </button>
      </header>

      <div className="grid gap-4">
        {watchlist.map((stock) => (
          <div
            key={stock.symbol}
            className="p-5 rounded-lg border border-navy-700 bg-navy-800 hover:border-navy-600 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/briefing/${stock.symbol}`}
                    className="text-xl font-semibold text-text-primary hover:text-accent-blue transition-colors"
                  >
                    {stock.symbol}
                  </Link>
                  <span className="text-text-muted">—</span>
                  <span className="text-text-secondary">{stock.companyName}</span>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
                  {typeof stock.lastScore === 'number' && (
                    <div className="flex items-center gap-1">
                      <span className="text-text-muted">{t('watchlist.scoreLabel')}</span>
                      <span className="text-text-primary font-medium">
                        {stock.lastScore.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {typeof stock.lastPrice === 'number' && (
                    <div className="flex items-center gap-1">
                      <span className="text-text-muted">{t('watchlist.priceLabel')}</span>
                      <span className="text-text-primary font-medium">
                        ${stock.lastPrice.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-text-muted">{t('watchlist.addedLabel')}</span>
                    <span className="text-text-primary">
                      {new Date(stock.addedAt).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/briefing/${stock.symbol}`}
                  className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm hover:bg-accent-blue/90 transition-colors"
                >
                  {t('watchlist.detailsButton')}
                </Link>
                <button
                  onClick={() => removeFromWatchlist(stock.symbol)}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
                >
                  {t('watchlist.removeButton')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
