import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { likePost, addComment, timeAgo, truncateAddress } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import Avatar from "@/components/Avatar";

export default function PostCard({ post, onPress, showComments = false }) {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [likes, setLikes] = useState(post.likes ?? 0);
  const [liked, setLiked] = useState(post.userLiked ?? false);
  const [liking, setLiking] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const profile = post.profile ?? {};
  const displayName =
    profile.displayName || profile.username || truncateAddress(post.owner);
  const contentPreview =
    post.content?.length > 200 && !expanded
      ? post.content.slice(0, 200) + "…"
      : post.content;

  const handleLike = async () => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    if (liking) return;
    setLiking(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikes((l) => (newLiked ? l + 1 : l - 1));
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await likePost(post.id);
      setLiked(res.liked);
      setLikes(res.likes);
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    } catch {
      setLiked(!newLiked);
      setLikes((l) => (newLiked ? l - 1 : l + 1));
    } finally {
      setLiking(false);
    }
  };

  const handleComment = async () => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    if (!commentText.trim() || commenting) return;
    setCommenting(true);
    try {
      await addComment(post.id, commentText.trim());
      setCommentText("");
      setShowCommentInput(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/post/${post.id}/comments`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setCommenting(false);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.97}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push(`/profile/${post.owner}`)}>
          <Avatar uri={profile.avatarUrl} username={displayName} size={44} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <TouchableOpacity
            onPress={() => router.push(`/profile/${post.owner}`)}
          >
            <Text style={[styles.displayName, { color: colors.foreground }]}>
              {displayName}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            @{profile.username || truncateAddress(post.owner)} ·{" "}
            {timeAgo(post.createdAt)}
          </Text>
        </View>
        {post.postObjectId && (
          <View
            style={[styles.badge, { backgroundColor: colors.primaryMuted }]}
          >
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              ⛓ Sui
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      {post.title && (
        <Text style={[styles.title, { color: colors.foreground }]}>
          {post.title}
        </Text>
      )}

      {/* Content */}
      {post.content && (
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          activeOpacity={0.8}
        >
          <Text style={[styles.content, { color: colors.foregroundSecondary }]}>
            {contentPreview}
          </Text>
          {post.content.length > 200 && (
            <Text style={[styles.readMore, { color: colors.primary }]}>
              {expanded ? "Show less" : "Read more"}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Media */}
      {post.mediaUrl && post.mediaType === "image" && (
        <Image
          source={{ uri: post.mediaUrl }}
          style={[styles.media, { borderColor: colors.cardBorder }]}
          resizeMode="cover"
        />
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.action}
          onPress={handleLike}
          activeOpacity={0.8}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={20}
            color={liked ? "#ef4444" : colors.mutedForeground}
          />
          <Text
            style={[
              styles.actionCount,
              { color: liked ? "#ef4444" : colors.mutedForeground },
            ]}
          >
            {likes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() => {
            if (!isAuthenticated) {
              router.push("/auth");
              return;
            }
            setShowCommentInput((s) => !s);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="chatbubble-outline"
            size={19}
            color={colors.mutedForeground}
          />
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>
            {post.commentCount ?? 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() => router.push(`/post/${post.id}`)}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-redo-outline"
            size={19}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      {/* Comment Input */}
      {showCommentInput && (
        <View style={[styles.commentInput, { borderTopColor: colors.border }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            placeholder="Write a comment..."
            placeholderTextColor={colors.mutedForeground}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor: commentText.trim()
                  ? colors.primary
                  : colors.border,
              },
            ]}
            onPress={handleComment}
            disabled={!commentText.trim() || commenting}
          >
            <Ionicons
              name="send"
              size={16}
              color={commentText.trim() ? "#09090e" : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  headerInfo: { flex: 1, marginLeft: 10 },
  displayName: { fontSize: 14, fontWeight: "700", letterSpacing: 0.1 },
  meta: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: "600" },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  content: { fontSize: 14, lineHeight: 21 },
  readMore: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  media: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
  },
  actions: { flexDirection: "row", marginTop: 12, gap: 20 },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { fontSize: 13, fontWeight: "500" },
  commentInput: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 90,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
