import { useCallback } from 'react';
import { Keyboard, StyleSheet, TextInput } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
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
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({}, 'muted');
  const inputTextColor = useThemeColor({}, 'text');

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    onSubmit();
  }, [onSubmit]);

  return (
    <ThemedView
      lightColor={Colors.light.surface}
      darkColor={Colors.dark.surface}
      style={[styles.container, { borderColor }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Buzz in with your answer"
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: scale(1),
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  input: {
    flex: 1,
    fontSize: responsiveFont(16),
    paddingVertical: verticalScale(10),
  },
});
