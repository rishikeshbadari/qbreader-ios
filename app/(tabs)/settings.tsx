import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useMultiplayer } from '@/context/MultiplayerContext';
import {
  isPlaytestPeerActive,
  startPlaytestPeer,
  stopPlaytestPeer,
} from '@/services/multiplayer/playtest-peer';
import { responsiveFont, scale, spacing, verticalScale, deviceMetrics } from '@/utils/responsive';

// Dynamic spacing based on screen height
const isCompactScreen = deviceMetrics.height < 700;
const dynamicGap = isCompactScreen ? verticalScale(8) : verticalScale(12);
const sectionPadding = isCompactScreen ? spacing.md : spacing.lg;
const chipPaddingV = isCompactScreen ? verticalScale(6) : verticalScale(8);

const CONTACT_LINKS = [
  {
    label: 'Gmail',
    url: 'mailto:badari.rishikesh@gmail.com',
    icon: require('../../assets/images/gmail-logo.png'),
  },
  {
    label: 'X',
    url: 'https://x.com/rbadari_',
    icon: require('../../assets/images/x.png'),
  },
  {
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/in/rbadari/',
    icon: require('../../assets/images/linkedin.png'),
  },
];

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const tabBarHeight = useBottomTabBarHeight();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const {
    availableDifficulties,
    availableCategories,
    selectedDifficulties,
    selectedCategories,
    revealSpeed,
    toggleDifficulty,
    toggleCategory,
    selectAllDifficulties,
    selectAllCategories,
    setRevealSpeed,
    loadingOptions,
    loadError,
    refreshOptions,
    selectionErrors,
  } = useSettings();
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const errorColor = useThemeColor({}, 'error');
  const { sessionId } = useMultiplayer();
  const [peerActive, setPeerActive] = useState(isPlaytestPeerActive());

  const handleOpenContact = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  }, []);

  const handleResetState = () => {
    Alert.alert('Reset all state?', 'Clears AsyncStorage and reloads. Used by /playtest.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          Alert.alert('Cleared', 'Reload the app (R,R in Metro) to apply.');
        },
      },
    ]);
  };

  const handleTogglePeer = async () => {
    if (peerActive) {
      await stopPlaytestPeer();
      setPeerActive(false);
      return;
    }
    if (!sessionId) {
      Alert.alert('No session', 'Host or join a multiplayer game first.');
      return;
    }
    await startPlaytestPeer(sessionId);
    setPeerActive(true);
  };

  const revealSpeedLabel =
    revealSpeed >= 0.95
      ? 'Instant'
      : revealSpeed >= 0.7
        ? 'Fast'
        : revealSpeed >= 0.4
          ? 'Moderate'
          : revealSpeed >= 0.2
            ? 'Slow'
            : 'Very slow';

  const renderDifficultyChips = () =>
    availableDifficulties.map((option) => {
      const isSelected = option.values.every((value) => selectedDifficulties.includes(value));
      return (
        <Pressable
          key={option.label}
          onPress={() => toggleDifficulty(option.values)}
          style={[
            styles.chip,
            {
              borderColor,
              backgroundColor: isSelected ? brandColor : 'transparent',
            },
          ]}>
          <ThemedText
            style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
            {option.label}
          </ThemedText>
        </Pressable>
      );
    });

  const renderCategoryChips = () =>
    availableCategories.map((category) => {
      const isSelected = selectedCategories.includes(category.name);
      return (
        <Pressable
          key={category.name}
          onPress={() => toggleCategory(category.name)}
          style={[
            styles.chip,
            {
              borderColor,
              backgroundColor: isSelected ? brandColor : 'transparent',
            },
          ]}>
          <ThemedText
            style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
            {category.name}
          </ThemedText>
        </Pressable>
      );
    });

  const showDifficultyPlaceholder =
    loadingOptions && availableDifficulties.length === 0;
  const showCategoryPlaceholder = loadingOptions && availableCategories.length === 0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title">Settings</ThemedText>
        </View>

        {/* Reveal Speed */}
        <ThemedView lightColor={Colors.light.surface} darkColor={Colors.dark.surface} style={[styles.section, { borderColor }]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Reveal Speed</ThemedText>
            <ThemedText style={[styles.speedLabel, { color: mutedColor }]}>
              {revealSpeedLabel}
            </ThemedText>
          </View>
          <Slider
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={revealSpeed}
            onValueChange={setRevealSpeed}
            minimumTrackTintColor={brandColor}
            maximumTrackTintColor={borderColor}
            thumbTintColor={brandColor}
            style={styles.slider}
          />
        </ThemedView>

        {loadError ? (
          <ThemedView lightColor={Colors.light.surface} darkColor={Colors.dark.surface} style={[styles.section, styles.errorCard, { borderColor }]}>
            <ThemedText type="defaultSemiBold" style={[styles.errorText, { color: errorColor }]}>
              {loadError}
            </ThemedText>
            <Pressable onPress={refreshOptions} style={[styles.refreshButton, { borderColor }]}>
              <ThemedText type="defaultSemiBold">Try again</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}

        {/* Difficulty */}
        <ThemedView lightColor={Colors.light.surface} darkColor={Colors.dark.surface} style={[styles.section, { borderColor }]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Difficulty</ThemedText>
            <Pressable onPress={selectAllDifficulties} hitSlop={8}>
              <ThemedText style={[styles.actionLink, { color: brandColor }]}>
                Select all
              </ThemedText>
            </Pressable>
          </View>
          {showDifficultyPlaceholder ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chipGrid}>{renderDifficultyChips()}</View>
          )}
          {selectionErrors.difficulty ? (
            <ThemedText style={[styles.errorMessage, { color: errorColor }]}>{selectionErrors.difficulty}</ThemedText>
          ) : null}
        </ThemedView>

        {/* Categories */}
        <ThemedView lightColor={Colors.light.surface} darkColor={Colors.dark.surface} style={[styles.section, { borderColor }]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Categories</ThemedText>
            <Pressable onPress={selectAllCategories} hitSlop={8}>
              <ThemedText style={[styles.actionLink, { color: brandColor }]}>
                Select all
              </ThemedText>
            </Pressable>
          </View>
          {showCategoryPlaceholder ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chipGrid}>{renderCategoryChips()}</View>
          )}
          {selectionErrors.category ? (
            <ThemedText style={[styles.errorMessage, { color: errorColor }]}>{selectionErrors.category}</ThemedText>
          ) : null}
        </ThemedView>

        <ThemedView lightColor={Colors.light.surface} darkColor={Colors.dark.surface} style={[styles.section, styles.contactSection, { borderColor }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Contact</ThemedText>
          <View style={styles.contactLinks}>
            {CONTACT_LINKS.map((contact) => (
              <Pressable
                key={contact.label}
                onPress={() => void handleOpenContact(contact.url)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${contact.label}`}
                style={({ pressed }) => [
                  styles.contactLink,
                  { borderColor, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Image source={contact.icon} style={styles.contactIcon} resizeMode="contain" />
              </Pressable>
            ))}
          </View>
        </ThemedView>

        {loadingOptions && !showDifficultyPlaceholder && !showCategoryPlaceholder ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <ThemedText style={styles.loadingLabel}>Refreshing…</ThemedText>
          </View>
        ) : null}

        {process.env.EXPO_PUBLIC_USE_PAIRED_LOOPBACK === '1' ? (
          <ThemedView lightColor={Colors.light.surface} darkColor={Colors.dark.surface} style={[styles.section, { borderColor }]}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Dev Tools</ThemedText>
            </View>
            <Pressable
              onPress={handleResetState}
              accessibilityLabel="Reset all app state"
              testID="dev-reset-state"
              style={[styles.devButton, { borderColor }]}>
              <ThemedText type="defaultSemiBold">Reset all state</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleTogglePeer}
              accessibilityLabel={peerActive ? 'Stop playtest peer' : 'Start playtest peer'}
              testID="dev-toggle-peer"
              style={[styles.devButton, { borderColor }]}>
              <ThemedText type="defaultSemiBold">
                {peerActive ? 'Stop playtest peer' : 'Start playtest peer'}
              </ThemedText>
            </Pressable>
            <ThemedText style={[styles.devHint, { color: mutedColor }]}>
              {sessionId
                ? `Session: ${sessionId.slice(0, 8)}…`
                : 'No active multiplayer session'}
            </ThemedText>
          </ThemedView>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: dynamicGap,
  },
  header: {
    gap: spacing.xs,
  },
  section: {
    borderRadius: scale(16),
    borderWidth: StyleSheet.hairlineWidth,
    padding: sectionPadding,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: responsiveFont(16),
  },
  speedLabel: {
    fontSize: responsiveFont(14),
  },
  slider: {
    marginHorizontal: -spacing.xs,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: chipPaddingV,
  },
  chipLabel: {
    fontSize: responsiveFont(13),
  },
  actionLink: {
    fontSize: responsiveFont(14),
    fontWeight: '600',
  },
  contactSection: {
    gap: spacing.md,
  },
  contactLinks: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  contactLink: {
    alignItems: 'center',
    borderRadius: scale(12),
    borderWidth: StyleSheet.hairlineWidth,
    height: verticalScale(46),
    justifyContent: 'center',
    width: verticalScale(46),
  },
  contactIcon: {
    height: scale(24),
    width: scale(24),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingLabel: {
    opacity: 0.7,
    fontSize: responsiveFont(13),
  },
  errorCard: {
    borderWidth: scale(1),
  },
  errorText: {
    fontSize: responsiveFont(14),
  },
  errorMessage: {
    fontSize: responsiveFont(13),
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderWidth: scale(1),
    borderRadius: scale(8),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  devButton: {
    alignSelf: 'flex-start',
    borderWidth: scale(1),
    borderRadius: scale(8),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  devHint: {
    fontSize: responsiveFont(12),
  },
});
