import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
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

// ─── Animated scan line ───────────────────────────────────────────────────────
function ScanLine({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 160],
  });

  return (
    <Animated.View
      style={[
        styles.scanLine,
        { backgroundColor: color, transform: [{ translateY }] },
      ]}
    />
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({
  label,
  value,
  valueColor,
  theme,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  theme: ReturnType<typeof getTheme>;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
        {label}
      </Text>
      <Text
        style={[styles.metaValue, { color: valueColor ?? theme.colors.text }]}
      >
        {String(value)}
      </Text>
    </View>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function StatusBadge({
  value,
  theme,
}: {
  value: string;
  theme: ReturnType<typeof getTheme>;
}) {
  const isPaid = value === "paid" || value === "success";
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isPaid
            ? theme.colors.successSubtle
            : theme.colors.warningSubtle,
          borderColor: isPaid ? theme.colors.success : theme.colors.warning,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: isPaid ? theme.colors.success : theme.colors.warning },
        ]}
      >
        {value.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ScannerScreen() {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const lastScannedTicket = useAppStore((s) => s.lastScannedTicket);
  const offlineQueue = useAppStore((s) => s.offlineQueue);
  const scanHistory = useAppStore((s) => s.scanHistory);
  const setLastScannedTicket = useAppStore((s) => s.setLastScannedTicket);
  const setOfflineQueue = useAppStore((s) => s.setOfflineQueue);
  const addScanRecord = useAppStore((s) => s.addScanRecord);
  const markScanRecordsSynced = useAppStore((s) => s.markScanRecordsSynced);
  const markScanRecordsFailed = useAppStore((s) => s.markScanRecordsFailed);

  const theme = getTheme(resolvedTheme);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");

  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncingTable, setIsSyncingTable] = useState(false);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [scanState, setScanState] = useState<ScanState>(defaultState);
  const [isFocused, setIsFocused] = useState(true);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === "active",
  );
  const [selectedBooking, setSelectedBooking] =
    useState<TicketDetailResponse | null>(null);
  const [allowUserInput, setAllowUserInput] = useState("");

  const lastHandledRef = useRef<{ ticketId: string; at: number } | null>(null);
  const successSoundRef = useRef<Audio.Sound | null>(null);
  const errorSoundRef = useRef<Audio.Sound | null>(null);
  const audioReadyRef = useRef(false);

  // ── Camera overlay color ──────────────────────────────────────────────────
  const overlayColor = useMemo(() => {
    const map: Record<ScanState["status"], string> = {
      idle: theme.colors.primary,
      success: theme.colors.success,
      warning: theme.colors.warning,
      error: theme.colors.error,
    };
    return map[scanState.status];
  }, [scanState.status, theme.colors]);

  // ── Navigation focus ──────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  // ── Permissions & queue init ──────────────────────────────────────────────
  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);
  useEffect(() => {
    void getOfflineQueue().then(setOfflineQueue);
  }, [setOfflineQueue]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  // ── Audio setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isAppActive) return;
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });
        const s = new Audio.Sound();
        const e = new Audio.Sound();
        await s.loadAsync(require("../../assets/sounds/success.wav"));
        await e.loadAsync(require("../../assets/sounds/error.wav"));
        if (!mounted) {
          await s.unloadAsync();
          await e.unloadAsync();
          return;
        }
        successSoundRef.current = s;
        errorSoundRef.current = e;
        audioReadyRef.current = true;
      } catch {
        audioReadyRef.current = false;
      }
    })();
    return () => {
      mounted = false;
      audioReadyRef.current = false;
      void successSoundRef.current?.unloadAsync();
      void errorSoundRef.current?.unloadAsync();
      successSoundRef.current = null;
      errorSoundRef.current = null;
    };
  }, [isAppActive]);

  // ── Haptic + audio feedback ───────────────────────────────────────────────
  const feedback = useCallback(
    async (status: ScanState["status"]) => {
      const play = async (snd: Audio.Sound | null) => {
        if (!isAppActive || !audioReadyRef.current || !snd) return;
        try {
          await snd.replayAsync();
        } catch {}
      };
      if (status === "success") {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        Vibration.vibrate(120);
        await play(successSoundRef.current);
      } else if (status === "warning") {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
        Vibration.vibrate([0, 100, 80, 100]);
        await play(errorSoundRef.current);
      } else if (status === "error") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Vibration.vibrate([0, 180, 120, 180]);
        await play(errorSoundRef.current);
      }
    },
    [isAppActive],
  );

  // ── QR processing ─────────────────────────────────────────────────────────
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
          message: "QR code has no usable ticket ID.",
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

      if (selectedBooking?.ticketId === ticketId) return;

      const now = Date.now();
      if (
        lastHandledRef.current?.ticketId === ticketId &&
        now - lastHandledRef.current.at < SCAN_DEBOUNCE_MS
      )
        return;
      lastHandledRef.current = { ticketId, at: now };
      setSelectedBooking(null);
      setAllowUserInput("");
      setIsBusy(true);

      try {
        const result = await fetchTicketDetail(ticketId);
        const resolvedId = result.ticketId ?? ticketId;
        const summary =
          result.message ??
          (result.status === "used"
            ? "This ticket has already been checked in."
            : "Ticket details loaded successfully.");

        const baseRecord = {
          id: `${Date.now()}-${resolvedId}`,
          ticketId: resolvedId,
          rawValue,
          checkedAt,
          syncStatus: "pending" as const,
          attendeeName: result.attendeeName,
        };

        if (result.status === "valid") {
          const remaining = result.allowVisitors ?? 0;
          addScanRecord({ ...baseRecord, status: "valid", message: summary });
          setScanState({
            status: "success",
            title: "Ticket Found",
            message: summary,
          });
          setSelectedBooking(result);
          setAllowUserInput(remaining > 0 ? "1" : "");
          setLastScannedTicket({
            ...baseRecord,
            status: "valid",
            message: summary,
          });
          await feedback("success");
          return;
        }

        if (result.status === "used") {
          addScanRecord({ ...baseRecord, status: "used", message: summary });
          setScanState({
            status: "warning",
            title: "Already Used",
            message: summary,
          });
          setSelectedBooking(result);
          setAllowUserInput("");
          setLastScannedTicket({
            ...baseRecord,
            status: "used",
            message: summary,
          });
          await feedback("warning");
          return;
        }

        addScanRecord({ ...baseRecord, status: "invalid", message: summary });
        setScanState({
          status: "error",
          title: "Invalid Ticket",
          message: summary,
        });
        setSelectedBooking(null);
        setAllowUserInput("");
        setLastScannedTicket({
          ...baseRecord,
          status: "invalid",
          message: summary,
        });
        await feedback("error");
      } catch {
        const queued = await enqueueVerification(ticketId);
        const record = {
          id: `${Date.now()}-${ticketId}`,
          ticketId,
          rawValue,
          status: "queued" as const,
          message: "Queued locally — device is offline.",
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
          message: "Device is offline. Validation stored locally.",
        });
        await feedback("warning");
      } finally {
        setIsBusy(false);
      }
    },
    [
      addScanRecord,
      feedback,
      selectedBooking?.ticketId,
      setLastScannedTicket,
      setOfflineQueue,
    ],
  );

  // ── Visitor entry submit ──────────────────────────────────────────────────
  const submitAllowedVisitors = useCallback(async () => {
    if (!selectedBooking?.ticketId) return;
    const allowUser = Number.parseInt(allowUserInput, 10);
    const remaining = selectedBooking.allowVisitors ?? 0;

    if (!Number.isInteger(allowUser) || allowUser <= 0) {
      setScanState({
        status: "error",
        title: "Invalid count",
        message: "Enter a valid number of visitors.",
      });
      await feedback("error");
      return;
    }
    if (allowUser > remaining) {
      setScanState({
        status: "error",
        title: "Count too high",
        message: `You can allow up to ${remaining} visitor${remaining === 1 ? "" : "s"}.`,
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
      setSelectedBooking(null);
      setAllowUserInput("");
      setScanState({
        status: "success",
        title: "Visitors Allowed",
        message: result.message,
      });
      await feedback("success");
    } catch {
      setScanState({
        status: "error",
        title: "Verification failed",
        message: "Could not update allowed visitor count.",
      });
      await feedback("error");
    } finally {
      setIsSubmittingEntry(false);
    }
  }, [allowUserInput, feedback, selectedBooking]);

  // ── QR scanner hook ───────────────────────────────────────────────────────
  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      const [first] = codes;
      if (!first?.value || isBusy) return;
      void processTicket(first.value);
    },
  });

  // ── Offline queue retry ───────────────────────────────────────────────────
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
            : `${remaining.length} verification${remaining.length === 1 ? "" : "s"} still waiting.`,
      });
    } finally {
      setIsBusy(false);
    }
  }, [setOfflineQueue]);

  // ── History sync ──────────────────────────────────────────────────────────
  const syncHistoryTable = useCallback(async () => {
    const pending = scanHistory.filter((r) => r.syncStatus !== "synced");
    if (pending.length === 0) {
      setScanState({
        status: "success",
        title: "Already synced",
        message: "All records are synced with the backend.",
      });
      return;
    }
    setIsSyncingTable(true);
    try {
      const result = await syncScanHistory(pending);
      if (result.syncedIds.length > 0)
        markScanRecordsSynced(result.syncedIds, result.syncedAt);
      if (result.failedIds.length > 0) markScanRecordsFailed(result.failedIds);
      setScanState({
        status: result.failedIds.length === 0 ? "success" : "warning",
        title:
          result.failedIds.length === 0
            ? "History synced"
            : "Partial sync complete",
        message:
          result.failedIds.length === 0
            ? `${result.syncedIds.length} record${result.syncedIds.length === 1 ? "" : "s"} synced.`
            : `${result.syncedIds.length} synced, ${result.failedIds.length} pending.`,
      });
    } catch {
      markScanRecordsFailed(pending.map((r) => r.id));
      setScanState({
        status: "error",
        title: "Sync failed",
        message: "Could not upload scan table to backend.",
      });
    } finally {
      setIsSyncingTable(false);
    }
  }, [markScanRecordsFailed, markScanRecordsSynced, scanHistory]);

  const scannerEnabled = hasPermission && !!device && isFocused && isAppActive;
  const pendingSyncCount = scanHistory.filter(
    (r) => r.syncStatus !== "synced",
  ).length;

  // ── Stepper helpers ───────────────────────────────────────────────────────
  const stepperValue = Number.parseInt(allowUserInput || "1", 10);
  const maxVisitors = selectedBooking?.allowVisitors ?? 0;
  const ticketExhausted = selectedBooking?.isUsed || maxVisitors === 0;

  const decrement = () =>
    setAllowUserInput((v) =>
      String(Math.max(1, Number.parseInt(v || "1", 10) - 1)),
    );
  const increment = () =>
    setAllowUserInput((v) =>
      String(Math.min(maxVisitors, Number.parseInt(v || "1", 10) + 1)),
    );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Camera ──────────────────────────────────────────────────────── */}
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

            {/* Corner guides */}
            <View style={[styles.scanGuide, { borderColor: overlayColor }]}>
              <ScanLine color={overlayColor} />
            </View>

            {/* Torch toggle */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsTorchOn((v) => !v)}
              style={({ pressed }) => [
                styles.flashButton,
                {
                  backgroundColor: isTorchOn
                    ? `${overlayColor}30`
                    : theme.colors.surface,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isTorchOn ? "flashlight-off" : "flashlight"}
                size={18}
                color={isTorchOn ? overlayColor : theme.colors.text}
              />
              <Text
                style={[
                  styles.flashButtonLabel,
                  { color: isTorchOn ? overlayColor : theme.colors.text },
                ]}
              >
                {isTorchOn ? "Flash Off" : "Flash On"}
              </Text>
            </Pressable>

            {/* Live label */}
            <View style={styles.liveTag}>
              <View
                style={[styles.liveDot, { backgroundColor: overlayColor }]}
              />
              <Text style={[styles.liveText, { color: overlayColor }]}>
                LIVE
              </Text>
            </View>
          </View>
        ) : (
          <InfoCard
            title="Camera access needed"
            subtitle="Grant camera permission to start scanning tickets."
          >
            <PrimaryButton
              label="Allow Camera"
              onPress={() => void requestPermission()}
            />
          </InfoCard>
        )}
      </View>

      {/* ── Status banner ─────────────────────────────────────────────────── */}
      <StatusBanner
        status={scanState.status}
        title={scanState.title}
        message={scanState.message}
      />

      {/* ── Scanner controls ───────────────────────────────────────────────── */}
      {/* <InfoCard
        title="Scanner controls"
        subtitle="Duplicate scans are blocked for 2.5 s so one ticket only validates once per pass."
      >
        <MetaRow
          label="Last ticket"
          value={lastScannedTicket?.ticketId ?? "None yet"}
          theme={theme}
        />
        <MetaRow
          label="Offline queue"
          value={`${offlineQueue.length} pending`}
          theme={theme}
          highlight={offlineQueue.length > 0}
        />
        <MetaRow
          label="History sync"
          value={`${pendingSyncCount} pending`}
          theme={theme}
          highlight={pendingSyncCount > 0}
        />
        <PrimaryButton
          label={isBusy ? "Working…" : "Retry Offline Queue"}
          onPress={() => void retryQueue()}
          disabled={isBusy || offlineQueue.length === 0}
          variant="secondary"
        />
      </InfoCard> */}

      {/* ── Ticket details ─────────────────────────────────────────────────── */}
      <InfoCard
        title="Ticket details"
        subtitle="Booking details load after scan. Adjust visitor count and tap Verify."
      >
        {selectedBooking ? (
          <>
            {/* Detail grid */}
            <View style={styles.detailGrid}>
              <DetailRow
                label="Ticket ID"
                value={selectedBooking.ticketId}
                theme={theme}
                valueColor={theme.colors.primary}
              />
              <DetailRow
                label="Email"
                value={selectedBooking.email ?? "—"}
                theme={theme}
              />
              <DetailRow
                label="Phone"
                value={selectedBooking.phone ?? "—"}
                theme={theme}
              />
              <DetailRow
                label="Total Ticket"
                value={selectedBooking.totalTicket ?? 0}
                theme={theme}
              />
              <DetailRow
                label="Amount"
                value={selectedBooking.amount ?? 0}
                theme={theme}
              />
              <DetailRow
                label="Allowed Left"
                value={selectedBooking.allowVisitors ?? 0}
                theme={theme}
                valueColor={
                  maxVisitors > 0 ? theme.colors.success : theme.colors.error
                }
              />

              {/* Payment badge */}
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Payment
                </Text>
                <StatusBadge
                  value={selectedBooking.paymentStatus ?? "—"}
                  theme={theme}
                />
              </View>

              {/* Used badge */}
              <View style={styles.detailRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
                  Used
                </Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: selectedBooking.isUsed
                        ? theme.colors.errorSubtle
                        : theme.colors.successSubtle,
                      borderColor: selectedBooking.isUsed
                        ? theme.colors.error
                        : theme.colors.success,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color: selectedBooking.isUsed
                          ? theme.colors.error
                          : theme.colors.success,
                      },
                    ]}
                  >
                    {selectedBooking.isUsed ? "YES" : "NO"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Visitor stepper */}
            <Text style={[styles.inputLabel, { color: theme.colors.muted }]}>
              People to verify
            </Text>
            <Text style={[styles.helperText, { color: theme.colors.muted }]}>
              Max allowed: {maxVisitors}
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
              {/* Decrement */}
              <Pressable
                accessibilityRole="button"
                onPress={decrement}
                disabled={
                  isSubmittingEntry || ticketExhausted || stepperValue <= 1
                }
                style={({ pressed }) => [
                  styles.stepperButton,
                  {
                    borderColor: theme.colors.border,
                    opacity:
                      isSubmittingEntry || ticketExhausted || stepperValue <= 1
                        ? 0.3
                        : pressed
                          ? 0.7
                          : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepperButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  −
                </Text>
              </Pressable>

              {/* Value */}
              <View style={styles.stepperValueWrap}>
                <Text
                  style={[
                    styles.stepperValue,
                    {
                      color: ticketExhausted
                        ? theme.colors.muted
                        : theme.colors.text,
                    },
                  ]}
                >
                  {ticketExhausted ? "—" : stepperValue}
                </Text>
                <Text
                  style={[styles.stepperCaption, { color: theme.colors.muted }]}
                >
                  1 to {maxVisitors}
                </Text>
              </View>

              {/* Increment */}
              <Pressable
                accessibilityRole="button"
                onPress={increment}
                disabled={
                  isSubmittingEntry ||
                  ticketExhausted ||
                  stepperValue >= maxVisitors
                }
                style={({ pressed }) => [
                  styles.stepperButton,
                  {
                    borderColor: theme.colors.border,
                    opacity:
                      isSubmittingEntry ||
                      ticketExhausted ||
                      stepperValue >= maxVisitors
                        ? 0.3
                        : pressed
                          ? 0.7
                          : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepperButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  +
                </Text>
              </Pressable>
            </View>

            <PrimaryButton
              label={
                isSubmittingEntry
                  ? "Verifying…"
                  : ticketExhausted
                    ? "Ticket Exhausted"
                    : "Verify Entry"
              }
              onPress={() => void submitAllowedVisitors()}
              disabled={isSubmittingEntry || ticketExhausted}
            />
          </>
        ) : (
          <Text style={[styles.emptyStateText, { color: theme.colors.muted }]}>
            Scan a ticket to load booking details here.
          </Text>
        )}
      </InfoCard>

      {/* ── Scan history table ─────────────────────────────────────────────── */}
      {/* <InfoCard
        title="Scanned QR table"
        subtitle="Every scan is stored locally and can be synced to the backend in batch."
      >
        <PrimaryButton
          label={
            isSyncingTable
              ? "Syncing…"
              : `Sync Table${pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ""}`
          }
          onPress={() => void syncHistoryTable()}
          disabled={isSyncingTable || pendingSyncCount === 0}
        />
        <View style={styles.tableSpacer} />
        <ScanHistoryTable records={scanHistory} />
      </InfoCard> */}
    </ScrollView>
  );
}

// ─── Small helper component ────────────────────────────────────────────────────
function MetaRow({
  label,
  value,
  theme,
  highlight = false,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof getTheme>;
  highlight?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.metaValue,
          { color: highlight ? theme.colors.warning : theme.colors.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  hero: { minHeight: 280 },

  // Camera
  cameraFrame: {
    borderRadius: 24,
    borderWidth: 2,
    flex: 1,
    minHeight: 280,
    overflow: "hidden",
    position: "relative",
  },
  scanGuide: {
    alignSelf: "center",
    borderRadius: 20,
    borderWidth: 2.5,
    height: 200,
    marginTop: 38,
    overflow: "hidden",
    width: 200,
  },
  scanLine: {
    height: 2,
    width: "100%",
    borderRadius: 1,
    opacity: 0.85,
  },
  flashButton: {
    alignItems: "center",
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
    right: 14,
    top: 14,
  },
  flashButtonLabel: { fontSize: 13, fontWeight: "700" },
  liveTag: {
    alignItems: "center",
    borderRadius: 99,
    bottom: 14,
    flexDirection: "row",
    gap: 5,
    left: 14,
    position: "absolute",
  },
  liveDot: { borderRadius: 99, height: 6, width: 6 },
  liveText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },

  // Meta rows
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metaLabel: { fontSize: 13, fontWeight: "600" },
  metaValue: { fontSize: 13, fontWeight: "700" },

  // Detail grid
  detailGrid: { gap: 0, marginBottom: 16 },
  detailRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
  },

  // Badge
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  // Stepper
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  helperText: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  stepper: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
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
  stepperButtonText: { fontSize: 26, fontWeight: "800", lineHeight: 28 },
  stepperValueWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
  stepperValue: { fontSize: 24, fontWeight: "800" },
  stepperCaption: { fontSize: 11, marginTop: 3 },

  // Misc
  tableSpacer: { height: 14 },
  emptyStateText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingVertical: 12,
  },
});
