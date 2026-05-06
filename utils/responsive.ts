import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Reference dimensions based on iPhone 14.
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const horizontalScaleFactor = clamp(SCREEN_WIDTH / BASE_WIDTH, 0.92, 1.12);
const verticalScaleFactor = clamp(SCREEN_HEIGHT / BASE_HEIGHT, 0.9, 1.14);

/**
 * Scale a size horizontally based on the reference width.
 */
export function scale(size: number): number {
  return Math.round(size * horizontalScaleFactor);
}

/**
 * Scale a size vertically based on the reference height.
 */
export function verticalScale(size: number): number {
  return Math.round(size * verticalScaleFactor);
}

/**
 * Moderately scale a size to avoid extremes on very small/large screens.
 */
export function moderateScale(size: number, factor = 0.5): number {
  const scaled = size * horizontalScaleFactor;
  return Math.round(size + (scaled - size) * factor);
}

/**
 * Responsive spacing tokens that adapt to screen size.
 */
export const spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(24),
};

/**
 * Responsive typography helper.
 */
export function responsiveFont(size: number, factor = 0.4): number {
  return moderateScale(size, factor);
}

/**
 * Breakpoint helpers based on screen width.
 */
export const breakpoints = {
  isSmall: SCREEN_WIDTH < 360,
  isMedium: SCREEN_WIDTH >= 360 && SCREEN_WIDTH < 414,
  isLarge: SCREEN_WIDTH >= 414,
};

/**
 * Recommended minimum touch target size (per platform guidance).
 */
export const MIN_TOUCH_TARGET = Math.max(44, scale(44));

export const deviceMetrics = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isIOS: Platform.OS === 'ios',
  isAndroid: Platform.OS === 'android',
};
