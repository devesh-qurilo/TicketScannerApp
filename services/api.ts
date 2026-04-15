import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { type TicketScanRecord } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "https://4frnn03l-8000.inc1.devtunnels.ms";
const OFFLINE_QUEUE_KEY = "offline-verification-queue";
const USE_MOCK_API = API_BASE_URL.includes("your-api.com");

export type VerifyTicketResponse = {
  status: "valid" | "invalid" | "used";
  attendeeName?: string;
  message?: string;
  ticketId?: string;
  email?: string;
  totalTicket?: number;
  allowVisitors?: number;
  paymentStatus?: string;
  isUsed?: boolean;
};

export type TicketDetailResponse = {
  status: "valid" | "invalid" | "used";
  message: string;
  ticketId: string;
  attendeeName?: string;
  email?: string;
  phone?: string;
  totalTicket?: number;
  amount?: number;
  allowVisitors?: number;
  paymentStatus?: string;
  isUsed?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type VerifyTicketEntryResponse = {
  status: boolean;
  message: string;
};

type VerifyTicketApiData = {
  _id: string;
  email: string;
  u_id: string;
  phone: string;
  totalTicket: number;
  amount: number;
  allowVisitors: number;
  paymentStatus: string;
  isUsed: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

type VerifyTicketApiResponse = {
  status: boolean;
  message: string;
  data?: VerifyTicketApiData;
};

export type CreateTicketPayload = {
  name: string;
  email: string;
  phone: string;
};

export type CreateTicketResponse = CreateTicketPayload & {
  ticketId: string;
  qrCode?: string;
};

export type LoginResponse = {
  token: string;
  name: string;
  email: string;
  role: "Volunteer";
  assignedEvent: string;
};

type VolunteerLoginApiResponse = {
  status: boolean;
  message: string;
  data: string;
};

export type SyncScanHistoryResponse = {
  syncedIds: string[];
  failedIds: string[];
  syncedAt: string;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getAuthConfig() {
  const token = useAppStore.getState().user?.token;

  if (!token) {
    return {};
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

async function mockCreateTicket(
  payload: CreateTicketPayload,
): Promise<CreateTicketResponse> {
  await sleep(700);

  return {
    ...payload,
    ticketId: `TKT-${Date.now().toString().slice(-8)}`,
  };
}

async function mockVerifyTicket(
  ticketId: string,
): Promise<VerifyTicketResponse> {
  await sleep(500);

  if (ticketId.toLowerCase().includes("used")) {
    return {
      status: "used",
      attendeeName: "Existing Guest",
      message: "This ticket has already been redeemed.",
    };
  }

  if (ticketId.toLowerCase().includes("invalid")) {
    return {
      status: "invalid",
      message: "Ticket not recognised for this event.",
    };
  }

  return {
    status: "valid",
    attendeeName: "Demo Guest",
    message: "Ticket verified successfully.",
    ticketId,
  };
}

async function mockFetchTicketDetail(
  ticketId: string,
): Promise<TicketDetailResponse> {
  await sleep(500);

  if (ticketId.toLowerCase().includes("invalid")) {
    return {
      status: "invalid",
      message: "Ticket not recognised for this event.",
      ticketId,
    };
  }

  const isUsed = ticketId.toLowerCase().includes("used");

  return {
    status: isUsed ? "used" : "valid",
    message: isUsed
      ? "This ticket has already been used."
      : "Ticket details loaded successfully.",
    ticketId,
    attendeeName: "demo@example.com",
    email: "demo@example.com",
    phone: "1234567890",
    totalTicket: 5,
    amount: 100,
    allowVisitors: isUsed ? 0 : 5,
    paymentStatus: "pending",
    isUsed,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function mockLogin(email: string): Promise<LoginResponse> {
  await sleep(500);

  return {
    token: `mock-token-${Date.now()}`,
    name: "Event Volunteer",
    email,
    role: "Volunteer",
    assignedEvent: "Main Stage Gate A",
  };
}

function formatVolunteerName(email: string): string {
  const [localPart = "Volunteer"] = email.split("@");
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();

  if (!cleaned) {
    return "Volunteer";
  }

  return cleaned.replace(/\b\w/g, (character) => character.toUpperCase());
}

function mapLoginResponse(email: string, token: string): LoginResponse {
  return {
    token,
    email,
    name: formatVolunteerName(email),
    role: "Volunteer",
    assignedEvent: "Assigned at check-in",
  };
}

async function mockSyncScanHistory(
  records: TicketScanRecord[],
): Promise<SyncScanHistoryResponse> {
  await sleep(700);

  return {
    syncedIds: records.map((record) => record.id),
    failedIds: [],
    syncedAt: new Date().toISOString(),
  };
}

export async function createTicket(
  payload: CreateTicketPayload,
): Promise<CreateTicketResponse> {
  if (USE_MOCK_API) {
    return mockCreateTicket(payload);
  }

  const response = await api.post<CreateTicketResponse>(
    "/api/tickets/create",
    payload,
  );
  return response.data;
}

export async function verifyTicket(
  ticketId: string,
): Promise<VerifyTicketResponse> {
  if (USE_MOCK_API) {
    return mockVerifyTicket(ticketId);
  }

  const response = await api.get<VerifyTicketApiResponse>(
    "/api/v1/booking/ticket-detail",
    {
      ...getAuthConfig(),
      params: {
        u_id: ticketId,
      },
    },
  );

  if (!response.data.status || !response.data.data) {
    return {
      status: "invalid",
      ticketId,
      message:
        response.data.message || "The scanned ticket could not be verified.",
    };
  }

  const booking = response.data.data;

  return {
    status: booking.isUsed ? "used" : "valid",
    ticketId: booking.u_id,
    attendeeName: booking.email,
    email: booking.email,
    totalTicket: booking.totalTicket,
    allowVisitors: booking.allowVisitors,
    paymentStatus: booking.paymentStatus,
    isUsed: booking.isUsed,
    message: booking.isUsed
      ? `Ticket already used for ${booking.email}.`
      : `${booking.email} is valid for ${booking.allowVisitors} visitor${booking.allowVisitors === 1 ? "" : "s"}.`,
  };
}

export async function fetchTicketDetail(
  ticketId: string,
): Promise<TicketDetailResponse> {
  if (USE_MOCK_API) {
    return mockFetchTicketDetail(ticketId);
  }

  const response = await api.get<VerifyTicketApiResponse>(
    "/api/v1/booking/ticket-detail",
    {
      params: {
        u_id: ticketId,
      },
    },
  );

  if (!response.data.status || !response.data.data) {
    return {
      status: "invalid",
      message:
        response.data.message || "The scanned ticket could not be found.",
      ticketId,
    };
  }

  const booking = response.data.data;

  return {
    status: booking.isUsed ? "used" : "valid",
    message: booking.isUsed
      ? `Ticket already used for ${booking.email}.`
      : "Ticket details loaded successfully.",
    ticketId: booking.u_id,
    attendeeName: booking.email,
    email: booking.email,
    phone: booking.phone,
    totalTicket: booking.totalTicket,
    amount: booking.amount,
    allowVisitors: booking.allowVisitors,
    paymentStatus: booking.paymentStatus,
    isUsed: booking.isUsed,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

export async function verifyTicketEntry(
  ticketId: string,
  allowUser: number,
): Promise<VerifyTicketEntryResponse> {
  if (USE_MOCK_API) {
    await sleep(500);
    return {
      status: true,
      message: `Entry allowed for ${allowUser} visitor${allowUser === 1 ? "" : "s"}.`,
    };
  }

  const response = await api.put<VerifyTicketEntryResponse>(
    "/api/v1/booking/ticket-verify",
    {
      allow_user: allowUser,
    },
    {
      ...getAuthConfig(),
      params: {
        u_id: ticketId,
      },
    },
  );

  return {
    status: response.data.status,
    message: response.data.message || "Ticket verification completed.",
  };
}

export async function loginVolunteer(
  email: string,
  password: string,
): Promise<LoginResponse> {
  if (USE_MOCK_API) {
    return mockLogin(email);
  }

  const response = await api.post<VolunteerLoginApiResponse>(
    "/api/v1/admin/login-volunteer",
    {
      email,
      password,
    },
  );

  if (!response.data.status || !response.data.data) {
    throw new Error(response.data.message || "Unable to log in.");
  }

  return mapLoginResponse(email, response.data.data);
}

export async function syncScanHistory(
  records: TicketScanRecord[],
): Promise<SyncScanHistoryResponse> {
  if (USE_MOCK_API) {
    return mockSyncScanHistory(records);
  }

  const response = await api.post<SyncScanHistoryResponse>(
    "/api/tickets/sync-scans",
    {
      scans: records,
    },
  );
  return response.data;
}

export async function getOfflineQueue(): Promise<string[]> {
  const rawValue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  return rawValue ? (JSON.parse(rawValue) as string[]) : [];
}

export async function enqueueVerification(ticketId: string): Promise<string[]> {
  const currentQueue = await getOfflineQueue();
  const nextQueue = Array.from(new Set([...currentQueue, ticketId]));
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQueue));
  return nextQueue;
}

export async function retryQueuedVerifications(): Promise<string[]> {
  const queue = await getOfflineQueue();
  const remaining: string[] = [];

  for (const ticketId of queue) {
    try {
      await verifyTicket(ticketId);
    } catch (error) {
      remaining.push(ticketId);
    }
  }

  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return remaining;
}
