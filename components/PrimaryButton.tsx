import { Pressable, StyleSheet, Text } from "react-native";

import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
};

export default function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: PrimaryButtonProps) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  const backgroundColor =
    variant === "danger"
      ? theme.colors.error
      : variant === "secondary"
        ? theme.colors.surface
        : theme.colors.primary;
  const foregroundColor =
    variant === "secondary" ? theme.colors.text : theme.colors.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: variant === "secondary" ? theme.colors.border : backgroundColor,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: foregroundColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  label: {
    fontSize: 15,
    fontWeight: "800",
  },
});
