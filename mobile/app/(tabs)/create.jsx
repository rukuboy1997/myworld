import React, { useState } from "react";
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
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { createPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export default function CreateScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const headerPaddingTop = Platform.OS === "web" ? 67 : insets.top + 10;

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Create
          </Text>
        </View>
        <View style={styles.center}>
          <Ionicons
            name="create-outline"
            size={56}
            color={colors.mutedForeground}
          />
          <Text style={[styles.authTitle, { color: colors.foreground }]}>
            Sign in to post
          </Text>
          <Text style={[styles.authSub, { color: colors.mutedForeground }]}>
            Share your world with the community
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.btnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const pickImage = async () => {
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
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Required", "Please add a title.");
      return;
    }
    if (!content.trim()) {
      Alert.alert("Required", "Please add content.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await createPost({ title: title.trim(), content: content.trim() });
      setTitle("");
      setContent("");
      setImage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Posted!", "Your post is live on myWorld.", [
        { text: "View Feed", onPress: () => router.push("/") },
        { text: "Create another" },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = content.length;
  const maxChars = 2000;
  const charColor =
    charCount > maxChars * 0.9 ? colors.error : colors.mutedForeground;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.header,
            { paddingTop: headerPaddingTop, borderBottomColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            New Post
          </Text>
          <TouchableOpacity
            style={[
              styles.postBtn,
              {
                backgroundColor:
                  title.trim() && content.trim()
                    ? colors.primary
                    : colors.border,
              },
            ]}
            onPress={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#09090e" />
            ) : (
              <Text
                style={[
                  styles.postBtnText,
                  {
                    color:
                      title.trim() && content.trim()
                        ? "#09090e"
                        : colors.mutedForeground,
                  },
                ]}
              >
                Post
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 40,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={[
              styles.titleInput,
              { color: colors.foreground, borderBottomColor: colors.border },
            ]}
            placeholder="Title"
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            returnKeyType="next"
          />

          <TextInput
            style={[styles.contentInput, { color: colors.foreground }]}
            placeholder="Share your story, thought, or update…"
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={maxChars}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: charColor }]}>
            {charCount}/{maxChars}
          </Text>

          {image && (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: image }}
                style={styles.preview}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={[styles.removeImg, { backgroundColor: colors.error }]}
                onPress={() => setImage(null)}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.toolBtn, { backgroundColor: colors.secondary }]}
              onPress={pickImage}
            >
              <Ionicons
                name="image-outline"
                size={20}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.toolLabel, { color: colors.mutedForeground }]}
              >
                Photo
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.suiBadge,
                { backgroundColor: colors.primaryMuted },
              ]}
            >
              <Text style={[styles.suiBadgeText, { color: colors.primary }]}>
                ⛓ Stored on Sui
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
    fontSize: 22,
    fontWeight: "800",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  postBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { fontWeight: "700", fontSize: 14 },
  titleInput: {
    fontSize: 22,
    fontWeight: "700",
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  contentInput: { fontSize: 16, lineHeight: 24, minHeight: 140, paddingTop: 4 },
  charCount: { fontSize: 12, textAlign: "right", marginTop: 8 },
  imageWrap: { position: "relative", marginTop: 12 },
  preview: { width: "100%", height: 200, borderRadius: 12 },
  removeImg: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toolLabel: { fontSize: 13, fontWeight: "500" },
  suiBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  suiBadgeText: { fontSize: 12, fontWeight: "600" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  authSub: { fontSize: 14, textAlign: "center", marginBottom: 28 },
  btn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 50 },
  btnText: { color: "#09090e", fontWeight: "700", fontSize: 15 },
});
