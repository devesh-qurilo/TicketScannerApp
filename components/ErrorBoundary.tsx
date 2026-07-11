import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Updates from "expo-updates";

import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
};

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Unhandled app error", error, errorInfo);
  }

  handleReload = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      this.setState({ hasError: false, errorMessage: null });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message={this.state.errorMessage}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorFallback({
  message,
  onReload,
}: {
  message: string | null;
  onReload: () => Promise<void>;
}) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.card}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Something went wrong
        </Text>
        <Text style={[styles.message, { color: theme.colors.muted }]}>
          The app hit an unexpected issue. A quick reload should restore normal
          scanning.
        </Text>
        {message ? (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {message}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void onReload();
          }}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
            Reload app
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    alignItems: "center",
    borderRadius: 24,
    maxWidth: 360,
    padding: 24,
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: "center",
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
