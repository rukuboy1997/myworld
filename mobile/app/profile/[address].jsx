import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import {
  getProfile,
  followUser,
  unfollowUser,
  getFollowStatus,
  truncateAddress,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import Avatar from "@/components/Avatar";
import PostCard from "@/components/PostCard";
import EmptyState from "@/components/EmptyState";

export default function ProfileScreen() {
  const { address: targetAddress } = useLocalSearchParams();
  const colors = useColors();
  const { address: myAddress, isAuthenticated } = useAuth();
  const isMe = myAddress === targetAddress;

  const { data: profile, isLoading } = useQuery({
    queryKey: [`/api/profile/${targetAddress}`, myAddress],
    queryFn: () => getProfile(targetAddress, myAddress || undefined),
    enabled: !!targetAddress,
  });

  const { data: followStatus } = useQuery({
    queryKey: [`/api/follow/status/${targetAddress}`],
    queryFn: () => getFollowStatus(targetAddress),
    enabled: !!targetAddress && isAuthenticated && !isMe,
  });

  const followMutation = useMutation({
    mutationFn: () =>
      followStatus?.following
        ? unfollowUser(targetAddress)
        : followUser(targetAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/follow/status/${targetAddress}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/profile/${targetAddress}`],
      });
    },
    onError: (e) => Alert.alert("Error", e.message),
  });

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Profile not found</Text>
      </View>
    );
  }

  const displayName =
    profile.displayName || profile.username || truncateAddress(targetAddress);
  const posts = profile.posts ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: displayName,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerTitleStyle: { fontFamily: "PlusJakartaSans_700Bold" },
          headerShadowVisible: false,
          headerBackTitle: "Back",
          headerRight: isMe
            ? () => (
                <TouchableOpacity
                  onPress={() => router.push("/profile/edit")}
                  style={{ marginRight: 4 }}
                >
                  <Ionicons
                    name="settings-outline"
                    size={22}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <FlatList
        style={{ backgroundColor: colors.background }}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={{
              ...item,
              profile: {
                avatarUrl: profile.avatarUrl,
                username: profile.username,
                displayName: profile.displayName,
              },
            }}
            onPress={() => router.push(`/post/${item.id}`)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListHeaderComponent={
          <View>
            {profile.bannerUrl ? (
              <Image
                source={{ uri: profile.bannerUrl }}
                style={styles.banner}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={[colors.gradient1, colors.gradient2]}
                style={styles.bannerGradient}
              />
            )}

            <View
              style={[
                styles.profileCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={styles.avatarRow}>
                <Avatar
                  uri={profile.avatarUrl}
                  username={displayName}
                  size={72}
                />
                <View style={styles.actionBtns}>
                  {isMe ? (
                    <TouchableOpacity
                      style={[styles.editBtn, { borderColor: colors.border }]}
                      onPress={() => router.push("/profile/edit")}
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={14}
                        color={colors.foreground}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.editBtnText,
                          { color: colors.foreground },
                        ]}
                      >
                        Edit profile
                      </Text>
                    </TouchableOpacity>
                  ) : isAuthenticated ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.messageBtn,
                          { borderColor: colors.border },
                        ]}
                        onPress={() =>
                          router.push(`/conversation/${targetAddress}`)
                        }
                      >
                        <Ionicons
                          name="chatbubble-outline"
                          size={16}
                          color={colors.foreground}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.followBtn,
                          {
                            backgroundColor: followStatus?.following
                              ? "transparent"
                              : colors.primary,
                            borderColor: followStatus?.following
                              ? colors.border
                              : colors.primary,
                          },
                        ]}
                        onPress={() => followMutation.mutate()}
                        disabled={followMutation.isPending}
                      >
                        {followMutation.isPending ? (
                          <ActivityIndicator
                            size="small"
                            color={
                              followStatus?.following
                                ? colors.foreground
                                : "#09090e"
                            }
                          />
                        ) : (
                          <Text
                            style={[
                              styles.followBtnText,
                              {
                                color: followStatus?.following
                                  ? colors.foreground
                                  : "#09090e",
                              },
                            ]}
                          >
                            {followStatus?.following ? "Following" : "Follow"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>

              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {displayName}
              </Text>
              <Text
                style={[styles.username, { color: colors.mutedForeground }]}
              >
                @{profile.username}
              </Text>

              {profile.profession && (
                <View
                  style={[
                    styles.professionBadge,
                    { backgroundColor: colors.primaryMuted },
                  ]}
                >
                  <Text
                    style={[styles.professionText, { color: colors.primary }]}
                  >
                    {profile.profession}
                  </Text>
                </View>
              )}

              {profile.bio ? (
                <Text
                  style={[styles.bio, { color: colors.foregroundSecondary }]}
                >
                  {profile.bio}
                </Text>
              ) : null}

              <View style={styles.metaRow}>
                {profile.location && (
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.metaText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {profile.location}
                    </Text>
                  </View>
                )}
                {profile.website && (
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="link-outline"
                      size={13}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[styles.metaText, { color: colors.primary }]}
                      numberOfLines={1}
                    >
                      {profile.website}
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={[styles.statsRow, { borderTopColor: colors.border }]}
              >
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>
                    {profile.postCount ?? 0}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Posts
                  </Text>
                </View>
                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>
                    {profile.followerCount ?? 0}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Followers
                  </Text>
                </View>
                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>
                    {profile.followingCount ?? 0}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Following
                  </Text>
                </View>
                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>
                    {profile.totalLikes ?? 0}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Likes
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Posts
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No posts yet"
            subtitle="This user hasn't posted anything."
          />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { width: "100%", height: 140 },
  bannerGradient: { width: "100%", height: 140 },
  profileCard: {
    margin: 12,
    marginTop: -30,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  avatarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  actionBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  editBtnText: { fontSize: 13, fontWeight: "600" },
  messageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  followBtnText: { fontSize: 13, fontWeight: "700" },
  displayName: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  username: { fontSize: 13, marginTop: 2 },
  professionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  professionText: { fontSize: 12, fontWeight: "600" },
  bio: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
  },
  stat: { alignItems: "center", flex: 1 },
  statNum: { fontSize: 17, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: "80%", alignSelf: "center" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
