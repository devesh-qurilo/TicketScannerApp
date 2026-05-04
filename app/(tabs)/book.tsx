import { useState } from "react";
import { ScrollView, StyleSheet, Share } from "react-native";

import FormField from "../../components/FormField";
import InfoCard from "../../components/InfoCard";
import PrimaryButton from "../../components/PrimaryButton";
import StatusBanner from "../../components/StatusBanner";
import TicketPreviewCard from "../../components/TicketPreviewCard";
import { createTicket, type CreateTicketResponse } from "../../services/api";
import { useAppStore } from "../../store/useAppStore";
import { shareTicketQr } from "../../utils/share";
import { getTheme } from "../../utils/theme";

type BookingState = {
  status: "idle" | "success" | "error" | "warning";
  title: string;
  message: string;
};

const defaultBookingState: BookingState = {
  status: "idle",
  title: "Ready to book",
  message: "Enter attendee details and create the ticket.",
};

const initialFormState = {
  username: "",
  eventId: "69f83bdf49a8758aba27ba80",
  email: "",
  totalTicket: "1",
  phone: "",
};

export default function BookTicketScreen() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  const [form, setForm] = useState(initialFormState);
  const [ticket, setTicket] = useState<CreateTicketResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingState, setBookingState] =
    useState<BookingState>(defaultBookingState);

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
      setBookingState({
        status: "error",
        title: "Missing details",
        message: "Please complete all booking fields.",
      });
      return;
    }

    if (!Number.isInteger(totalTicket) || totalTicket < 1) {
      setBookingState({
        status: "error",
        title: "Invalid ticket count",
        message: "Please enter at least 1 ticket.",
      });
      return;
    }

    setTicket(null);
    setIsSubmitting(true);
    setBookingState({
      status: "warning",
      title: "Creating ticket",
      message: "Please wait while we create the booking.",
    });

    try {
      const createdTicket = await createTicket({
        username: form.username.trim(),
        eventId: form.eventId.trim(),
        email: form.email.trim(),
        totalTicket,
        phone: form.phone.trim(),
      });
      setTicket(createdTicket);
      setForm(initialFormState);
      setBookingState({
        status: "success",
        title: "Ticket booked successfully",
        message: `Ticket is ready to share on email and whatsapp`,
      });
    } catch {
      setBookingState({
        status: "error",
        title: "Booking failed",
        message: "We could not create the ticket right now.",
      });
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
      <StatusBanner
        status={bookingState.status}
        title={bookingState.title}
        message={bookingState.message}
      />

      <InfoCard
        title="Issue a new event ticket"
        subtitle="Capture attendee details, create the booking,"
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
          placeholder="69f83bdf49a8758aba27ba80"
          editable={false} // This prevents the user from typing
          selectTextOnFocus={false}
          style={{ opacity: 0.5, backgroundColor: "#f0f0f0" }} // Visual feedback
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
          placeholder="9919090106"
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
});
