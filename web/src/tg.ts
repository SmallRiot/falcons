/* Тонкая обёртка над Telegram WebApp: вне Telegram всё безопасно превращается в no-op. */

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number } };
  colorScheme: 'light' | 'dark';
  platform: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  openLink?(url: string): void;
  onEvent?(e: string, cb: () => void): void;
  isVersionAtLeast?(v: string): boolean;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;
export const inTelegram = !!tg;

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  err: () => tg?.HapticFeedback?.notificationOccurred('error'),
  select: () => tg?.HapticFeedback?.selectionChanged(),
};

export function openLink(url: string) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export const startParam = tg?.initDataUnsafe.start_param ?? new URLSearchParams(location.search).get('startapp') ?? '';
