import { Pressable, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type GameCodeDisplayProps = {
  code: string | null;
};

export function GameCodeDisplay({ code }: GameCodeDisplayProps) {
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');
  const surfaceColor = useThemeColor({}, 'surface');

  const handleCopy = async () => {
    if (!code) return;
    // Use the share sheet as a copy mechanism (avoids needing expo-clipboard native module)
    await Share.share({ message: code });
  };

  const handleShare = async () => {
    if (!code) return;
    const joinUrl = `qbreader://join/${code}`;
    await Share.share({
      message: `Join my QBReader game! Code: ${code}\n${joinUrl}`,
    });
  };

  if (!code) {
    return (
      <View style={[styles.container, { borderColor, backgroundColor: surfaceColor }]}>
        <ThemedText style={[styles.label, { color: mutedColor }]}>
          Generating game code...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor, backgroundColor: surfaceColor }]}>
      <ThemedText style={[styles.label, { color: mutedColor }]}>Game Code</ThemedText>
      <ThemedText style={styles.code}>{code}</ThemedText>
      <View style={styles.actions}>
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => [styles.actionButton, { borderColor, opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText style={[styles.actionLabel, { color: brandColor }]}>Copy Code</ThemedText>
        </Pressable>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.actionButton, { backgroundColor: brandColor, borderColor: brandColor, opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText style={[styles.actionLabel, { color: '#fff' }]}>Share Link</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(18),
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: responsiveFont(13),
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: {
    fontSize: responsiveFont(32),
    fontWeight: '700',
    letterSpacing: 8,
    lineHeight: responsiveFont(44),
    paddingVertical: verticalScale(4),
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(8),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(8),
  },
  actionLabel: {
    fontSize: responsiveFont(14),
    fontWeight: '600',
  },
});
