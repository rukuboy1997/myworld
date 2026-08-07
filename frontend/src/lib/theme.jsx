import React, { createContext, useContext, useEffect, useState } from "react";
import { sendToNative } from "./nativeBridge";

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "myworld_theme";

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    // Try to get saved preference
    try {
      return localStorage.getItem(STORAGE_KEY) || "dark";
    } catch {
      return "dark";
    }
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const root = document.documentElement;

    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Silently fail if localStorage not available
    }

    sendToNative("theme", {
      theme,
    });
  }, [theme, isMounted]);

  const setTheme = (newTheme) => {
    if (newTheme === "light" || newTheme === "dark") {
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
