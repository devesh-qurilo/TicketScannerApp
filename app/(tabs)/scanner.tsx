import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Vibration,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";

import InfoCard from "../../components/InfoCard";
import PrimaryButton from "../../components/PrimaryButton";
import ScanHistoryTable from "../../components/ScanHistoryTable";
import StatusBanner from "../../components/StatusBanner";
import {
  enqueueVerification,
  fetchTicketDetail,
  getOfflineQueue,
  retryQueuedVerifications,
  syncScanHistory,
  verifyTicketEntry,
  type TicketDetailResponse,
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
  const scanHistory = useAppStore((state) => state.scanHistory);
  const setLastScannedTicket = useAppStore(
    (state) => state.setLastScannedTicket,
  );
  const setOfflineQueue = useAppStore((state) => state.setOfflineQueue);
  const addScanRecord = useAppStore((state) => state.addScanRecord);
  const markScanRecordsSynced = useAppStore(
    (state) => state.markScanRecordsSynced,
  );
  const markScanRecordsFailed = useAppStore(
    (state) => state.markScanRecordsFailed,
  );

  const theme = getTheme(resolvedTheme);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncingTable, setIsSyncingTable] = useState(false);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [scanState, setScanState] = useState<ScanState>(defaultState);
  const [isFocused, setIsFocused] = useState(true);
  const [selectedBooking, setSelectedBooking] =
    useState<TicketDetailResponse | null>(null);
  const [allowUserInput, setAllowUserInput] = useState("");
  const lastHandledRef = useRef<{ ticketId: string; at: number } | null>(null);
  const successSoundRef = useRef<Audio.Sound | null>(null);
  const errorSoundRef = useRef<Audio.Sound | null>(null);

  console.log("allow data", selectedBooking);
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
      const checkedAt = new Date().toISOString();
      if (!ticketId) {
        addScanRecord({
          id: `${Date.now()}-invalid`,
          ticketId: "UNKNOWN",
          rawValue,
          status: "invalid",
          message: "This QR code does not contain a usable ticket ID.",
          checkedAt,
          syncStatus: "pending",
        });
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
        const result = await fetchTicketDetail(ticketId);
        const resolvedTicketId = result.ticketId ?? ticketId;
        const resultSummary =
          result.message ??
          (result.status === "used"
            ? "This ticket has already been checked in."
            : "Ticket details loaded successfully.");

        if (result.status === "valid") {
          const remainingVisitors = result.allowVisitors ?? 0;
          const defaultAllowUser =
            remainingVisitors > 0 ? "1" : "";
          const record = {
            id: `${Date.now()}-${resolvedTicketId}`,
            ticketId: resolvedTicketId,
            rawValue,
            status: "valid" as const,
            message: resultSummary,
            attendeeName: result.attendeeName,
            checkedAt,
            syncStatus: "pending" as const,
          };
          setScanState({
            status: "success",
            title: "Ticket Found",
            message: resultSummary,
          });
          setSelectedBooking(result);
          setAllowUserInput(defaultAllowUser);
          setLastScannedTicket(record);
          addScanRecord(record);
          await feedback("success");
          return;
        }

        if (result.status === "used") {
          const record = {
            id: `${Date.now()}-${resolvedTicketId}`,
            ticketId: resolvedTicketId,
            rawValue,
            status: "used" as const,
            message: resultSummary,
            attendeeName: result.attendeeName,
            checkedAt,
            syncStatus: "pending" as const,
          };
          setScanState({
            status: "warning",
            title: "Already Used",
            message: resultSummary,
          });
          setSelectedBooking(result);
          setAllowUserInput("");
          setLastScannedTicket(record);
          addScanRecord(record);
          await feedback("warning");
          return;
        }

        const record = {
          id: `${Date.now()}-${resolvedTicketId}`,
          ticketId: resolvedTicketId,
          rawValue,
          status: "invalid" as const,
          message: resultSummary,
          attendeeName: result.attendeeName,
          checkedAt,
          syncStatus: "pending" as const,
        };
        setScanState({
          status: "error",
          title: "Invalid Ticket",
          message: resultSummary,
        });
        setSelectedBooking(null);
        setAllowUserInput("");
        setLastScannedTicket(record);
        addScanRecord(record);
        await feedback("error");
      } catch (error) {
        const queued = await enqueueVerification(ticketId);
        const record = {
          id: `${Date.now()}-${ticketId}`,
          ticketId,
          rawValue,
          status: "queued" as const,
          message:
            "Verification was queued locally because the device is offline.",
          checkedAt,
          syncStatus: "pending" as const,
        };
        setOfflineQueue(queued);
        setSelectedBooking(null);
        setAllowUserInput("");
        setLastScannedTicket(record);
        addScanRecord(record);
        setScanState({
          status: "warning",
          title: "Queued for retry",
          message:
            "The device is offline right now, so this validation was stored locally.",
        });
        await feedback("warning");
      } finally {
        setIsBusy(false);
      }
    },
    [addScanRecord, feedback, setLastScannedTicket, setOfflineQueue],
  );

  const submitAllowedVisitors = useCallback(async () => {
    if (!selectedBooking?.ticketId) {
      return;
    }

    const allowUser = Number.parseInt(allowUserInput, 10);
    const remainingVisitors = selectedBooking.allowVisitors ?? 0;

    if (!Number.isInteger(allowUser) || allowUser <= 0) {
      setScanState({
        status: "error",
        title: "Invalid count",
        message: "Enter a valid number of visitors to allow.",
      });
      await feedback("error");
      return;
    }

    if (allowUser > remainingVisitors) {
      setScanState({
        status: "error",
        title: "Count too high",
        message: `You can allow up to ${remainingVisitors} visitor${remainingVisitors === 1 ? "" : "s"} for this ticket.`,
      });
      await feedback("error");
      return;
    }

    setIsSubmittingEntry(true);
    try {
      const result = await verifyTicketEntry(
        selectedBooking.ticketId,
        allowUser,
      );
      const nextAllowVisitors = Math.max(remainingVisitors - allowUser, 0);
      const isUsed = nextAllowVisitors === 0;

      setSelectedBooking({
        ...selectedBooking,
        allowVisitors: nextAllowVisitors,
        isUsed,
        updatedAt: new Date().toISOString(),
      });
      setAllowUserInput(nextAllowVisitors > 0 ? "1" : "");
      setScanState({
        status: "success",
        title: "Visitors Allowed",
        message: result.message,
      });
      await feedback("success");
    } catch (error) {
      setScanState({
        status: "error",
        title: "Verification failed",
        message:
          "We could not update the allowed visitor count for this ticket.",
      });
      await feedback("error");
    } finally {
      setIsSubmittingEntry(false);
    }
  }, [allowUserInput, feedback, selectedBooking]);

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
        title:
          remaining.length === 0 ? "Queue synced" : "Some items still pending",
        message:
          remaining.length === 0
            ? "All offline verifications were retried successfully."
            : `${remaining.length} verification${remaining.length === 1 ? "" : "s"} still waiting for network.`,
      });
    } finally {
      setIsBusy(false);
    }
  }, [setOfflineQueue]);

  const syncHistoryTable = useCallback(async () => {
    const pendingRecords = scanHistory.filter(
      (record) => record.syncStatus !== "synced",
    );
    if (pendingRecords.length === 0) {
      setScanState({
        status: "success",
        title: "Already synced",
        message: "All stored scan records are already synced with the backend.",
      });
      return;
    }

    setIsSyncingTable(true);
    try {
      const result = await syncScanHistory(pendingRecords);
      if (result.syncedIds.length > 0) {
        markScanRecordsSynced(result.syncedIds, result.syncedAt);
      }
      if (result.failedIds.length > 0) {
        markScanRecordsFailed(result.failedIds);
      }
      setScanState({
        status: result.failedIds.length === 0 ? "success" : "warning",
        title:
          result.failedIds.length === 0
            ? "History synced"
            : "Partial sync complete",
        message:
          result.failedIds.length === 0
            ? `${result.syncedIds.length} scan record${result.syncedIds.length === 1 ? "" : "s"} synced to the backend.`
            : `${result.syncedIds.length} synced, ${result.failedIds.length} still pending.`,
      });
    } catch (error) {
      markScanRecordsFailed(pendingRecords.map((record) => record.id));
      setScanState({
        status: "error",
        title: "Sync failed",
        message: "We could not upload the stored scan table to the backend.",
      });
    } finally {
      setIsSyncingTable(false);
    }
  }, [markScanRecordsFailed, markScanRecordsSynced, scanHistory]);

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

  const pendingSyncCount = scanHistory.filter(
    (record) => record.syncStatus !== "synced",
  ).length;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        {scannerEnabled ? (
          <View
            style={[
              styles.cameraFrame,
              { borderColor: overlayColor, backgroundColor: theme.colors.card },
            ]}
          >
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
              style={[
                styles.flashButton,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <MaterialCommunityIcons
                name={isTorchOn ? "flashlight-off" : "flashlight"}
                size={20}
                color={theme.colors.text}
              />
              <Text
                style={[styles.flashButtonLabel, { color: theme.colors.text }]}
              >
                {isTorchOn ? "Flash Off" : "Flash On"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <InfoCard
            title="Camera access needed"
            subtitle="Vision Camera requires a development build. Grant camera permission to start scanning."
          >
            <PrimaryButton
              label="Allow Camera"
              onPress={() => void requestPermission()}
            />
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
          <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
            Last ticket
          </Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {lastScannedTicket?.ticketId ?? "None yet"}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
            Offline queue
          </Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {offlineQueue.length} pending
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
            History sync
          </Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {pendingSyncCount} pending
          </Text>
        </View>
        <PrimaryButton
          label={isBusy ? "Working..." : "Retry Offline Queue"}
          onPress={() => void retryQueue()}
          disabled={isBusy || offlineQueue.length === 0}
          variant="secondary"
        />
      </InfoCard>
      <InfoCard
        title="Ticket details"
        subtitle="After scanning, the same ticket code is sent in params, booking details are loaded, and the volunteer can verify how many people are allowed."
      >
        {selectedBooking ? (
          <>
            <View style={styles.detailGrid}>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Ticket ID
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.ticketId}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Email
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.email ?? "-"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Phone
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.phone ?? "-"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Total Ticket
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.totalTicket ?? 0}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Amount
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.amount ?? 0}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Allowed Left
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.allowVisitors ?? 0}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Payment
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.paymentStatus ?? "-"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Used
                </Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                  {selectedBooking.isUsed ? "Yes" : "No"}
                </Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: theme.colors.muted }]}>
              People to verify
            </Text>
            <Text style={[styles.helperText, { color: theme.colors.muted }]}>
              Max allowed for this ticket: {selectedBooking.allowVisitors ?? 0}
            </Text>
            <View
              style={[
                styles.stepper,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setAllowUserInput((current) => {
                    const currentValue = Number.parseInt(current || "1", 10);
                    return String(Math.max(1, currentValue - 1));
                  })
                }
                disabled={
                  isSubmittingEntry ||
                  selectedBooking.isUsed ||
                  (selectedBooking.allowVisitors ?? 0) === 0 ||
                  Number.parseInt(allowUserInput || "1", 10) <= 1
                }
                style={({ pressed }) => [
                  styles.stepperButton,
                  {
                    borderColor: theme.colors.border,
                    opacity:
                      isSubmittingEntry ||
                      selectedBooking.isUsed ||
                      (selectedBooking.allowVisitors ?? 0) === 0 ||
                      Number.parseInt(allowUserInput || "1", 10) <= 1
                        ? 0.35
                        : pressed
                          ? 0.8
                          : 1,
                  },
                ]}
              >
                <Text style={[styles.stepperButtonText, { color: theme.colors.text }]}>
                  -
                </Text>
              </Pressable>

              <View style={styles.stepperValueWrap}>
                <Text style={[styles.stepperValue, { color: theme.colors.text }]}>
                  {allowUserInput || "1"}
                </Text>
                <Text style={[styles.stepperCaption, { color: theme.colors.muted }]}>
                  1 to {selectedBooking.allowVisitors ?? 0}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setAllowUserInput((current) => {
                    const currentValue = Number.parseInt(current || "1", 10);
                    const maxAllowed = selectedBooking.allowVisitors ?? 0;
                    return String(Math.min(maxAllowed, currentValue + 1));
                  })
                }
                disabled={
                  isSubmittingEntry ||
                  selectedBooking.isUsed ||
                  (selectedBooking.allowVisitors ?? 0) === 0 ||
                  Number.parseInt(allowUserInput || "1", 10) >=
                    (selectedBooking.allowVisitors ?? 0)
                }
                style={({ pressed }) => [
                  styles.stepperButton,
                  {
                    borderColor: theme.colors.border,
                    opacity:
                      isSubmittingEntry ||
                      selectedBooking.isUsed ||
                      (selectedBooking.allowVisitors ?? 0) === 0 ||
                      Number.parseInt(allowUserInput || "1", 10) >=
                        (selectedBooking.allowVisitors ?? 0)
                        ? 0.35
                        : pressed
                          ? 0.8
                          : 1,
                  },
                ]}
              >
                <Text style={[styles.stepperButtonText, { color: theme.colors.text }]}>
                  +
                </Text>
              </Pressable>
            </View>

            <PrimaryButton
              label={isSubmittingEntry ? "Verifying..." : "Verify"}
              onPress={() => void submitAllowedVisitors()}
              disabled={
                isSubmittingEntry ||
                selectedBooking.isUsed ||
                (selectedBooking.allowVisitors ?? 0) === 0
              }
            />
          </>
        ) : (
          <Text style={[styles.emptyStateText, { color: theme.colors.muted }]}>
            Scan a ticket to load booking details here.
          </Text>
        )}
      </InfoCard>
      <InfoCard
        title="Scanned QR table"
        subtitle="Every scan is stored locally and can be synced to the backend in batch format."
      >
        <PrimaryButton
          label={isSyncingTable ? "Syncing..." : "Sync Table With Backend"}
          onPress={() => void syncHistoryTable()}
          disabled={isSyncingTable || pendingSyncCount === 0}
        />
        <View style={styles.tableSpacer} />
        <ScanHistoryTable records={scanHistory} />
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
  tableSpacer: {
    height: 16,
  },
  detailGrid: {
    gap: 12,
    marginBottom: 18,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  stepper: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 10,
  },
  stepperButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  stepperButtonText: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 28,
  },
  stepperValueWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  stepperCaption: {
    fontSize: 12,
    marginTop: 4,
  },
  allowInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
