import { useCallback } from 'react';
import { Keyboard, StyleSheet, TextInput } from 'react-native';

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
});
