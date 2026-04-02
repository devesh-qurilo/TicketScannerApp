import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Device from "expo-device";

import FormField from "../../components/FormField";
import InfoCard from "../../components/InfoCard";
import PrimaryButton from "../../components/PrimaryButton";
import { loginVolunteer } from "../../services/api";
import { useAppStore } from "../../store/useAppStore";
import { getTheme } from "../../utils/theme";

export default function ProfileScreen() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const themeMode = useAppStore((state) => state.themeMode);
  const user = useAppStore((state) => state.user);
  const login = useAppStore((state) => state.login);
  const logout = useAppStore((state) => state.logout);
  const toggleDarkMode = useAppStore((state) => state.toggleDarkMode);

  const theme = getTheme(resolvedTheme);
  const [credentials, setCredentials] = useState({
    email: user?.email ?? "volunteer@event.com",
    password: "password123",
  });
  const [isLoading, setIsLoading] = useState(false);

  const deviceId = useMemo(
    () =>
      [Device.brand, Device.modelName, Device.osInternalBuildId]
        .filter(Boolean)
        .join(" • ") || "Unavailable",
    [],
  );

  const handleLogin = async () => {
    if (!credentials.email.trim() || !credentials.password.trim()) {
      Alert.alert("Missing login details", "Enter your email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginVolunteer(
        credentials.email.trim(),
        credentials.password,
      );
      login(response);
    } catch (error) {
      Alert.alert("Login failed", "We could not sign you in right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {!user ? (
        <InfoCard
          title="Volunteer login"
          subtitle="Use your assigned volunteer credentials to access the event profile."
        >
          <FormField
            label="Email"
            value={credentials.email}
            onChangeText={(value) =>
              setCredentials((current) => ({ ...current, email: value }))
            }
            placeholder="volunteer@event.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormField
            label="Password"
            value={credentials.password}
            onChangeText={(value) =>
              setCredentials((current) => ({ ...current, password: value }))
            }
            placeholder="password123"
            secureTextEntry
          />
          <PrimaryButton
            label={isLoading ? "Signing In..." : "Login"}
            onPress={() => void handleLogin()}
            disabled={isLoading}
          />
        </InfoCard>
      ) : (
        <InfoCard
          title={user.name}
          subtitle="Volunteer profile and scanner preferences."
        >
          <View style={styles.profileRow}>
            <Text style={[styles.label, { color: theme.colors.muted }]}>Role</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user.role}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={[styles.label, { color: theme.colors.muted }]}>Assigned Event</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user.assignedEvent}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={[styles.label, { color: theme.colors.muted }]}>Email</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user.email}</Text>
          </View>
          <PrimaryButton label="Logout" onPress={logout} variant="danger" />
        </InfoCard>
      )}

      <InfoCard title="Settings" subtitle="Keep the volunteer device ready for shifts.">
        <View style={styles.settingsRow}>
          <View>
            <Text style={[styles.settingTitle, { color: theme.colors.text }]}>Dark mode</Text>
            <Text style={[styles.settingCaption, { color: theme.colors.muted }]}>
              {themeMode === "dark" ? "Dark theme enabled" : "Light theme enabled"}
            </Text>
          </View>
          <Switch
            value={resolvedTheme === "dark"}
            onValueChange={toggleDarkMode}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
          />
        </View>
        <View style={styles.settingsRow}>
          <View style={styles.deviceBlock}>
            <Text style={[styles.settingTitle, { color: theme.colors.text }]}>Device ID</Text>
            <Text style={[styles.settingCaption, { color: theme.colors.muted }]}>
              {deviceId}
            </Text>
          </View>
        </View>
      </InfoCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
  },
  profileRow: {
    gap: 6,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  settingCaption: {
    fontSize: 14,
    marginTop: 4,
  },
  deviceBlock: {
    flex: 1,
  },
});
