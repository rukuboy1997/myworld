import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { router, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { getProfile, updateProfile } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export default function EditProfileScreen() {
  const colors = useColors();
  const { address, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [profession, setProfession] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [localAvatar, setLocalAvatar] = useState(null);
  const [localBanner, setLocalBanner] = useState(null);

  useEffect(() => {
    if (!address) return;
    getProfile(address)
      .then((p) => {
        setDisplayName(p.displayName || "");
        setBio(p.bio || "");
        setProfession(p.profession || "");
        setLocation(p.location || "");
        setWebsite(p.website || "");
        setTwitter(p.twitter || "");
        setAvatarUrl(p.avatarUrl || "");
        setBannerUrl(p.bannerUrl || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalAvatar(result.assets[0].uri);
    }
  };

  const pickBanner = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalBanner(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        profession: profession.trim(),
        location: location.trim(),
        website: website.trim(),
        twitter: twitter.trim(),
      };

      if (localAvatar) payload.avatarUrl = localAvatar;
      else if (avatarUrl) payload.avatarUrl = avatarUrl;

      if (localBanner) payload.bannerUrl = localBanner;
      else if (bannerUrl) payload.bannerUrl = bannerUrl;

      await updateProfile(payload);
      queryClient.invalidateQueries({ queryKey: [`/api/profile/${address}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved!", "Your profile has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    router.replace("/auth");
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    multiline,
    keyboard,
    maxLength,
    icon,
  }) => (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={13}
            color={colors.mutedForeground}
            style={{ marginRight: 5 }}
          />
        )}
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
      </View>
      <TextInput
        style={[
          styles.fieldInput,
          {
            backgroundColor: colors.input,
            color: colors.foreground,
            borderColor: colors.border,
            minHeight: multiline ? 80 : 48,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboard ?? "default"}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
      />
      {maxLength && (
        <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
          {value.length}/{maxLength}
        </Text>
      )}
    </View>
  );

  const currentAvatar = localAvatar || avatarUrl;
  const currentBanner = localBanner || bannerUrl;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Profile",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerTitleStyle: { fontFamily: "PlusJakartaSans_700Bold" },
          headerShadowVisible: false,
          headerBackTitle: "Back",
          headerRight: () => (
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#09090e" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Banner */}
          <TouchableOpacity onPress={pickBanner} activeOpacity={0.85}>
            {currentBanner ? (
              <Image
                source={{ uri: currentBanner }}
                style={styles.banner}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={[colors.gradient1, colors.gradient2]}
                style={styles.banner}
              >
                <View style={styles.bannerPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={28}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.bannerHint,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Tap to set banner
                  </Text>
                </View>
              </LinearGradient>
            )}
            <View
              style={[
                styles.bannerEditBadge,
                { backgroundColor: colors.overlay },
              ]}
            >
              <Ionicons name="camera-outline" size={16} color="#fff" />
              <Text style={styles.bannerEditText}>Edit banner</Text>
            </View>
          </TouchableOpacity>

          {/* Avatar */}
          <View
            style={[
              styles.avatarSection,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <TouchableOpacity
              onPress={pickAvatar}
              activeOpacity={0.85}
              style={styles.avatarWrap}
            >
              {currentAvatar ? (
                <Image
                  source={{ uri: currentAvatar }}
                  style={[styles.avatar, { borderColor: colors.background }]}
                />
              ) : (
                <View
                  style={[
                    styles.avatarPlaceholder,
                    {
                      backgroundColor: colors.primary + "25",
                      borderColor: colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[styles.avatarInitials, { color: colors.primary }]}
                  >
                    {(displayName || "?").slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.avatarEditBadge,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons name="camera" size={14} color="#09090e" />
              </View>
            </TouchableOpacity>
            <View style={styles.avatarInfo}>
              <Text style={[styles.avatarName, { color: colors.foreground }]}>
                {displayName || "Your Name"}
              </Text>
              <Text
                style={[styles.avatarHint, { color: colors.mutedForeground }]}
              >
                Tap avatar to change photo
              </Text>
            </View>
          </View>

          {/* Form fields */}
          <View style={styles.form}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Basic Info
            </Text>

            <Field
              label="Display Name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Your full name or alias"
              maxLength={50}
              icon="person-outline"
            />
            <Field
              label="Bio"
              value={bio}
              onChange={setBio}
              placeholder="Tell the world about yourself…"
              multiline
              maxLength={200}
              icon="document-text-outline"
            />
            <Field
              label="Profession"
              value={profession}
              onChange={setProfession}
              placeholder="e.g. Athlete, Artist, Creator"
              maxLength={60}
              icon="briefcase-outline"
            />

            <Text
              style={[
                styles.sectionTitle,
                { color: colors.foreground, marginTop: 20 },
              ]}
            >
              Links & Location
            </Text>

            <Field
              label="Location"
              value={location}
              onChange={setLocation}
              placeholder="Tokyo, Japan"
              maxLength={60}
              icon="location-outline"
            />
            <Field
              label="Website"
              value={website}
              onChange={setWebsite}
              placeholder="https://yoursite.com"
              keyboard="url"
              maxLength={120}
              icon="link-outline"
            />
            <Field
              label="Twitter / X"
              value={twitter}
              onChange={setTwitter}
              placeholder="@yourhandle"
              maxLength={60}
              icon="logo-twitter"
            />
          </View>

          {/* Save button (bottom) */}
          <View style={styles.bottomSave}>
            <TouchableOpacity
              style={[styles.saveBtnLarge, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#09090e" />
              ) : (
                <Text style={styles.saveBtnLargeText}>Save Profile</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { width: "100%", height: 160, position: "relative" },
  bannerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bannerHint: { fontSize: 13 },
  bannerEditBadge: {
    position: "absolute",
    bottom: 10,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  bannerEditText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 14,
    marginTop: -28,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    paddingTop: 20,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  avatarInitials: { fontSize: 26, fontWeight: "800" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInfo: { flex: 1 },
  avatarName: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  avatarHint: { fontSize: 12, marginTop: 3 },
  form: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  fieldWrap: { marginBottom: 16 },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  fieldLabel: { fontSize: 12, fontWeight: "600" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  charCount: { fontSize: 11, textAlign: "right", marginTop: 4 },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
  },
  saveBtnText: { color: "#09090e", fontWeight: "700", fontSize: 14 },
  bottomSave: { paddingHorizontal: 16, paddingTop: 8 },
  saveBtnLarge: { paddingVertical: 15, borderRadius: 14, alignItems: "center" },
  saveBtnLargeText: { color: "#09090e", fontWeight: "700", fontSize: 16 },
});
