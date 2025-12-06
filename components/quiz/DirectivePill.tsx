import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { AnswerResult } from '@/types/qb';

interface Props {
  result?: AnswerResult;
}

export function DirectivePill({ result }: Props) {
  const successColor = useThemeColor({}, 'success');
  const warningColor = useThemeColor({}, 'warning');
  const errorColor = useThemeColor({}, 'error');
  const skipColor = useThemeColor({}, 'surfaceSecondary');
  const brandColor = useThemeColor({}, 'brand');

  if (!result) {
    return null;
  }

  const directive = result.directive.toLowerCase();

  let backgroundColor = errorColor;
  let label = 'Incorrect';
  let textColor = '#fff';

  if (directive === 'accept') {
    backgroundColor = successColor;
    label = 'Correct';
  } else if (directive === 'prompt') {
    backgroundColor = warningColor;
    label = 'Prompt';
  } else if (directive === 'skip') {
    backgroundColor = skipColor;
    label = 'Skipped';
    textColor = brandColor;
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ThemedText type="defaultSemiBold" style={[styles.label, { color: textColor }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
