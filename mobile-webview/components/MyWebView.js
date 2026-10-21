import React, { useEffect, useRef, useState } from "react";
import { BackHandler, Linking, Share } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import NetInfo from "@react-native-community/netinfo";

const APP_URL = "https://myworld-app.vercel.app";

// SDK 54 does not display remote notifications while the app is in the
// foreground unless a notification handler explicitly opts in.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getSafeNotificationTarget(data = {}) {
  const target =
    typeof data.url === "string"
      ? data.url
      : typeof data.path === "string"
        ? data.path
        : "/notifications";
  return target.startsWith("/") && !target.startsWith("//")
    ? target
    : "/notifications";
}

export default function MyWebView({ setTheme }) {
  const webViewRef = useRef(null);
  const webViewReady = useRef(false);
  const pendingPushToken = useRef(null);
  const pendingNotificationTarget = useRef(null);

  const flushPendingBridgeEvents = () => {
    const webView = webViewRef.current;
    if (!webView || !webViewReady.current) return;

    if (pendingPushToken.current) {
      const tokenPayload = JSON.stringify(pendingPushToken.current);
      pendingPushToken.current = null;
      webView.injectJavaScript(
        `window.__myWorldPushToken = ${tokenPayload};window.dispatchEvent(new CustomEvent("myworld-push-token",{detail:window.__myWorldPushToken}));true;`
      );
    }

    if (pendingNotificationTarget.current) {
      const target = JSON.stringify(pendingNotificationTarget.current);
      pendingNotificationTarget.current = null;
      webView.injectJavaScript(
        `window.location.href = "https://myworld-app.vercel.app" + ${target};true;`
      );
    }
  };

  const queueNotificationTarget = (target) => {
    pendingNotificationTarget.current = target;
    flushPendingBridgeEvents();
  };

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  const notificationResponseListener = useRef(null);
  const lastHandledNotificationResponse = useRef({ key: null, at: 0 });

  // Register this installation for Expo push notifications and route notification taps
  // back into the myWorld WebView.
  useEffect(() => {
    let mounted = true;

    const registerForPushNotifications = async () => {
      try {
        if (!Device.isDevice) return;
        if (Platform.OS === "android") {
          // Channel/category setup must not prevent push-token registration.
          // Otherwise a native setup issue can silently stop all future pushes.
          try {
            await Notifications.setNotificationChannelAsync("default", {
              name: "myWorld notifications",
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: [0, 250, 250, 250],
              lightColor: "#00C8FF",
            });
          } catch (error) {
            console.warn("Unable to configure notification channel:", error);
          }

          try {
            await Notifications.setNotificationCategoryAsync("myworldmessage", [
              {
                identifier: "reply",
                buttonTitle: "Reply",
                textInput: { submitButtonTitle: "Send" },
                options: { opensAppToForeground: true },
              },
              {
                identifier: "mark_as_read",
                buttonTitle: "Mark as read",
                options: { opensAppToForeground: true },
              },
            ]);
          } catch (error) {
            console.warn("Unable to configure message notification actions:", error);
          }
        }
        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== "granted") {
          permission = await Notifications.requestPermissionsAsync();
        }
        if (permission.status !== "granted") return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
          console.warn("Expo push notifications require an EAS project ID.");
          return;
        }
        const result = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!result.data) {
          console.warn("Expo did not return a push token for this installation.");
          return;
        }
        console.log("myWorld Expo push token acquired.");
        if (!mounted) return;
        // The native token can arrive before the website has finished loading.
        // Queue it until the WebView is ready so registration is never silently lost.
        pendingPushToken.current = {
          token: result.data,
          platform: Platform.OS,
        };
        flushPendingBridgeEvents();
      } catch (error) {
        console.warn("Unable to register for push notifications:", error);
      }
    };

    registerForPushNotifications();

    const handleNotificationResponse = (response) => {
      if (!response) return;
      const action = response.actionIdentifier || Notifications.DEFAULT_ACTION_IDENTIFIER;
      const userText = String(response.userText || "");
      const requestId = response.notification?.request?.identifier || "";
      const responseKey = [requestId, action, userText].join("|");
      const now = Date.now();
      const previousResponse = lastHandledNotificationResponse.current;
      // The live response listener and cold-start lookup can surface the same
      // response. Ignore that duplicate without blocking a later real reply.
      if (previousResponse.key === responseKey && now - previousResponse.at < 5000) return;
      lastHandledNotificationResponse.current = { key: responseKey, at: now };

      const data = response?.notification?.request?.content?.data || {};
      const conversationAddress =
        typeof data.conversationAddress === "string"
          ? data.conversationAddress
          : typeof data.actorAddress === "string"
            ? data.actorAddress
            : "";
      const isMessageAction =
        data.type === "message" &&
        conversationAddress &&
        (action === "reply" || action === "mark_as_read" || action === "mark-as-read");

      if (isMessageAction && (action !== "reply" || String(response?.userText || "").trim())) {
        const params = new URLSearchParams();
        params.set("with", conversationAddress);
        params.set("nativeAction", action);
        params.set("nativeActionId", String(now));
        if (action === "reply") params.set("replyText", userText.trim());
        queueNotificationTarget("/messages?" + params.toString());
        return;
      }

      queueNotificationTarget(getSafeNotificationTarget(data));
      // Prevent a handled action from being replayed on the next app launch.
      if (typeof Notifications.clearLastNotificationResponseAsync === "function") {
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    };

    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // Handle a notification or notification action that launched the app from
    // a fully closed state, not only taps received while it was already open.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!mounted || !response) return;
        handleNotificationResponse(response);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      notificationResponseListener.current?.remove();
    };
  }, []);



  // --------------------------------------------------
  // NETWORK MONITOR
  // --------------------------------------------------
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected === true &&
        state.isInternetReachable !== false;

      setIsOffline(!connected);

      // Internet has returned.
      // Do not reload the WebView automatically.
      if (connected) {
        setLoadError(false);
      }
    });

    return unsubscribe;
  }, []);

  // --------------------------------------------------
  // ANDROID BACK BUTTON
  // Keep back navigation inside myWorld whenever WebView history exists.
  // Returning false at the root lets Android close/minimize the app normally.
  // --------------------------------------------------
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  // --------------------------------------------------
  // NAVIGATION SAFETY
  // Keep myWorld pages in the WebView; open external destinations in the
  // device's browser/app instead of trapping users inside the wrapper.
  // --------------------------------------------------
  const handleShouldStartLoad = (request) => {
    const url = request?.url || "";

    if (
      !url ||
      url === "about:blank" ||
      url.startsWith("blob:") ||
      url.startsWith("data:")
    ) {
      return true;
    }

    const appOrigin = "https://myworld-app.vercel.app";
    if (
      url === appOrigin ||
      url.startsWith(`${appOrigin}/`) ||
      url.startsWith(`${appOrigin}?`) ||
      url.startsWith(`${appOrigin}#`)
    ) {
      return true;
    }

    if (url.startsWith("mailto:") || url.startsWith("tel:")) {
      Linking.openURL(url).catch(() => {});
      return false;
    }

    // Never load insecure HTTP pages or arbitrary destinations inside the app.
    if (url.startsWith("https://")) {
      Linking.openURL(url).catch(() => {});
    }

    return false;
  };

  // --------------------------------------------------
  // WEB -> NATIVE MESSAGE BRIDGE
  // --------------------------------------------------
  const handleMessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.nativeEvent.data);

      switch (type) {
        case "native-share": {
          const title = typeof payload?.title === "string" ? payload.title : "myWorld";
          const message = typeof payload?.text === "string" ? payload.text : "";
          const url = typeof payload?.url === "string" ? payload.url : "";
          const shareMessage = [message, url].filter(Boolean).join("\n");
          Share.share(
            { title, message: shareMessage, url },
            { dialogTitle: title }
          ).catch((error) => {
            console.warn("Unable to open native share sheet:", error);
          });
          break;
        }

        case "pick-status-media": {
          (async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsEditing: false, quality: 0.9, base64: true });
              if (result.canceled || !result.assets?.[0]) return;
              const asset = result.assets[0];
              const isVideo = asset.type === "video";
              const maxBytes = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
              if (typeof asset.fileSize === "number" && asset.fileSize > maxBytes) {
                throw new Error(isVideo ? "Videos must be 25 MB or smaller." : "Images must be 10 MB or smaller.");
              }
              let base64 = asset.base64 || null;
              if (!base64 && asset.type === "video" && asset.uri) {
                const response = await fetch(asset.uri);
                const bytes = new Uint8Array(await response.arrayBuffer());
                let binary = "";
                for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
                base64 = globalThis.btoa(binary);
              }
              if (!base64) throw new Error("Could not read the selected media. Please try another file.");
              const mimeType = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
              const fileName = asset.fileName || ("myworld-" + Date.now() + "." + (mimeType.split("/")[1] || "jpg"));
              const encoded = encodeURIComponent(JSON.stringify({ base64, mimeType, fileName }));
              webViewRef.current?.injectJavaScript('window.dispatchEvent(new CustomEvent("myworld-native-media-data", {detail: JSON.parse(decodeURIComponent("' + encoded + '"))})); true;');
            } catch (error) {
              const msg = encodeURIComponent(error?.message || "Could not open media picker.");
              webViewRef.current?.injectJavaScript('window.dispatchEvent(new CustomEvent("myworld-native-media-error", {detail: decodeURIComponent("' + msg + '")})); true;');
            }
          })();
          break;
        }

        case "theme":
          if (payload?.theme === "dark" || payload?.theme === "light") {
            setTheme(payload.theme);
          }
          break;

        default:
          console.log("Unhandled message:", type, payload);
      }
    } catch (error) {
      console.error("Bridge Error:", error);
    }
  };

  // --------------------------------------------------
  // WEBVIEW LOAD EVENTS
  // --------------------------------------------------
  const handleLoadStart = () => {
    setIsLoading(true);
  };

  const handleLoadEnd = () => {
    webViewReady.current = true;
    setIsLoading(false);
    setHasLoadedOnce(true);
    setLoadError(false);
    flushPendingBridgeEvents();
  };

  const handleLoadError = () => {
    setIsLoading(false);

    // If the app has never successfully loaded,
    // show the custom offline/error screen.
    if (!hasLoadedOnce) {
      setLoadError(true);
    }
  };

  // --------------------------------------------------
  // RETRY
  // --------------------------------------------------
  const handleRetry = async () => {
    const state = await NetInfo.fetch();

    const connected =
      state.isConnected === true &&
      state.isInternetReachable !== false;

    if (!connected) {
      setIsOffline(true);
      setLoadError(true);
      return;
    }

    setIsOffline(false);
    setLoadError(false);
    setIsLoading(true);

    webViewRef.current?.reload();
  };

  return (
    <View style={styles.container}>
      {/* ---------------------------------------------
          WEBVIEW
      --------------------------------------------- */}
      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        onMessage={handleMessage}
        onNavigationStateChange={(state) => setCanGoBack(Boolean(state.canGoBack))}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleLoadError}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="never"
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={`
          window.isNativeApp = true;
          true;
        `}
        style={styles.webView}
      />

      {/* ---------------------------------------------
          INITIAL LOADING SCREEN
      --------------------------------------------- */}
      {isLoading && !hasLoadedOnce && !loadError && (
        <View style={styles.fullScreenOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingTitle}>Loading myWorld</Text>
            <Text style={styles.loadingText}>
              Please wait while we connect you...
            </Text>
          </View>
        </View>
      )}

      {/* ---------------------------------------------
          INITIAL OFFLINE / LOAD ERROR
      --------------------------------------------- */}
      {loadError && !hasLoadedOnce && (
        <View style={styles.fullScreenOverlay}>
          <View style={styles.errorCard}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>!</Text>
            </View>

            <Text style={styles.errorTitle}>
              No connection
            </Text>

            <Text style={styles.errorText}>
              We couldn't connect to myWorld. Please check your
              internet connection and try again.
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ---------------------------------------------
          CONNECTION LOST BANNER
          Only shown AFTER the website has loaded.
      --------------------------------------------- */}
      {isOffline && hasLoadedOnce && (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineDot} />

          <View style={styles.bannerTextContainer}>
            <Text style={styles.offlineTitle}>
              No network connection
            </Text>

            <Text style={styles.offlineSubtitle}>
              You're offline. Some features may be unavailable.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090B",
  },

  webView: {
    flex: 1,
    backgroundColor: "#09090B",
  },

  // --------------------------------------------------
  // FULL SCREEN OVERLAY
  // --------------------------------------------------

  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#09090B",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    zIndex: 20,
  },

  loadingCard: {
    alignItems: "center",
    maxWidth: 320,
  },

  loadingTitle: {
    marginTop: 20,
    color: "#FAFAFA",
    fontSize: 20,
    fontWeight: "700",
  },

  loadingText: {
    marginTop: 8,
    color: "#A1A1AA",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },

  // --------------------------------------------------
  // ERROR SCREEN
  // --------------------------------------------------

  errorCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#27272A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },

  iconText: {
    color: "#FAFAFA",
    fontSize: 28,
    fontWeight: "800",
  },

  errorTitle: {
    color: "#FAFAFA",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },

  errorText: {
    marginTop: 10,
    color: "#A1A1AA",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },

  retryButton: {
    marginTop: 24,
    minWidth: 140,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#00C2FF",
    alignItems: "center",
  },

  retryButtonText: {
    color: "#09090B",
    fontSize: 15,
    fontWeight: "800",
  },

  // --------------------------------------------------
  // OFFLINE BANNER
  // --------------------------------------------------

  offlineBanner: {
    position: "absolute",
    top: 12,
    left: 14,
    right: 14,

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 15,
    paddingVertical: 12,

    borderRadius: 16,

    backgroundColor: "rgba(24, 24, 27, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",

    zIndex: 30,
  },

  offlineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#F59E0B",
    marginRight: 11,
  },

  bannerTextContainer: {
    flex: 1,
  },

  offlineTitle: {
    color: "#FAFAFA",
    fontSize: 14,
    fontWeight: "700",
  },

  offlineSubtitle: {
    marginTop: 2,
    color: "#A1A1AA",
    fontSize: 12,
    lineHeight: 17,
  },
});
