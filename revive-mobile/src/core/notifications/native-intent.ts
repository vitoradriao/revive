const MAX_NATIVE_LINK_LENGTH = 2048;

const allowedPaths = new Set([
  '/',
  '/login',
  '/cadastro',
  '/habits',
  '/habits/new',
  '/goals',
  '/goals/new',
  '/insights',
  '/profile',
  '/calendar',
  '/achievements',
  '/sync',
]);

function isAllowedPath(pathname: string) {
  return allowedPaths.has(pathname) || /^\/habits\/[0-9a-f-]{36}$/i.test(pathname);
}

export function sanitizeNativeIntentPath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_NATIVE_LINK_LENGTH) return '/';
  if (path.includes('\\')) return '/';

  try {
    const url = new URL(path, 'revive://app');
    if (url.protocol !== 'revive:' || (url.hostname !== '' && url.hostname !== 'app')) return '/';

    const pathname = url.pathname;
    if (pathname.includes('%') || !isAllowedPath(pathname)) return '/';

    // System links may route to an existing screen, but never supply query data to the router.
    return pathname;
  } catch {
    return '/';
  }
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return sanitizeNativeIntentPath(path);
}
