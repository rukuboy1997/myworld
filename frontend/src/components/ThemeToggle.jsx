import React from "react";
import { useTheme } from "../lib/theme.jsx";
import { Sun, Moon } from "./icons.jsx";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${nextTheme} mode`}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "light"}
      className="interactive-surface inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-offset-2"
    >
      {theme === "dark" ? (
        <Sun size={20} strokeWidth={1.8} className="transition-transform duration-300" aria-hidden="true" />
      ) : (
        <Moon size={20} strokeWidth={1.8} className="transition-transform duration-300" aria-hidden="true" />
      )}
    </button>
  );
}
