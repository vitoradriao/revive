import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/core/query/client';
import { SessionProvider } from '@/features/auth/session-context';
import { colors } from '@/ui/theme';
import { NotificationIntentProvider } from '@/core/notifications/notification-navigation';
import { ReminderProvider } from '@/features/reminders/reminder-provider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ReminderProvider>
            <NotificationIntentProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.surface },
                  headerTintColor: colors.text,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(public)" options={{ headerShown: false }} />
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
              </Stack>
            </NotificationIntentProvider>
          </ReminderProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
