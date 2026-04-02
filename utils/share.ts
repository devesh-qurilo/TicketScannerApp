import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { type CreateTicketResponse } from "../services/api";

function getBase64Payload(value: string) {
  if (value.startsWith("data:image")) {
    return value.split(",")[1] ?? null;
  }

  return null;
}

export async function shareTicketQr(ticket: CreateTicketResponse) {
  if (!ticket.qrCode) {
    return false;
  }

  const base64Payload = getBase64Payload(ticket.qrCode);
  if (!base64Payload) {
    return false;
  }

  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  const fileUri = `${FileSystem.cacheDirectory}${ticket.ticketId}.png`;
  await FileSystem.writeAsStringAsync(fileUri, base64Payload, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(fileUri);
  return true;
}
