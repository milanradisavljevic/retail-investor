'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWatchlist } from '@/lib/watchlist/useWatchlist';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface Props {
  symbol: string;
  companyName: string;
  lastScore?: number;
  lastPrice?: number | null;
}

export function AddToWatchlistButton({ symbol, companyName, lastScore, lastPrice }: Props) {
  const { t } = useTranslation();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const [toast, setToast] = useState<{ visible: boolean; added: boolean }>({ visible: false, added: false });

  const inWatchlist = isInWatchlist(symbol);

  const buttonLabel = useMemo(
    () => (inWatchlist ? t('watchlist.inWatchlist') : t('watchlist.addToWatchlist')),
    [inWatchlist, t]
  );

  useEffect(() => {
    if (!toast.visible) return;
    const timer = setTimeout(() => setToast({ visible: false, added: false }), 1600);
    return () => clearTimeout(timer);
  }, [toast.visible]);

  const handleToggle = () => {
    const willAdd = !inWatchlist;
    toggleWatchlist({
      symbol,
      companyName,
      lastScore,
      lastPrice: lastPrice ?? undefined,
    });
    setToast({ visible: true, added: willAdd });
  };

  return (
    <>
      <button
        onClick={handleToggle}
        className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors border ${
          inWatchlist
            ? 'bg-accent-orange text-white border-accent-orange/80 hover:bg-accent-orange/90'
            : 'bg-accent-blue text-white border-accent-blue/80 hover:bg-accent-blue/90'
        }`}
      >
        {buttonLabel}
      </button>

      {toast.visible && (
        <div className="fixed top-4 right-4 z-50 rounded-lg border border-navy-700 bg-navy-800 px-4 py-3">
          <span className={toast.added ? 'text-green-400' : 'text-orange-300'}>
            {toast.added ? t('watchlist.addedToast') : t('watchlist.removedToast')}
          </span>
        </div>
      )}
    </>
  );
}
