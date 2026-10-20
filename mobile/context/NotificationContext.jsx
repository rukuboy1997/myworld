import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { registerPushToken, getUnreadMessageCounts } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const NotificationContext = createContext({
  expoPushToken: null,
  unreadCount: 0,
  setUnreadCount: () => {},
  unreadMessageCount: 0,
  refreshUnreadMessageCount: async () => {},
});

async function registerForPushNotificationsAsync() {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    return tokenData.data;
  } catch {
    return null;
  }
}

export function NotificationProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const refreshUnreadMessageCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadMessageCount(0);
      return;
    }
    try {
      const result = await getUnreadMessageCounts();
      setUnreadMessageCount(Math.max(0, Number(result?.count) || 0));
    } catch {
      // Keep the last good count during a transient network failure.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadMessageCount(0);
      return;
    }
    refreshUnreadMessageCount();
    const intervalId = setInterval(refreshUnreadMessageCount, 10000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, user?.address, refreshUnreadMessageCount]);
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        setExpoPushToken(token);
        try {
          await registerPushToken(token, Platform.OS);
        } catch {}
      }
    })();

    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {
        setUnreadCount((c) => c + 1);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.postId) router.push(`/post/${data.postId}`);
        else if (data?.type === "message" && (data?.conversationAddress || data?.actorAddress)) {
          const otherAddress = data.conversationAddress || data.actorAddress;
          router.push(`/conversation/${encodeURIComponent(otherAddress)}`);
        } else if (data?.type === "message") router.push("/messages");
        else if (data?.type === "follow" && data?.actorAddress)
          router.push(`/profile/${data.actorAddress}`);
        else router.push("/notifications");
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, user?.address]);

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        unreadCount,
        setUnreadCount,
        unreadMessageCount,
        refreshUnreadMessageCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
