import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AppContainer from "../components/AppContainer";
import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

export default function RootLayout() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(getTheme(resolvedTheme).colors.background);
  }, [resolvedTheme]);

  return (
    <SafeAreaProvider>
      <AppContainer>
        <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
        <Slot />
      </AppContainer>
    </SafeAreaProvider>
  );
}
