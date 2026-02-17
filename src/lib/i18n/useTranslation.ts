'use client';

import { useMemo } from 'react';
import { translate, type SupportedLanguage, DEFAULT_LANGUAGE } from './index';

export function useTranslation() {
  const lang = DEFAULT_LANGUAGE as SupportedLanguage;

  const t = useMemo(
    () =>
      (key: string) =>
        translate(key, lang),
    [lang]
  );

  return { t, lang };
}
