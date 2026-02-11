'use client';

import { useMemo } from 'react';
import { useUnifiedSettings } from '@/lib/settings/useUnifiedSettings';
import { translate, type SupportedLanguage, DEFAULT_LANGUAGE } from './index';

export function useTranslation() {
  const { settings } = useUnifiedSettings();
  const lang = (settings.general.language ?? DEFAULT_LANGUAGE) as SupportedLanguage;

  const t = useMemo(
    () =>
      (key: string) =>
        translate(key, lang),
    [lang]
  );

  return { t, lang };
}
