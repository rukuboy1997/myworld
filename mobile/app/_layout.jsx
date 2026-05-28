import React, { useEffect } from "react";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { StatusBar } from "expo-status-bar";
import { darkColors, lightColors } from "@/constants/colors";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import ErrorBoundary from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === "dark" ? darkColors : lightColors;

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <NotificationProvider>
                <KeyboardProvider>
                  <StatusBar
                    style={colorScheme === "dark" ? "light" : "dark"}
                  />
                  <Stack
                    screenOptions={{
                      headerStyle: { backgroundColor: colors.background },
                      headerTintColor: colors.foreground,
                      headerTitleStyle: {
                        fontFamily: "PlusJakartaSans_700Bold",
                        fontSize: 17,
                      },
                      headerShadowVisible: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Stack.Screen
                      name="(tabs)"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="profile/[address]"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="profile/edit"
                      options={{
                        title: "Edit Profile",
                        headerBackTitle: "Back",
                      }}
                    />
                    <Stack.Screen
                      name="post/[id]"
                      options={{ title: "Post", headerBackTitle: "Back" }}
                    />
                    <Stack.Screen
                      name="conversation/[address]"
                      options={{ headerBackTitle: "Back" }}
                    />
                    <Stack.Screen
                      name="auth"
                      options={{
                        presentation: "modal",
                        headerShown: false,
                      }}
                    />
                  </Stack>
                </KeyboardProvider>
              </NotificationProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
