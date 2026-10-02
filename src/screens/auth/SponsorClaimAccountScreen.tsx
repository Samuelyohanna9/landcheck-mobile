import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BrandMark } from "../../components/BrandMark";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../api/client";
import { colors, radii, spacing } from "../../theme/tokens";
import type { RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SponsorClaimAccount">;

export const SponsorClaimAccountScreen = ({ navigation, route }: Props) => {
  const { claimGuestSponsor } = useAuth();
  const { sponsorId, email } = route.params;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await claimGuestSponsor(sponsorId, email, password);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to set your password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={["#eef8ef", "#d9f0dc", "#f7fbf7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.brandHeader}>
              <BrandMark size={74} />
              <Text style={styles.title}>Welcome to LandCheck Green</Text>
              <Text style={styles.subtitle}>
                Your name and email are already on file for your birthday tree — just choose a password to access your
                sponsor account.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{email}</Text>
              </View>

              <Text style={styles.fieldLabel}>Choose a password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Text style={styles.fieldLabel}>Confirm password</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.submitRow}>
                <PrimaryButton label={submitting ? "Setting up..." : "Set password & continue"} onPress={() => void onSubmit()} disabled={submitting} />
              </View>

              <Text style={styles.footNote} onPress={() => navigation.replace("Login", { authRoute: "sponsor" })}>
                Not your account? Sign in a different way
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl },
  brandHeader: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.lg },
  title: { marginTop: spacing.md, fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  subtitle: { marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.textSoft, marginBottom: spacing.xs, marginTop: spacing.md },
  readOnlyField: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  readOnlyText: { fontSize: 15, color: colors.textMuted },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: 13, fontWeight: "600" },
  submitRow: { marginTop: spacing.lg },
  footNote: { marginTop: spacing.md, textAlign: "center", fontSize: 13, color: colors.primaryDark, fontWeight: "700" },
});
