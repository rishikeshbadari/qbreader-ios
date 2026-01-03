import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { AnswerResult } from '@/types/qb';
import { directiveLabel, normalizeDirective } from '@/utils/directives';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

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

  const directive = normalizeDirective(result);
  const label = directiveLabel(result);

  let backgroundColor = errorColor;
  let textColor = '#fff';

  if (directive === 'accept') {
    backgroundColor = successColor;
  } else if (directive === 'prompt') {
    backgroundColor = warningColor;
  } else if (directive === 'skip') {
    backgroundColor = skipColor;
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
    paddingHorizontal: spacing.md + scale(2),
    paddingVertical: verticalScale(4),
    alignSelf: 'flex-start',
    minHeight: scale(24),
  },
  label: {
    fontSize: responsiveFont(13),
    letterSpacing: 0.2,
  },
});
