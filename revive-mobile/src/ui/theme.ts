import { Platform } from 'react-native';

// Direção 02: papel quente, azul-tinta e desenhos estáticos.
export const colors = {
  background: '#F8F3E9',
  surface: '#FFFDF7',
  surfaceRaised: '#EAE5F3',
  primary: '#3F43A8',
  secondary: '#292B55',
  text: '#292B55',
  muted: '#666579',
  border: '#DAD4CA',
  danger: '#A3374A',
  warning: '#795C16',
  success: '#365C42',
  white: '#FFFFFF',
  peach: '#F2C2AD',
  lavender: '#DAD5F0',
  butter: '#EEDB87',
  sage: '#D3DCC7',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const fonts = {
  sans: Platform.select({ ios: 'Arial', android: 'sans-serif', default: 'Arial, sans-serif' }),
  editorial: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
};
