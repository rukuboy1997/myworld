import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { getFeed } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import PostCard from "@/components/PostCard";
import { PostSkeleton } from "@/components/SkeletonLoader";
import EmptyState from "@/components/EmptyState";

export default function FeedScreen() {
  const colors = useColors();
  const { address, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  const {
    data: posts = [],
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["/api/feed", address],
    queryFn: () => getFeed(address || undefined),
    refetchInterval: 60_000,
  });

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
  }, []);

  const headerPaddingTop = Platform.OS === "web" ? 67 : insets.top + 10;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: headerPaddingTop,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.logo, { color: colors.foreground }]}>
          my<Text style={{ color: colors.primary }}>World</Text>
        </Text>
        <View style={styles.headerRight}>
          {isAuthenticated && (
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/create")}
            >
              <Ionicons name="add" size={20} color="#09090e" />
            </TouchableOpacity>
          )}
          {!isAuthenticated && (
            <TouchableOpacity
              style={[styles.signInBtn, { borderColor: colors.primary }]}
              onPress={() => router.push("/auth")}
            >
              <Text style={[styles.signInText, { color: colors.primary }]}>
                Sign in
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <PostSkeleton />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      ) : error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Failed to load feed"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={onRefresh}
        />
      ) : posts.length === 0 ? (
        <EmptyState
          icon="newspaper-outline"
          title="No posts yet"
          subtitle="Be the first to share something with the world."
          actionLabel={isAuthenticated ? "Create Post" : "Sign in"}
          onAction={() => router.push(isAuthenticated ? "/create" : "/auth")}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onPress={() => router.push(`/post/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
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
  logo: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  createBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  signInBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  signInText: { fontSize: 13, fontWeight: "700" },
});
