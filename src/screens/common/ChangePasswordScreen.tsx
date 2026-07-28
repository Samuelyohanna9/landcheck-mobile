import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { changeGreenPassword } from "../../api/green";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, radii, spacing } from "../../theme/tokens";

const EyeIcon = ({ visible }: { visible: boolean }) => (
  <Text style={{ fontSize: 18, color: colors.textMuted, lineHeight: 22 }}>
    {visible ? "👁" : "🙈"}
  </Text>
);

export const ChangePasswordScreen = () => {
  const { session } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !session) return;
    setSubmitting(true);
    try {
      await changeGreenPassword(session.user.id, currentPassword, newPassword);
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
        subtitle="Update your mobile workspace password. This applies to both web and mobile login."
        badge={<StatusChip label="Security" tone="neutral" />}
      />

      <SectionCard title="Update credentials" subtitle="Enter your current password and choose a new one (minimum 6 characters).">
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Current password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
              placeholder="Enter current password"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowCurrent((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <EyeIcon visible={showCurrent} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>New password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              placeholder="Minimum 6 characters"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowNew((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <EyeIcon visible={showNew} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm new password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              placeholder="Re-enter new password"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <EyeIcon visible={showConfirm} />
            </TouchableOpacity>
          </View>
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  eyeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  errorHint: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600",
  },
});
