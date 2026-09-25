const allowedPaths = new Set(['/(app)/(tabs)', '/(app)/(tabs)/habits', '/(app)/(tabs)/goals']);
const MAX_NOTIFICATION_PATH_LENGTH = 128;

export function isAllowedNotificationPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= MAX_NOTIFICATION_PATH_LENGTH && allowedPaths.has(path);
}
