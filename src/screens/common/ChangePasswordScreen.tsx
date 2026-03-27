import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { changeGreenPassword } from "../../api/green";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, radii, spacing } from "../../theme/tokens";

export const ChangePasswordScreen = () => {
  const { session } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await changeGreenPassword(currentPassword, newPassword);
      Alert.alert("Password changed", "Your password has been updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to change password."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;

  return (
    <ScreenSurface>
      <ScreenHero
        title="Change password"
        subtitle="Update your LandCheck Green account password. This applies to both web and mobile login."
        badge={<StatusChip label="Security" tone="neutral" />}
      />

      <SectionCard title="Update credentials" subtitle="Enter your current password and choose a new one (minimum 6 characters).">
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Current password</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter current password"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Minimum 6 characters"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Re-enter new password"
            placeholderTextColor={colors.textMuted}
          />
          {confirmPassword.length > 0 && newPassword !== confirmPassword && (
            <Text style={styles.errorHint}>Passwords do not match.</Text>
          )}
        </View>

        <PrimaryButton
          label={submitting ? "Saving..." : "Change password"}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
        />
      </SectionCard>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  errorHint: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600",
  },
});
