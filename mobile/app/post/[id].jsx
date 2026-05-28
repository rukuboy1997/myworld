import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import {
  getPost,
  getComments,
  addComment,
  likePost,
  timeAgo,
  truncateAddress,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";

function CommentItem({ comment }) {
  const colors = useColors();
  const profile = comment.profile ?? {};
  const name =
    profile.displayName || profile.username || truncateAddress(comment.owner);
  return (
    <View style={[styles.comment, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => router.push(`/profile/${comment.owner}`)}
      >
        <Avatar uri={profile.avatarUrl} username={name} size={36} />
      </TouchableOpacity>
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentName, { color: colors.foreground }]}>
            {name}
          </Text>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
            {timeAgo(comment.createdAt)}
          </Text>
        </View>
        <Text
          style={[styles.commentText, { color: colors.foregroundSecondary }]}
        >
          {comment.content}
        </Text>
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: [`/api/post/${id}`],
    queryFn: () => getPost(id),
    enabled: !!id,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: [`/api/post/${id}/comments`],
    queryFn: () => getComments(id),
    enabled: !!id,
  });

  const [liked, setLiked] = useState(null);
  const [likeCount, setLikeCount] = useState(null);

  const actualLiked = liked !== null ? liked : (post?.userLiked ?? false);
  const actualLikes = likeCount !== null ? likeCount : (post?.likes ?? 0);

  const handleLike = async () => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    const newLiked = !actualLiked;
    setLiked(newLiked);
    setLikeCount(actualLikes + (newLiked ? 1 : -1));
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await likePost(id);
      setLiked(res.liked);
      setLikeCount(res.likes);
    } catch {
      setLiked(!newLiked);
      setLikeCount(actualLikes);
    }
  };

  const handleComment = async () => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addComment(id, commentText.trim());
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: [`/api/post/${id}/comments`] });
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (postLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Post not found</Text>
      </View>
    );
  }

  const profile = post.profile ?? {};
  const displayName =
    profile.displayName || profile.username || truncateAddress(post.owner);

  return (
    <>
      <Stack.Screen options={{ title: "Post" }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <View
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => <CommentItem comment={item} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListHeaderComponent={
              <View
                style={[
                  styles.postBody,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.authorRow}
                  onPress={() => router.push(`/profile/${post.owner}`)}
                >
                  <Avatar
                    uri={profile.avatarUrl}
                    username={displayName}
                    size={48}
                  />
                  <View style={styles.authorInfo}>
                    <Text
                      style={[styles.authorName, { color: colors.foreground }]}
                    >
                      {displayName}
                    </Text>
                    <Text
                      style={[
                        styles.authorMeta,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      @{profile.username || truncateAddress(post.owner)} ·{" "}
                      {timeAgo(post.createdAt)}
                    </Text>
                  </View>
                  {post.postObjectId && (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: colors.primaryMuted },
                      ]}
                    >
                      <Text
                        style={[styles.badgeText, { color: colors.primary }]}
                      >
                        ⛓ Sui
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {post.title && (
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    {post.title}
                  </Text>
                )}
                {post.content && (
                  <Text
                    style={[
                      styles.content,
                      { color: colors.foregroundSecondary },
                    ]}
                  >
                    {post.content}
                  </Text>
                )}

                {post.mediaUrl && post.mediaType === "image" && (
                  <Image
                    source={{ uri: post.mediaUrl }}
                    style={[styles.media, { borderColor: colors.cardBorder }]}
                    resizeMode="cover"
                  />
                )}

                <View
                  style={[styles.actions, { borderTopColor: colors.border }]}
                >
                  <TouchableOpacity
                    style={styles.action}
                    onPress={handleLike}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={actualLiked ? "heart" : "heart-outline"}
                      size={22}
                      color={actualLiked ? "#ef4444" : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.actionCount,
                        {
                          color: actualLiked
                            ? "#ef4444"
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {actualLikes}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.action}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={21}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.actionCount,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {comments.length}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[styles.commentsHeader, { color: colors.foreground }]}
                >
                  Comments
                </Text>
              </View>
            }
            ListEmptyComponent={
              commentsLoading ? (
                <View style={styles.commentsLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <EmptyState
                  icon="chatbubble-outline"
                  title="No comments yet"
                  subtitle="Be the first to comment."
                />
              )
            }
          />

          {isAuthenticated && (
            <View
              style={[
                styles.inputBar,
                {
                  backgroundColor: colors.card,
                  borderTopColor: colors.border,
                  paddingBottom: insets.bottom + 8,
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
                placeholder="Add a comment..."
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
                disabled={!commentText.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#09090e" />
                ) : (
                  <Ionicons
                    name="send"
                    size={16}
                    color={
                      commentText.trim() ? "#09090e" : colors.mutedForeground
                    }
                  />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  postBody: { margin: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  authorRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  authorInfo: { flex: 1, marginLeft: 12 },
  authorName: { fontSize: 16, fontWeight: "700" },
  authorMeta: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: "600" },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  content: { fontSize: 15, lineHeight: 24 },
  media: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 24,
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontSize: 14, fontWeight: "600" },
  commentsHeader: { fontSize: 16, fontWeight: "700", marginTop: 16 },
  commentsLoading: { padding: 20, alignItems: "center" },
  comment: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  commentBody: { flex: 1 },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  commentName: { fontSize: 13, fontWeight: "700" },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 14, lineHeight: 20 },
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 90,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
