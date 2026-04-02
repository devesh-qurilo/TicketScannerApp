import { StyleSheet, Text, View } from "react-native";

import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

type StatusBannerProps = {
  status: "idle" | "success" | "error" | "warning";
  title: string;
  message: string;
};

export default function StatusBanner({
  status,
  title,
  message,
}: StatusBannerProps) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  const statusColor =
    status === "success"
      ? theme.colors.success
      : status === "warning"
        ? theme.colors.warning
        : status === "error"
          ? theme.colors.error
          : theme.colors.primary;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: statusColor, shadowColor: theme.colors.shadow },
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 24,
    padding: 20,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  title: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "800",
  },
  message: {
    color: "#1E293B",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
});
