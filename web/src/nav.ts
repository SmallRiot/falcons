/** start-параметр из ссылки бота → экран приложения */
export function startRoute(p: string): string | null {
  if (/^e\d+$/.test(p)) return `/events/${p.slice(1)}`;
  const map: Record<string, string> = {
    finance: '/finance',
    'admin-finance': '/admin/finance',
    'admin-users': '/admin/users',
    service: '/service',
    sharpening: '/sharpening',
    home: '/',
  };
  return map[p] ?? null;
}
