import { useCallback } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function AnswerInput({
  value,
  onChangeText,
  onSubmit,
  disabled,
  autoFocus,
}: Props) {
  const colorScheme = useColorScheme();
  const mutedColor = useThemeColor({}, 'muted');
  const inputTextColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    onSubmit();
  }, [onSubmit]);

  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.wrapper}>
      <View style={[
        styles.container,
        {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          borderColor,
        },
      ]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Your answer..."
          placeholderTextColor={mutedColor}
          style={[styles.input, { color: inputTextColor }]}
          autoCapitalize="sentences"
          autoCorrect={false}
          onSubmitEditing={handleSubmit}
          editable={!disabled}
          returnKeyType="go"
          autoComplete="off"
          textContentType="none"
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  container: {
    borderWidth: scale(1),
    borderRadius: scale(12),
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  input: {
    fontSize: responsiveFont(16),
    paddingVertical: verticalScale(12),
  },
});
