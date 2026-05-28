import { useColorScheme } from "react-native";
import { darkColors, lightColors } from "@/constants/colors";

export function useColors() {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}
