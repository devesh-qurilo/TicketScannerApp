import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

export default function LaunchScreen() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.logoWrap}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.copyBlock}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          TicketScannerApp
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          Preparing the scanner experience…
        </Text>
      </View>

      <ActivityIndicator
        size="large"
        color={theme.colors.primary}
        style={styles.loader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  logoWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 32,
    height: 120,
    justifyContent: "center",
    marginBottom: 24,
    width: 120,
  },
  logo: {
    height: 84,
    width: 84,
  },
  copyBlock: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  loader: {
    marginTop: 8,
  },
});
