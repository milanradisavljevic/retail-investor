import de from './locales/de.json';
import en from './locales/en.json';

export type SupportedLanguage = 'de' | 'en';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'de';

const translations: Record<SupportedLanguage, any> = { de, en };

export function translate(key: string, lang: SupportedLanguage = DEFAULT_LANGUAGE): string {
  const keys = key.split('.');
  let value: any = translations[lang];

  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) break;
  }

  return value ?? key;
}

export { de, en };
