import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function AuthScreen() {
  const colors = useColors();
  const { signIn, signUp, requestPasswordReset, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState("signin");
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSignIn = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      await signIn(username.trim(), password);
      router.back();
    } catch (e) {
      Alert.alert("Sign in failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!username.trim() || !email.trim() || !password) return;
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await signUp(username.trim(), email.trim(), password);
      router.back();
    } catch (e) {
      Alert.alert("Sign up failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      Alert.alert("Code sent", "Check your email for a 6-digit reset code.");
      setMode("reset");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim() || !resetCode.trim() || !newPassword) return;
    setLoading(true);
    try {
      await resetPassword(email.trim(), resetCode.trim(), newPassword);
      Alert.alert("Password updated!", "You are now signed in.");
      router.back();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    secure,
    keyboard,
    autoCapitalize,
  }) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View
        style={[
          styles.fieldRow,
          { backgroundColor: colors.input, borderColor: colors.border },
        ]}
      >
        <TextInput
          style={[styles.fieldInput, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure && !showPass}
          keyboardType={keyboard ?? "default"}
          autoCapitalize={autoCapitalize ?? "none"}
          autoCorrect={false}
        />
        {secure && (
          <TouchableOpacity
            onPress={() => setShowPass((s) => !s)}
            style={{ paddingRight: 12 }}
          >
            <Ionicons
              name={showPass ? "eye-off" : "eye"}
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={[colors.gradient1, colors.background]}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={20} color={colors.foreground} />
          </TouchableOpacity>

          <Text style={[styles.logo, { color: colors.foreground }]}>
            my<Text style={{ color: colors.primary }}>World</Text>
          </Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            The decentralized social platform on Sui
          </Text>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            {(mode === "signin" || mode === "signup") && (
              <View
                style={[styles.tabs, { backgroundColor: colors.secondary }]}
              >
                {["signin", "signup"].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.tab,
                      mode === m && { backgroundColor: colors.card },
                    ]}
                    onPress={() => setMode(m)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color:
                            mode === m
                              ? colors.foreground
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      {m === "signin" ? "Sign in" : "Sign up"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {mode === "forgot" && (
              <Text style={[styles.modeTitle, { color: colors.foreground }]}>
                Forgot password
              </Text>
            )}
            {mode === "reset" && (
              <Text style={[styles.modeTitle, { color: colors.foreground }]}>
                Reset password
              </Text>
            )}

            {mode === "signin" && (
              <>
                <Field
                  label="Username"
                  value={username}
                  onChange={setUsername}
                  placeholder="your_username"
                />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  secure
                />
                <TouchableOpacity
                  onPress={() => {
                    setMode("forgot");
                    setEmail("");
                  }}
                  style={styles.forgotLink}
                >
                  <Text style={[styles.forgotText, { color: colors.primary }]}>
                    Forgot password?
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor:
                        username && password ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={handleSignIn}
                  disabled={loading || !username || !password}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#09090e" />
                  ) : (
                    <Text
                      style={[
                        styles.submitText,
                        {
                          color:
                            username && password
                              ? "#09090e"
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      Sign in
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {mode === "signup" && (
              <>
                <Field
                  label="Username"
                  value={username}
                  onChange={setUsername}
                  placeholder="your_username"
                />
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  keyboard="email-address"
                />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  secure
                />
                <Field
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="••••••••"
                  secure
                />
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor:
                        username && email && password && confirmPassword
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                  onPress={handleSignUp}
                  disabled={
                    loading ||
                    !username ||
                    !email ||
                    !password ||
                    !confirmPassword
                  }
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#09090e" />
                  ) : (
                    <Text
                      style={[
                        styles.submitText,
                        {
                          color:
                            username && email && password
                              ? "#09090e"
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      Create account
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {mode === "forgot" && (
              <>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Enter your email and we'll send you a reset code.
                </Text>
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  keyboard="email-address"
                />
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: email ? colors.primary : colors.border },
                  ]}
                  onPress={handleForgot}
                  disabled={loading || !email}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#09090e" />
                  ) : (
                    <Text
                      style={[
                        styles.submitText,
                        { color: email ? "#09090e" : colors.mutedForeground },
                      ]}
                    >
                      Send code
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode("signin")}
                  style={styles.backLink}
                >
                  <Text style={[styles.forgotText, { color: colors.primary }]}>
                    ← Back to sign in
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {mode === "reset" && (
              <>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Enter the 6-digit code from your email.
                </Text>
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  keyboard="email-address"
                />
                <Field
                  label="6-digit code"
                  value={resetCode}
                  onChange={setResetCode}
                  placeholder="123456"
                  keyboard="number-pad"
                />
                <Field
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="••••••••"
                  secure
                />
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor:
                        email && resetCode && newPassword
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                  onPress={handleReset}
                  disabled={loading || !email || !resetCode || !newPassword}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#09090e" />
                  ) : (
                    <Text
                      style={[
                        styles.submitText,
                        {
                          color:
                            email && resetCode && newPassword
                              ? "#09090e"
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      Reset password
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={[styles.terms, { color: colors.mutedForeground }]}>
            By continuing, you agree to our Terms of Service.
          </Text>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, alignItems: "stretch" },
  closeBtn: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
    fontFamily: "PlusJakartaSans_700Bold",
    marginBottom: 6,
  },
  tagline: { fontSize: 13, textAlign: "center", marginBottom: 28 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20 },
  tabs: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  tabText: { fontSize: 14, fontWeight: "700" },
  modeTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  hint: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  fieldInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  forgotLink: { alignSelf: "flex-end", marginBottom: 16 },
  forgotText: { fontSize: 13, fontWeight: "600" },
  backLink: { alignItems: "center", marginTop: 12 },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: { fontSize: 15, fontWeight: "700" },
  terms: { fontSize: 11, textAlign: "center", marginTop: 20 },
});
