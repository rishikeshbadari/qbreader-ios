import { useLocalSearchParams, useRootNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { resetToMultiplayerHome } from '@/utils/navigation';

/**
 * Deep link handler: qbreader://join/{CODE}
 *
 * Extracts the game code from the URL and redirects to the join screen
 * with the code pre-filled.
 */
export default function JoinDeepLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const rootNavigation = useRootNavigation();
  const brandColor = useThemeColor({}, 'brand');

  useEffect(() => {
    if (code) {
      router.replace({ pathname: '/multiplayer/join', params: { code: code.toUpperCase() } });
    } else {
      resetToMultiplayerHome(rootNavigation, () => router.replace('/(tabs)/multiplayer'));
    }
  }, [code, rootNavigation, router]);

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator color={brandColor} size="large" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
