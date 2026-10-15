import React, { createContext, useContext, useEffect, useState } from "react";
import { sendToNative } from "./nativeBridge";

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "myworld_theme";
const VALID_THEMES = new Set(["dark", "light"]);

function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.has(savedTheme) ? savedTheme : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The app still works if storage is unavailable.
    }

    sendToNative("theme", { theme });
  }, [theme]);

  const setTheme = (newTheme) => {
    if (VALID_THEMES.has(newTheme)) {
      setThemeState(newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
