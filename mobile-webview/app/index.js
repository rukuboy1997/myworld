import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "react-native";
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

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <StatusBar
        barStyle={
          theme === "dark"
            ? "light-content"
            : "dark-content"
        }
        backgroundColor={colors.background}
      />

      <MyWebView setTheme={setTheme} />
    </SafeAreaView>
  );
}
