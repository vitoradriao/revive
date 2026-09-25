import type { ExpoConfig } from 'expo/config';

const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV || 'development';
const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';

if (appEnvironment === 'production' && !apiUrl.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_API_URL deve usar HTTPS no build de produção.');
}

const config: ExpoConfig = {
  name: 'Revive',
  slug: 'revive-mobile',
  owner: 'reviveapp',
  version: '0.1.1',
  orientation: 'portrait',
  scheme: 'revive',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.reviveapp.revive',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    versionCode: 2,
    package: 'com.reviveapp.revive',
    adaptiveIcon: { backgroundColor: '#07111F' },
    predictiveBackGestureEnabled: true,
  },
  extra: {
    environment: appEnvironment,
    eas: { projectId: 'f1c60685-d082-4a4c-ba54-4bc1fda44c05' },
  },
  web: { bundler: 'metro' },
  plugins: [
    './plugins/with-local-android.cjs',
    'expo-router',
    'expo-localization',
    'expo-secure-store',
    'expo-sqlite',
    'expo-sharing',
    'expo-splash-screen',
    [
      'expo-build-properties',
      { android: { usesCleartextTraffic: appEnvironment === 'development' } },
    ],
    [
      'expo-notifications',
      {
        color: '#7CF6C4',
        defaultChannel: 'lembretes',
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
