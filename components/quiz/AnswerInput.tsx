import { useCallback } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';

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
  const brandColor = useThemeColor({}, 'brand');
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
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={handleSubmit}
        editable={!disabled}
        returnKeyType="go"
        autoComplete="off"
        textContentType="none"
        autoFocus={autoFocus}
      />
      <Pressable
        onPress={handleSubmit}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.submitButton,
          {
            backgroundColor: brandColor,
            opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.submitLabel}>
          Check
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  submitButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  submitLabel: {
    color: '#fff',
  },
});
