export type Theme = {
  colors: {
    background: string;
    card: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    primary: string;
    onPrimary: string;
    success: string;
    successSubtle: string;
    error: string;
    errorSubtle: string;
    warning: string;
    warningSubtle: string;
    shadow: string;
  };
};

const lightTheme: Theme = {
  colors: {
    background: "#F4F7FB",
    card: "#FFFFFF",
    surface: "#EDF2F7",
    border: "#D7E0EA",
    text: "#14213D",
    muted: "#5C677D",
    primary: "#0E7490",
    onPrimary: "#F8FAFC",
    success: "#7AE582",
    successSubtle: "#E9FFF1",
    error: "#FF6B6B",
    errorSubtle: "#FFF0F0",
    warning: "#FFD166",
    warningSubtle: "#FFF8E8",
    shadow: "#0F172A",
  },
};

const darkTheme: Theme = {
  colors: {
    background: "#08111F",
    card: "#0F1B2D",
    surface: "#14243A",
    border: "#22344D",
    text: "#E5EEF8",
    muted: "#9CB2C9",
    primary: "#4CC9F0",
    onPrimary: "#08111F",
    success: "#80ED99",
    successSubtle: "#0F2E1F",
    error: "#FF7B7B",
    errorSubtle: "#2E1616",
    warning: "#FFD166",
    warningSubtle: "#2A2214",
    shadow: "#020617",
  },
};

export function getTheme(mode: "light" | "dark"): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}
