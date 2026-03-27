import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

type MetricTileProps = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "attention";
  helper?: string;
};

const toneMap = {
  default: { backgroundColor: colors.panelSoft, valueColor: colors.text },
  success: { backgroundColor: colors.panelSoft, valueColor: colors.success },
  warning: { backgroundColor: "rgba(247, 185, 85, 0.18)", valueColor: colors.warning },
  danger: { backgroundColor: colors.panelSoft, valueColor: colors.danger },
  attention: { backgroundColor: colors.panelSoft, valueColor: colors.warning },
} as const;

export const MetricTile = ({ label, value, tone = "default", helper }: MetricTileProps) => {
  const toneStyle = toneMap[tone];
  return (
    <View style={[styles.tile, { backgroundColor: "#ffffff" }]}>
      <Text style={[styles.value, { color: toneStyle.valueColor }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 3,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  value: {
    fontSize: 18,
    fontWeight: "900",
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
  },
  helper: {
    color: colors.textSoft,
    fontSize: 10,
    lineHeight: 13,
  },
});
