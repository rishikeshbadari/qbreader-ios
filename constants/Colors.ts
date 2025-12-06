/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#4F46E5';
const tintColorDark = '#A5B4FC';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F4F5FB',
    surface: '#FFFFFF',
    surfaceSecondary: '#EEF2FF',
    border: '#E2E8F0',
    tint: tintColorLight,
    brand: '#4338CA',
    muted: '#64748B',
    icon: '#475467',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorLight,
    success: '#16A34A',
    warning: '#EAB308',
    error: '#DC2626',
  },
  dark: {
    text: '#F8FAFC',
    background: '#030712',
    surface: '#0F172A',
    surfaceSecondary: '#111C32',
    border: 'rgba(148, 163, 184, 0.35)',
    tint: tintColorDark,
    brand: '#818CF8',
    muted: '#94A3B8',
    icon: '#94A3B8',
    tabIconDefault: '#475467',
    tabIconSelected: tintColorDark,
    success: '#34D399',
    warning: '#FACC15',
    error: '#F87171',
  },
};
