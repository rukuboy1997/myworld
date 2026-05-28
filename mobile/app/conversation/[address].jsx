import React, { useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import {
  getConversation,
  getProfile,
  sendMessage,
  timeAgo,
  truncateAddress,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import Avatar from "@/components/Avatar";

function MessageBubble({ msg, isMe, colors }) {
  return (
    <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
      <View
        style={[
          styles.bubble,
          isMe
            ? { backgroundColor: colors.primary }
            : {
                backgroundColor: colors.card,
                borderColor: colors.cardBorder,
                borderWidth: 1,
              },
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isMe ? "#09090e" : colors.foreground },
          ]}
        >
          {msg.content}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            { color: isMe ? "rgba(9,9,14,0.5)" : colors.mutedForeground },
          ]}
        >
          {timeAgo(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}

export default function ConversationScreen() {
  const { address: otherAddress } = useLocalSearchParams();
  const colors = useColors();
  const { address: myAddress, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const { data: otherProfile } = useQuery({
    queryKey: [`/api/profile/${otherAddress}`],
    queryFn: () => getProfile(otherAddress),
    enabled: !!otherAddress,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["/api/conversation", myAddress, otherAddress],
    queryFn: () => getConversation(myAddress, otherAddress),
    enabled: !!myAddress && !!otherAddress,
    refetchInterval: 5_000,
  });

  const displayName =
    otherProfile?.displayName ||
    otherProfile?.username ||
    truncateAddress(otherAddress || "");

  const handleSend = async () => {
    if (!text.trim() || sending || !isAuthenticated) return;
    setSending(true);
    const body = text.trim();
    setText("");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sendMessage(otherAddress, body);
      queryClient.invalidateQueries({
        queryKey: ["/api/conversation", myAddress, otherAddress],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/messages", myAddress] });
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: displayName,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/profile/${otherAddress}`)}
            >
              <Avatar
                uri={otherProfile?.avatarUrl}
                username={displayName}
                size={32}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                isMe={item.sender === myAddress}
                colors={colors}
              />
            )}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingTop: 12,
              paddingBottom: 8,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 6,
            },
          ]}
        >
          <TextInput
            style={[
              styles.inputField,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            placeholder="Message..."
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: text.trim() ? colors.primary : colors.border },
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#09090e" />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={text.trim() ? "#09090e" : colors.mutedForeground}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubbleWrap: { marginBottom: 8, alignItems: "flex-start" },
  bubbleWrapMe: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: "right" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  inputField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
