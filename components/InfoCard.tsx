import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

type InfoCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export default function InfoCard({
  title,
  subtitle,
  children,
}: InfoCardProps) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  content: {
    marginTop: 18,
  },
});
