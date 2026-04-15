import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

/**
 * Deep link handler: quizbowl://join/{CODE}
 *
 * Extracts the game code from the URL and redirects to the join screen
 * with the code pre-filled.
 */
export default function JoinDeepLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const brandColor = useThemeColor({}, 'brand');

  useEffect(() => {
    if (code) {
      router.replace({ pathname: '/multiplayer/join', params: { code: code.toUpperCase() } });
    } else {
      router.replace('/multiplayer');
    }
  }, [code, router]);

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
