import React, { useMemo } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { getMessages, timeAgo, truncateAddress } from "@/lib/api";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";

function ConversationItem({ item, address }) {
  const colors = useColors();
  const isMe = item.sender === address;
  const otherAddress = item.otherAddress || (isMe ? item.receiver : item.sender);
  const profile = item.otherProfile ?? {};
  const displayName =
    profile.displayName || profile.username || truncateAddress(otherAddress);
  const isUnread = (item.unreadCount || 0) > 0;

  return (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: colors.border }]}
      onPress={() => router.push(`/conversation/${otherAddress}`)}
      activeOpacity={0.8}
    >
      <Avatar uri={profile.avatarUrl} username={displayName} size={50} />
      <View style={styles.itemInfo}>
        <View style={styles.itemTop}>
          <Text
            style={[styles.itemName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <View style={styles.itemMeta}>
            {isUnread && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 9 ? "9+" : item.unreadCount}
                </Text>
              </View>
            )}
            <Text style={[styles.itemTime, { color: colors.mutedForeground }]}>
              {timeAgo(item.createdAt)}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.itemMsg, { color: isUnread ? colors.foreground : colors.mutedForeground, fontWeight: isUnread ? "600" : "400" }]
          numberOfLines={1}
        >
          {isMe ? "You: " : ""}
          {item.content}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const colors = useColors();
  const { isAuthenticated, address } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Platform.OS === "web" ? 67 : insets.top + 10;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["/api/messages", address],
    queryFn: () => getMessages(address),
    enabled: !!address,
    refetchInterval: 15_000,
  });

  const conversations = useMemo(() => {
    const map = new Map();
    messages.forEach((message) => {
      const otherAddress =
        message.sender === address ? message.receiver : message.sender;
      const existing = map.get(otherAddress) || {
        latest: message,
        unreadCount: 0,
        otherAddress,
      };

      if ((message.createdAt || "") >= (existing.latest.createdAt || "")) {
        existing.latest = message;
      }
      if (message.receiver === address && !message.readAt) {
        existing.unreadCount += 1;
      }
      map.set(otherAddress, existing);
    });

    return Array.from(map.values())
      .map(({ latest, unreadCount, otherAddress }) => ({
        ...latest,
        otherAddress,
        unreadCount,
        otherProfile:
          latest.sender === address
            ? latest.receiverProfile
            : latest.senderProfile,
      }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [messages, address]);

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Messages
          </Text>
        </View>
        <EmptyState
          icon="chatbubbles-outline"
          title="Sign in to read messages"
          subtitle="Connect with creators and fans on myWorld"
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
          Messages
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No messages yet"
          subtitle="Start a conversation by visiting someone's profile."
          actionLabel="Explore creators"
          onAction={() => router.push("/explore")}
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem item={item} address={address} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
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
  },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemName: { fontSize: 15, fontWeight: "700", flex: 1, marginRight: 8 },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTime: { fontSize: 12 },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadBadgeText: { color: "#09090e", fontSize: 10, fontWeight: "800" },
  itemMsg: { fontSize: 13 },
});
