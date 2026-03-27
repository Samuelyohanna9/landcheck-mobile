import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

type StatusChipProps = {
  label: string;
  tone?: "online" | "offline" | "warning" | "neutral";
};

const toneStyles = {
  online: { backgroundColor: "rgba(35, 146, 82, 0.12)", color: colors.success, borderColor: "rgba(35, 146, 82, 0.18)" },
  offline: { backgroundColor: "rgba(220, 38, 38, 0.10)", color: colors.danger, borderColor: "rgba(220, 38, 38, 0.18)" },
  warning: { backgroundColor: "rgba(215, 242, 107, 0.24)", color: "#58710a", borderColor: "rgba(126, 152, 25, 0.2)" },
  neutral: { backgroundColor: colors.panelSoft, color: colors.textSoft, borderColor: colors.border },
} as const;

export const StatusChip = ({ label, tone = "neutral" }: StatusChipProps) => {
  const toneStyle = toneStyles[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor }]}>
      <View style={[styles.dot, { backgroundColor: toneStyle.color }]} />
      <Text style={[styles.label, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
