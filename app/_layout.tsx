import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Colors } from '@/constants/Colors';
import { MultiplayerProvider } from '@/context/MultiplayerContext';
import { QuizSessionProvider } from '@/context/QuizSessionContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  isStartupTabWarmupComplete,
  subscribeToStartupTabWarmup,
} from '@/utils/startupWarmup';

SplashScreen.preventAutoHideAsync();

const LAUNCH_OVERLAY_POST_READY_MS = 450;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const launchBackgroundColor = Colors[colorScheme ?? 'light'].background;
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const hasHiddenSplashRef = useRef(false);
  const hasFadedLaunchOverlayRef = useRef(false);
  const launchOverlayFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchOverlayOpacity = useRef(new Animated.Value(1)).current;
  const [isAppLaidOut, setIsAppLaidOut] = useState(false);
  const [isLaunchOverlayVisible, setIsLaunchOverlayVisible] = useState(true);
  const [isNativeSplashHidden, setIsNativeSplashHidden] = useState(false);
  const [isTabWarmupComplete, setIsTabWarmupComplete] = useState(isStartupTabWarmupComplete);

  useEffect(() => {
    return () => {
      if (launchOverlayFadeTimeoutRef.current) {
        clearTimeout(launchOverlayFadeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeToStartupTabWarmup(() => setIsTabWarmupComplete(true));
  }, []);

  useEffect(() => {
    if (
      !loaded ||
      !isAppLaidOut ||
      !isNativeSplashHidden ||
      !isTabWarmupComplete ||
      hasFadedLaunchOverlayRef.current
    ) {
      return;
    }

    hasFadedLaunchOverlayRef.current = true;
    launchOverlayFadeTimeoutRef.current = setTimeout(() => {
      launchOverlayFadeTimeoutRef.current = null;
      Animated.timing(launchOverlayOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsLaunchOverlayVisible(false);
        }
      });
    }, LAUNCH_OVERLAY_POST_READY_MS);
  }, [isAppLaidOut, isNativeSplashHidden, isTabWarmupComplete, launchOverlayOpacity, loaded]);

  const handleLaunchOverlayLayout = useCallback(() => {
    if (!hasHiddenSplashRef.current) {
      hasHiddenSplashRef.current = true;
      void SplashScreen.hideAsync()
        .catch(() => undefined)
        .finally(() => setIsNativeSplashHidden(true));
    }
  }, []);

  const handleAppLayout = useCallback(() => {
    if (loaded) {
      setIsAppLaidOut(true);
    }
  }, [loaded]);

  return (
    <View style={styles.root}>
      {loaded ? (
        <View style={styles.root} onLayout={handleAppLayout}>
          <ErrorBoundary>
            <SettingsProvider>
              <MultiplayerProvider>
                <QuizSessionProvider>
                  <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                    <Stack>
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen
                        name="history/[filter]"
                        options={{
                          headerShown: false,
                          gestureEnabled: true,
                          fullScreenGestureEnabled: false,
                        }}
                      />
                      <Stack.Screen name="multiplayer" options={{ headerShown: false }} />
                      <Stack.Screen name="+not-found" />
                    </Stack>
                    <StatusBar style="auto" />
                  </ThemeProvider>
                </QuizSessionProvider>
              </MultiplayerProvider>
            </SettingsProvider>
          </ErrorBoundary>
        </View>
      ) : null}

      {isLaunchOverlayVisible ? (
        <Animated.View
          onLayout={handleLaunchOverlayLayout}
          style={[
            styles.launchOverlay,
            { backgroundColor: launchBackgroundColor, opacity: launchOverlayOpacity },
          ]}>
          <Image
            source={require('../assets/images/qb_transparent.png')}
            style={styles.launchLogo}
            resizeMode="contain"
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  launchOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  launchLogo: {
    height: 204,
    width: 240,
  },
});
