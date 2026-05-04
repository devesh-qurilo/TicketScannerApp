import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View, Share } from "react-native";

import FormField from "../../components/FormField";
import InfoCard from "../../components/InfoCard";
import PrimaryButton from "../../components/PrimaryButton";
import TicketPreviewCard from "../../components/TicketPreviewCard";
import { createTicket, type CreateTicketResponse } from "../../services/api";
import { useAppStore } from "../../store/useAppStore";
import { shareTicketQr } from "../../utils/share";
import { getTheme } from "../../utils/theme";

export default function BookTicketScreen() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  const [form, setForm] = useState({
    username: "",
    eventId: "69df6a37b89293f707579333",
    email: "",
    totalTicket: "1",
    phone: "",
  });
  const [ticket, setTicket] = useState<CreateTicketResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    const totalTicket = Number(form.totalTicket);

    if (
      !form.username.trim() ||
      !form.eventId.trim() ||
      !form.email.trim() ||
      !form.phone.trim()
    ) {
      Alert.alert("Missing details", "Please complete all booking fields.");
      return;
    }

    if (!Number.isInteger(totalTicket) || totalTicket < 1) {
      Alert.alert("Invalid ticket count", "Please enter at least 1 ticket.");
      return;
    }

    setIsSubmitting(true);
    try {
      const createdTicket = await createTicket({
        username: form.username.trim(),
        eventId: form.eventId.trim(),
        email: form.email.trim(),
        totalTicket,
        phone: form.phone.trim(),
      });
      setTicket(createdTicket);
    } catch (error) {
      Alert.alert(
        "Booking failed",
        "We could not create the ticket right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareTicket = async () => {
    if (!ticket) {
      return;
    }

    const shared = await shareTicketQr(ticket);
    if (!shared) {
      await Share.share({
        message:
          `Ticket ${ticket.ticketId} for ${ticket.name}\n${ticket.qrCode ?? ""}`.trim(),
      });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <InfoCard
        title="Issue a new event ticket"
        subtitle="Capture attendee details, create the booking, and share the QR instantly."
      >
        <FormField
          label="Full Name"
          value={form.username}
          onChangeText={(value) => onChange("username", value)}
          placeholder="Aarav Sharma"
        />
        <FormField
          label="Event ID"
          value={form.eventId}
          onChangeText={(value) => onChange("eventId", value)}
          placeholder="69df6a37b89293f707579333"
          autoCapitalize="none"
        />
        <FormField
          label="Email"
          value={form.email}
          onChangeText={(value) => onChange("email", value)}
          placeholder="aarav@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label="Phone"
          value={form.phone}
          onChangeText={(value) => onChange("phone", value)}
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
        />
        <FormField
          label="Total Tickets"
          value={form.totalTicket}
          onChangeText={(value) => onChange("totalTicket", value)}
          placeholder="1"
          keyboardType="number-pad"
        />
        <PrimaryButton
          label={isSubmitting ? "Booking..." : "Book Ticket"}
          onPress={() => void submit()}
          disabled={isSubmitting}
        />
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
  placeholder: {
    borderRadius: 20,
    borderStyle: "dashed",
    borderWidth: 1,
    padding: 18,
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
