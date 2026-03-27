import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BrandMark } from "../../components/BrandMark";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusChip } from "../../components/StatusChip";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../api/client";
import { APP_NAME } from "../../config/env";
import { colors, radii, spacing } from "../../theme/tokens";
import type { RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export const LoginScreen = (_props: Props) => {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => "LandCheck Green", []);
  const subtitle = useMemo(() => "Field access for planting, maintenance, GPS capture, evidence, and offline replay.", []);

  const onSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await signIn(username, password);
    } catch (err) {
      setError(getErrorMessage(err, "Login failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.background, colors.backgroundDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <BrandMark size={86} />
              <View style={styles.heroText}>
                <StatusChip label="Green mobile" tone="online" />
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Sign in</Text>
              <Text style={styles.formSubtitle}>Use the same assigned Green username and password as the web workspace.</Text>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Enter username"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    placeholder="Enter password"
                    placeholderTextColor={colors.textMuted}
                    style={styles.passwordInput}
                  />
                  <Pressable onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeButton}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSoft} />
                  </Pressable>
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton label={submitting ? "Signing in..." : "Login"} onPress={onSubmit} disabled={submitting} />
            </View>

            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Access note</Text>
              <Text style={styles.noticeText}>
                By continuing, you confirm you are authorized to access {APP_NAME} field data for your organization or project.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  heroText: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.9,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  formCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  formTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  formSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  inputBlock: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 54,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: "600",
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  passwordInput: {
    flex: 1,
    minHeight: 54,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: "600",
  },
  eyeButton: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  noticeCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: 6,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
