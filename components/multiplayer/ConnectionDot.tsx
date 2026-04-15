import { StyleSheet, View } from 'react-native';
import { scale } from '@/utils/responsive';

type ConnectionDotProps = {
  status: 'connected' | 'reconnecting' | 'disconnected' | undefined;
  size?: number;
};

const STATUS_COLORS = {
  connected: '#16A34A',
  reconnecting: '#EAB308',
  disconnected: '#DC2626',
};

export function ConnectionDot({ status, size = 8 }: ConnectionDotProps) {
  const color = STATUS_COLORS[status ?? 'connected'];

  return (
    <View
      style={[
        styles.dot,
        {
          width: scale(size),
          height: scale(size),
          borderRadius: scale(size / 2),
          backgroundColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    // Dimensions set inline
  },
});
