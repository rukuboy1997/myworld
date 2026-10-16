import React, { useEffect, useRef, useState } from "react";
import { BackHandler, Linking } from "react-native";
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

export default function MyWebView({ setTheme }) {
  const webViewRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

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

    if (url.startsWith("https://myworld-app.vercel.app/")) {
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
    setIsLoading(false);
    setHasLoadedOnce(true);
    setLoadError(false);
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
