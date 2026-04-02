import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type LoginResponse } from "../services/api";

export type TicketScanRecord = {
  ticketId: string;
  status: "valid" | "invalid" | "used";
  checkedAt: string;
};

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type AppStore = {
  user: LoginResponse | null;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  lastScannedTicket: TicketScanRecord | null;
  offlineQueue: string[];
  login: (user: LoginResponse) => void;
  logout: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  hydrateResolvedTheme: () => void;
  setLastScannedTicket: (ticket: TicketScanRecord | null) => void;
  setOfflineQueue: (queue: string[]) => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      user: null,
      themeMode: "light",
      resolvedTheme: "light",
      lastScannedTicket: null,
      offlineQueue: [],
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      setThemeMode: (mode) =>
        set({
          themeMode: mode,
          resolvedTheme: mode === "dark" ? "dark" : "light",
        }),
      toggleDarkMode: () => {
        const current = get().resolvedTheme;
        set({
          themeMode: current === "dark" ? "light" : "dark",
          resolvedTheme: current === "dark" ? "light" : "dark",
        });
      },
      hydrateResolvedTheme: () => {
        const mode = get().themeMode;
        const nextResolvedTheme = mode === "dark" ? "dark" : "light";
        if (get().resolvedTheme !== nextResolvedTheme) {
          set({
            resolvedTheme: nextResolvedTheme,
          });
        }
      },
      setLastScannedTicket: (ticket) => set({ lastScannedTicket: ticket }),
      setOfflineQueue: (queue) => set({ offlineQueue: queue }),
    }),
    {
      name: "ticket-system-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        themeMode: state.themeMode,
        resolvedTheme: state.resolvedTheme,
        lastScannedTicket: state.lastScannedTicket,
        offlineQueue: state.offlineQueue,
      }),
    },
  ),
);
