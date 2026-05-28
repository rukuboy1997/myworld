import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getAllProfiles } from "@/lib/api";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";

function ProfileCard({ profile }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
      onPress={() => router.push(`/profile/${profile.address}`)}
      activeOpacity={0.85}
    >
      <Avatar
        uri={profile.avatarUrl}
        username={profile.displayName || profile.username}
        size={52}
      />
      <View style={styles.cardInfo}>
        <Text
          style={[styles.displayName, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {profile.displayName || profile.username}
        </Text>
        <Text
          style={[styles.username, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          @{profile.username}
        </Text>
        {profile.bio ? (
          <Text
            style={[styles.bio, { color: colors.foregroundSecondary }]}
            numberOfLines={2}
          >
            {profile.bio}
          </Text>
        ) : null}
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: colors.foreground }]}>
            {profile.postCount ?? 0}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
            posts
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["/api/profiles"],
    queryFn: getAllProfiles,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        (p.username || "").toLowerCase().includes(q) ||
        (p.displayName || "").toLowerCase().includes(q) ||
        (p.bio || "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const headerPaddingTop = Platform.OS === "web" ? 67 : insets.top + 10;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: headerPaddingTop, backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Explore
        </Text>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.input, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search creators..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons
                name="close-circle"
                size={16}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search ? "No results found" : "No profiles yet"}
          subtitle={
            search
              ? "Try a different search term"
              : "Be the first to create a profile"
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.address}
          renderItem={({ item }) => <ProfileCard profile={item} />}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 20,
          }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 12,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, height: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardInfo: { flex: 1, marginLeft: 12 },
  displayName: { fontSize: 15, fontWeight: "700" },
  username: { fontSize: 12, marginTop: 2 },
  bio: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  stats: { alignItems: "flex-end", paddingTop: 2 },
  stat: { alignItems: "center" },
  statNum: { fontSize: 15, fontWeight: "700" },
  statLabel: { fontSize: 10 },
});
