import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AppContainer from "../components/AppContainer";
import ErrorBoundary from "../components/ErrorBoundary";
import LaunchScreen from "../components/LaunchScreen";
import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const hydrateResolvedTheme = useAppStore(
    (state) => state.hydrateResolvedTheme,
  );
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(
      getTheme(resolvedTheme).colors.background,
    );
  }, [resolvedTheme]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        hydrateResolvedTheme();
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        console.warn("App bootstrap warning", error);
      } finally {
        if (mounted) {
          setIsAppReady(true);
          await SplashScreen.hideAsync();
        }
      }
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [hydrateResolvedTheme]);

  if (!isAppReady) {
    return <LaunchScreen />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppContainer>
          <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
          <Slot />
        </AppContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
