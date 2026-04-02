import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import QRCode from "react-native-qrcode-svg";

import { type CreateTicketResponse } from "../services/api";
import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";
import InfoCard from "./InfoCard";
import PrimaryButton from "./PrimaryButton";

type TicketPreviewCardProps = {
  ticket: CreateTicketResponse;
  onShare: () => void;
};

export default function TicketPreviewCard({
  ticket,
  onShare,
}: TicketPreviewCardProps) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  const isImageQr =
    !!ticket.qrCode &&
    (ticket.qrCode.startsWith("http") || ticket.qrCode.startsWith("data:image"));

  return (
    <InfoCard title="Ticket ready" subtitle="Share this QR with the attendee.">
      <View style={[styles.qrFrame, { backgroundColor: theme.colors.surface }]}>
        {isImageQr ? (
          <Image source={{ uri: ticket.qrCode }} style={styles.image} contentFit="contain" />
        ) : (
          <QRCode value={ticket.qrCode ?? ticket.ticketId} size={180} />
        )}
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>Ticket ID</Text>
        <Text style={[styles.metaValue, { color: theme.colors.text }]}>{ticket.ticketId}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>Attendee</Text>
        <Text style={[styles.metaValue, { color: theme.colors.text }]}>{ticket.name}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>Email</Text>
        <Text style={[styles.metaValue, { color: theme.colors.text }]}>{ticket.email}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>Phone</Text>
        <Text style={[styles.metaValue, { color: theme.colors.text }]}>{ticket.phone}</Text>
      </View>
      <PrimaryButton label="Download / Share QR" onPress={onShare} />
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  qrFrame: {
    alignItems: "center",
    borderRadius: 24,
    marginBottom: 18,
    padding: 22,
  },
  image: {
    height: 200,
    width: 200,
  },
  metaRow: {
    gap: 4,
    marginBottom: 14,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 15,
    fontWeight: "700",
  },
});
