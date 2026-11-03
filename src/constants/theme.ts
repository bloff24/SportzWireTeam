import '@/global.css';

import { Platform } from 'react-native';

/** SportzWire palette: deep navy + electric blue, with a hot orange for calls to action. */
export const Colors = {
  light: {
    text: '#0B1220',
    textSecondary: '#5B6475',
    background: '#F5F7FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6ECF7',
    border: '#DDE3EE',
    tint: '#1557FF',
    tintText: '#FFFFFF',
    accent: '#FF5A1F',
    danger: '#D92D20',
    success: '#12A150',
    bubbleMine: '#1557FF',
    bubbleMineText: '#FFFFFF',
    bubbleOther: '#FFFFFF',
  },
  dark: {
    text: '#F2F5FA',
    textSecondary: '#9AA4B5',
    background: '#070B14',
    backgroundElement: '#121A2A',
    backgroundSelected: '#1C2740',
    border: '#22304A',
    tint: '#4C7DFF',
    tintText: '#FFFFFF',
    accent: '#FF7A45',
    danger: '#F97066',
    success: '#32D583',
    bubbleMine: '#3B6BFF',
    bubbleMineText: '#FFFFFF',
    bubbleOther: '#1C2740',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
