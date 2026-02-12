import React, { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { spacing, responsiveFont, scale, verticalScale } from '@/utils/responsive';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ThemedText type="title" style={styles.title}>Something went wrong</ThemedText>
          <ThemedText style={styles.message}>
            The app encountered an unexpected error. Try restarting.
          </ThemedText>
          <Pressable
            onPress={this.handleReset}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.8 : 1 }]}>
            <ThemedText type="defaultSemiBold" style={styles.buttonText}>Try Again</ThemedText>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    opacity: 0.7,
    fontSize: responsiveFont(14),
  },
  button: {
    backgroundColor: '#4338CA',
    borderRadius: scale(12),
    paddingHorizontal: spacing.xl,
    paddingVertical: verticalScale(12),
    marginTop: spacing.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: responsiveFont(16),
  },
});
