import { useEffect, useState } from "react";
import { Platform, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as NavigationBar from "expo-navigation-bar";
import MyWebView from "../components/MyWebView";

const THEME_COLORS = {
  dark: {
    background: "#09090B",
    foreground: "#FAFAFA",
  },
  light: {
    background: "#F7F7F9",
    foreground: "#121214",
  },
};

export default function Home() {
  const [theme, setTheme] = useState("dark");
  const colors = THEME_COLORS[theme];

  // Keep Android's native navigation area visually connected to the app theme.
  // This is Android-only; iOS manages its home indicator separately.
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let cancelled = false;

    const syncNavigationBar = async () => {
      try {
        await NavigationBar.setBackgroundColorAsync(colors.background);
        if (!cancelled) {
          await NavigationBar.setButtonStyleAsync(
            theme === "dark" ? "light" : "dark"
          );
        }
      } catch (error) {
        // Some Android navigation modes do not allow changing every system bar
        // property. A failure here must never prevent the app from rendering.
        console.warn("Unable to sync Android navigation bar:", error);
      }
    };

    syncNavigationBar();

    return () => {
      cancelled = true;
    };
  }, [colors.background, theme]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <MyWebView setTheme={setTheme} />
    </SafeAreaView>
  );
}
