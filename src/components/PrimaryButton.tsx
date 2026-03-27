import { Pressable, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii, spacing } from "../theme/tokens";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export const PrimaryButton = ({ label, onPress, disabled = false, variant = "primary" }: PrimaryButtonProps) => {
  if (variant === "ghost") {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.ghost, pressed && styles.pressed, disabled && styles.disabled]}>
        <Text style={styles.ghostLabel}>{label}</Text>
      </Pressable>
    );
  }

  const gradientColors: readonly [string, string] =
    variant === "primary" ? [colors.primary, colors.primaryDark] : [colors.panelSoft, colors.panelElevated];
  const labelStyle = variant === "primary" ? styles.labelPrimary : styles.labelSecondary;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}>
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <Text style={labelStyle}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fill: {
    minHeight: 54,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  labelPrimary: {
    color: colors.inverseText,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  labelSecondary: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  ghost: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  ghostLabel: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.45,
  },
});
