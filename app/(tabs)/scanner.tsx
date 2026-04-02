import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Vibration,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from "react-native-vision-camera";

import InfoCard from "../../components/InfoCard";
import PrimaryButton from "../../components/PrimaryButton";
import StatusBanner from "../../components/StatusBanner";
import {
  enqueueVerification,
  getOfflineQueue,
  retryQueuedVerifications,
  verifyTicket,
} from "../../services/api";
import { useAppStore } from "../../store/useAppStore";
import { extractTicketId } from "../../utils/qr";
import { getTheme } from "../../utils/theme";

const SCAN_DEBOUNCE_MS = 2500;

type ScanState = {
  status: "idle" | "success" | "error" | "warning";
  title: string;
  message: string;
};

const defaultState: ScanState = {
  status: "idle",
  title: "Ready to scan",
  message: "Point the camera at a ticket QR code to validate entry.",
};

export default function ScannerScreen() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const lastScannedTicket = useAppStore((state) => state.lastScannedTicket);
  const offlineQueue = useAppStore((state) => state.offlineQueue);
  const setLastScannedTicket = useAppStore((state) => state.setLastScannedTicket);
  const setOfflineQueue = useAppStore((state) => state.setOfflineQueue);

  const theme = getTheme(resolvedTheme);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [scanState, setScanState] = useState<ScanState>(defaultState);
  const [isFocused, setIsFocused] = useState(true);
  const lastHandledRef = useRef<{ ticketId: string; at: number } | null>(null);
  const successSoundRef = useRef<Audio.Sound | null>(null);
  const errorSoundRef = useRef<Audio.Sound | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    void getOfflineQueue().then(setOfflineQueue);
  }, [setOfflineQueue]);

  useEffect(() => {
    let isMounted = true;

    const prepareAudio = async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      const successSound = new Audio.Sound();
      const errorSound = new Audio.Sound();

      await successSound.loadAsync(require("../../assets/sounds/success.wav"));
      await errorSound.loadAsync(require("../../assets/sounds/error.wav"));

      if (!isMounted) {
        await successSound.unloadAsync();
        await errorSound.unloadAsync();
        return;
      }

      successSoundRef.current = successSound;
      errorSoundRef.current = errorSound;
    };

    void prepareAudio();

    return () => {
      isMounted = false;
      void successSoundRef.current?.unloadAsync();
      void errorSoundRef.current?.unloadAsync();
    };
  }, []);

  const feedback = useCallback(async (status: ScanState["status"]) => {
    const playSound = async (sound: Audio.Sound | null) => {
      if (!sound) {
        return;
      }

      await sound.replayAsync();
    };

    if (status === "success") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate(120);
      await playSound(successSoundRef.current);
      return;
    }

    if (status === "warning") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Vibration.vibrate([0, 100, 80, 100]);
      await playSound(errorSoundRef.current);
      return;
    }

    if (status === "error") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate([0, 180, 120, 180]);
      await playSound(errorSoundRef.current);
    }
  }, []);

  const processTicket = useCallback(
    async (rawValue: string) => {
      const ticketId = extractTicketId(rawValue);
      if (!ticketId) {
        setScanState({
          status: "error",
          title: "Invalid QR payload",
          message: "This QR code does not contain a usable ticket ID.",
        });
        await feedback("error");
        return;
      }

      const now = Date.now();
      if (
        lastHandledRef.current?.ticketId === ticketId &&
        now - lastHandledRef.current.at < SCAN_DEBOUNCE_MS
      ) {
        return;
      }

      lastHandledRef.current = { ticketId, at: now };
      setIsBusy(true);

      try {
        const result = await verifyTicket(ticketId);

        if (result.status === "valid") {
          setScanState({
            status: "success",
            title: "Access Granted",
            message: result.message ?? `${result.attendeeName ?? "Guest"} may enter.`,
          });
          setLastScannedTicket({
            ticketId,
            status: "valid",
            checkedAt: new Date().toISOString(),
          });
          await feedback("success");
          return;
        }

        if (result.status === "used") {
          setScanState({
            status: "warning",
            title: "Already Used",
            message: result.message ?? "This ticket has already been checked in.",
          });
          setLastScannedTicket({
            ticketId,
            status: "used",
            checkedAt: new Date().toISOString(),
          });
          await feedback("warning");
          return;
        }

        setScanState({
          status: "error",
          title: "Invalid Ticket",
          message: result.message ?? "The scanned ticket could not be verified.",
        });
        setLastScannedTicket({
          ticketId,
          status: "invalid",
          checkedAt: new Date().toISOString(),
        });
        await feedback("error");
      } catch (error) {
        const queued = await enqueueVerification(ticketId);
        setOfflineQueue(queued);
        setScanState({
          status: "warning",
          title: "Queued for retry",
          message: "The device is offline right now, so this validation was stored locally.",
        });
        await feedback("warning");
      } finally {
        setIsBusy(false);
      }
    },
    [feedback, setLastScannedTicket, setOfflineQueue],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      const [first] = codes;
      if (!first?.value || isBusy) {
        return;
      }

      void processTicket(first.value);
    },
  });

  const retryQueue = useCallback(async () => {
    setIsBusy(true);
    try {
      const remaining = await retryQueuedVerifications();
      setOfflineQueue(remaining);
      setScanState({
        status: remaining.length === 0 ? "success" : "warning",
        title: remaining.length === 0 ? "Queue synced" : "Some items still pending",
        message:
          remaining.length === 0
            ? "All offline verifications were retried successfully."
            : `${remaining.length} verification${remaining.length === 1 ? "" : "s"} still waiting for network.`,
      });
    } finally {
      setIsBusy(false);
    }
  }, [setOfflineQueue]);

  const scannerEnabled = hasPermission && !!device && isFocused;
  const overlayColor = useMemo(() => {
    if (scanState.status === "success") {
      return theme.colors.success;
    }
    if (scanState.status === "warning") {
      return theme.colors.warning;
    }
    if (scanState.status === "error") {
      return theme.colors.error;
    }
    return theme.colors.primary;
  }, [scanState.status, theme.colors]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.hero}>
        {scannerEnabled ? (
          <View style={[styles.cameraFrame, { borderColor: overlayColor, backgroundColor: theme.colors.card }]}>
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={scannerEnabled}
              codeScanner={codeScanner}
              torch={isTorchOn ? "on" : "off"}
            />
            <View style={[styles.scanGuide, { borderColor: overlayColor }]} />
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsTorchOn((value) => !value)}
              style={[styles.flashButton, { backgroundColor: theme.colors.surface }]}
            >
              <MaterialCommunityIcons
                name={isTorchOn ? "flashlight-off" : "flashlight"}
                size={20}
                color={theme.colors.text}
              />
              <Text style={[styles.flashButtonLabel, { color: theme.colors.text }]}>
                {isTorchOn ? "Flash Off" : "Flash On"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <InfoCard
            title="Camera access needed"
            subtitle="Vision Camera requires a development build. Grant camera permission to start scanning."
          >
            <PrimaryButton label="Allow Camera" onPress={() => void requestPermission()} />
          </InfoCard>
        )}
      </View>

      <StatusBanner
        status={scanState.status}
        title={scanState.title}
        message={scanState.message}
      />

      <InfoCard
        title="Scanner controls"
        subtitle="Duplicate scans are blocked for 2.5 seconds so one ticket only validates once per pass."
      >
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>Last ticket</Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {lastScannedTicket?.ticketId ?? "None yet"}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>Offline queue</Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {offlineQueue.length} pending
          </Text>
        </View>
        <PrimaryButton
          label={isBusy ? "Working..." : "Retry Offline Queue"}
          onPress={() => void retryQueue()}
          disabled={isBusy || offlineQueue.length === 0}
          variant="secondary"
        />
      </InfoCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 16,
    padding: 20,
  },
  hero: {
    minHeight: 320,
  },
  cameraFrame: {
    borderRadius: 28,
    borderWidth: 2,
    flex: 1,
    minHeight: 320,
    overflow: "hidden",
    position: "relative",
  },
  scanGuide: {
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 3,
    height: 220,
    marginTop: 42,
    width: 220,
  },
  flashButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "absolute",
    right: 16,
    top: 16,
  },
  flashButtonLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "700",
  },
});
