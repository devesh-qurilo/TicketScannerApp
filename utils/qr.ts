export function extractTicketId(rawValue: string): string | null {
  if (!rawValue.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { ticketId?: string; id?: string };
    return parsed.ticketId ?? parsed.id ?? rawValue.trim();
  } catch (error) {
    if (rawValue.startsWith("http")) {
      const url = new URL(rawValue);
      return url.searchParams.get("ticketId") ?? rawValue.trim();
    }

    return rawValue.trim();
  }
}
