import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const API_BASE_URL = "https://your-api.com";
const OFFLINE_QUEUE_KEY = "offline-verification-queue";
const USE_MOCK_API = API_BASE_URL.includes("your-api.com");

export type VerifyTicketResponse = {
  status: "valid" | "invalid" | "used";
  attendeeName?: string;
  message?: string;
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

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockCreateTicket(
  payload: CreateTicketPayload,
): Promise<CreateTicketResponse> {
  await sleep(700);

  return {
    ...payload,
    ticketId: `TKT-${Date.now().toString().slice(-8)}`,
  };
}

async function mockVerifyTicket(ticketId: string): Promise<VerifyTicketResponse> {
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

export async function createTicket(
  payload: CreateTicketPayload,
): Promise<CreateTicketResponse> {
  if (USE_MOCK_API) {
    return mockCreateTicket(payload);
  }

  const response = await api.post<CreateTicketResponse>("/api/tickets/create", payload);
  return response.data;
}

export async function verifyTicket(ticketId: string): Promise<VerifyTicketResponse> {
  if (USE_MOCK_API) {
    return mockVerifyTicket(ticketId);
  }

  const response = await api.post<VerifyTicketResponse>("/api/tickets/verify", { ticketId });
  return response.data;
}

export async function loginVolunteer(
  email: string,
  password: string,
): Promise<LoginResponse> {
  if (USE_MOCK_API) {
    return mockLogin(email);
  }

  const response = await api.post<LoginResponse>("/api/auth/login", {
    email,
    password,
  });
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
