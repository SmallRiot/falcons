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
  /** Bot API 8.0+: отступы под системные элементы и под шапку Telegram (в полноэкранном режиме) */
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  isFullscreen?: boolean;
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

/**
 * Полноэкранный режим Telegram (iPhone): сверху статус-бар и кнопки Telegram поверх приложения.
 * Пишем общий отступ в --top-inset, чтобы наши кнопки сверху не уезжали под них.
 */
export function watchSafeArea() {
  if (!tg) return;
  const apply = () => {
    const top = (tg.safeAreaInset?.top ?? 0) + (tg.contentSafeAreaInset?.top ?? 0);
    document.documentElement.style.setProperty('--top-inset', `${top}px`);
  };
  apply();
  for (const e of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) tg.onEvent?.(e, apply);
}
