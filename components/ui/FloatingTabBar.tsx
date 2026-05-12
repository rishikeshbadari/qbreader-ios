import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export const FLOATING_TAB_BAR_HEIGHT = 112;

const BAR_HEIGHT = verticalScale(64);
const BAR_RADIUS = scale(32);
const BAR_HORIZONTAL_PADDING = scale(6);

export function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = useRef(new Animated.Value(state.index)).current;
  const liquidPulse = useRef(new Animated.Value(0)).current;
  const keyboardProgress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    liquidPulse.setValue(0);

    Animated.parallel([
      Animated.spring(activeIndex, {
        toValue: state.index,
        damping: 17,
        stiffness: 210,
        mass: 0.72,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(liquidPulse, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(liquidPulse, {
          toValue: 0,
          damping: 16,
          stiffness: 170,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [activeIndex, liquidPulse, state.index]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      Animated.timing(keyboardProgress, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      Animated.spring(keyboardProgress, {
        toValue: 1,
        damping: 18,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardProgress]);

  const contentWidth = barWidth > 0 ? Math.max(0, barWidth - BAR_HORIZONTAL_PADDING * 2) : 0;
  const itemWidth = contentWidth > 0 ? contentWidth / state.routes.length : 0;
  const indicatorWidth = itemWidth > 0 ? Math.max(scale(58), itemWidth - scale(10)) : 0;

  const inputRange = useMemo(
    () => state.routes.map((_, index) => index),
    [state.routes]
  );

  const translateX = itemWidth > 0
    ? activeIndex.interpolate({
        inputRange,
        outputRange: state.routes.map((_, index) =>
          BAR_HORIZONTAL_PADDING + index * itemWidth + (itemWidth - indicatorWidth) / 2
        ),
        extrapolate: 'clamp',
      })
    : 0;

  const liquidScaleX = liquidPulse.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 1.18, 1],
  });

  const liquidScaleY = liquidPulse.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0.92, 1],
  });

  const tabBarTranslateY = keyboardProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [FLOATING_TAB_BAR_HEIGHT, 0],
  });

  const bottomInset = Math.max(insets.bottom, spacing.sm);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          height: FLOATING_TAB_BAR_HEIGHT,
          paddingBottom: bottomInset,
        },
      ]}>
      <Animated.View
        pointerEvents="auto"
        style={[
          styles.bar,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.82)',
            shadowColor: isDark ? '#000' : '#4F46E5',
            opacity: keyboardProgress,
            transform: [{ translateY: tabBarTranslateY }],
          },
        ]}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}>
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={isDark ? 72 : 88}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.glassTint,
            {
              backgroundColor: isDark
                ? 'rgba(15, 23, 42, 0.66)'
                : 'rgba(255, 255, 255, 0.58)',
            },
          ]}
        />
        {itemWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.liquidIndicator,
              {
                width: indicatorWidth,
                backgroundColor: isDark
                  ? 'rgba(129, 140, 248, 0.24)'
                  : 'rgba(79, 70, 229, 0.14)',
                borderColor: isDark
                  ? 'rgba(199, 210, 254, 0.22)'
                  : 'rgba(79, 70, 229, 0.18)',
                transform: [
                  { translateX },
                  { scaleX: liquidScaleX },
                  { scaleY: liquidScaleY },
                ],
              },
            ]}>
          </Animated.View>
        ) : null}

        <View style={styles.tabs}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const label = getTabLabel(options, route.name);
            const color = focused ? theme.tabIconSelected : theme.tabIconDefault;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                if (process.env.EXPO_OS === 'ios') {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }

                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    width: itemWidth || undefined,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}>
                {options.tabBarIcon?.({
                  focused,
                  color,
                  size: focused ? scale(24) : scale(22),
                })}
                <ThemedText
                  numberOfLines={1}
                  style={[
                    styles.label,
                    {
                      color,
                      opacity: focused ? 1 : 0.76,
                    },
                  ]}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

function getTabLabel(
  options: BottomTabBarProps['descriptors'][string]['options'],
  routeName: string
): string {
  if (typeof options.tabBarLabel === 'string') {
    return options.tabBarLabel;
  }

  if (typeof options.title === 'string') {
    return options.title;
  }

  return routeName;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: verticalScale(14) },
    shadowOpacity: 0.22,
    shadowRadius: scale(22),
    elevation: 18,
  },
  glassTint: {
    borderRadius: BAR_RADIUS,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_HORIZONTAL_PADDING,
  },
  tab: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: verticalScale(2),
    paddingHorizontal: scale(2),
  },
  label: {
    fontSize: responsiveFont(10),
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  liquidIndicator: {
    position: 'absolute',
    top: verticalScale(7),
    bottom: verticalScale(7),
    left: 0,
    borderRadius: BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
