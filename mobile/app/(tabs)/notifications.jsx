import React, { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import {
  getNotifications,
  markNotificationsRead,
  timeAgo,
  truncateAddress,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useNotifications } from "@/context/NotificationContext";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";

const NOTIF_ICONS = {
  like: { icon: "heart", color: "#ef4444" },
  comment: { icon: "chatbubble", color: "#3b82f6" },
  follow: { icon: "person-add", color: "#10b981" },
  message: { icon: "chatbubbles", color: "#f59e0b" },
};

function NotifItem({ item }) {
  const colors = useColors();
  const conf = NOTIF_ICONS[item.type] ?? {
    icon: "notifications",
    color: colors.primary,
  };
  const profile = item.actorProfile ?? {};
  const name =
    profile.displayName ||
    profile.username ||
    truncateAddress(item.actorAddress || "");

  const handlePress = () => {
    if (item.postId) router.push(`/post/${item.postId}`);
    else if (item.type === "follow" && item.actorAddress)
      router.push(`/profile/${item.actorAddress}`);
    else if (item.type === "message") router.push("/messages");
  };

  return (
    <TouchableOpacity
      style={[
        styles.item,
        {
          backgroundColor: item.read ? "transparent" : colors.primaryMuted,
          borderBottomColor: colors.border,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={{ position: "relative" }}>
        <Avatar uri={profile.avatarUrl} username={name} size={44} />
        <View style={[styles.iconBadge, { backgroundColor: conf.color }]}>
          <Ionicons name={conf.icon} size={10} color="#fff" />
        </View>
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemText, { color: colors.foreground }]}>
          <Text style={{ fontWeight: "700" }}>{name}</Text>{" "}
          <Text style={{ color: colors.foregroundSecondary }}>
            {item.excerpt}
          </Text>
        </Text>
        <Text style={[styles.itemTime, { color: colors.mutedForeground }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </View>
      {!item.read && (
        <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
      )}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const { setUnreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Platform.OS === "web" ? 67 : insets.top + 10;

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: getNotifications,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    markNotificationsRead()
      .then(() => {
        setUnreadCount(0);
        queryClient.invalidateQueries({
          queryKey: ["/api/notifications/unread-count"],
        });
      })
      .catch(() => {});
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Notifications
          </Text>
        </View>
        <EmptyState
          icon="notifications-outline"
          title="Sign in to see notifications"
          subtitle="Get alerted when someone likes, comments, or follows you"
          actionLabel="Sign in"
          onAction={() => router.push("/auth")}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: headerPaddingTop, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Notifications
        </Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Ionicons name="refresh" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="All caught up"
          subtitle="You have no notifications yet. Start interacting with creators!"
          actionLabel="Explore"
          onAction={() => router.push("/explore")}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotifItem item={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1 },
  itemText: { fontSize: 14, lineHeight: 20 },
  itemTime: { fontSize: 12, marginTop: 3 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
