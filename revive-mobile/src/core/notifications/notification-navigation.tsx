import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { isAllowedNotificationPath } from './notification-path';

export function NotificationNavigation() {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      const path = response.notification.request.content.data?.path;
      if (isAllowedNotificationPath(path)) router.push(path as never);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then((response) => response && open(response));
    return () => subscription.remove();
  }, [router]);
  return null;
}
