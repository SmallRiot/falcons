import { en } from './en';

export type Language = 'ru' | 'en';
const LANGUAGE_KEY = 'falcons.language';
export let language: Language = 'ru';
export let locale = 'ru-RU';

export function readLanguage(): Language | null {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try {
      const value = window[storage].getItem(LANGUAGE_KEY);
      if (value === 'ru' || value === 'en') return value;
    } catch {
      // Try the other storage when the browser blocks access.
    }
  }
  return null;
}

export function setLanguage(value: Language) {
  language = value;
  locale = value === 'en' ? 'en-GB' : 'ru-RU';
  document.documentElement.lang = value;
}

export function saveLanguage(value: Language) {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[storage].setItem(LANGUAGE_KEY, value);
      return true;
    } catch {
      // Fall back to session storage.
    }
  }
  return false;
}

export function t(key: string, ...values: unknown[]): string {
  const message = language === 'en' && Object.hasOwn(en, key) ? en[key] : key;
  return message.replace(/\{(\d+)\}/g, (placeholder, index) => index < values.length ? String(values[index]) : placeholder);
}
