import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { GreenSyncProgress } from "../types/domain";
import { colors, radii, spacing } from "../theme/tokens";

type SyncProgressPanelProps = {
  progress: GreenSyncProgress;
  variant?: "light" | "dark";
  compact?: boolean;
};

export const SyncProgressPanel = ({ progress, variant = "light", compact = false }: SyncProgressPanelProps) => {
  if (!progress.active || progress.total <= 0) return null;

  const textColor = variant === "dark" ? colors.inverseText : colors.text;
  const textSoftColor = variant === "dark" ? "rgba(255,255,255,0.82)" : colors.textSoft;
  const cardStyle = variant === "dark" ? styles.cardDark : styles.cardLight;
  const trackStyle = variant === "dark" ? styles.trackDark : styles.trackLight;
  const fillStyle = { width: `${Math.max(progress.percent, 8)}%` as `${number}%` };

  return (
    <View style={[styles.card, cardStyle, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ActivityIndicator size="small" color={variant === "dark" ? colors.inverseText : colors.primaryDark} />
          <Text style={[styles.title, { color: textColor }]}>Sending saved work</Text>
        </View>
        <Text style={[styles.count, { color: textColor }]}>
          {Math.min(progress.completed, progress.total)}/{progress.total}
        </Text>
      </View>
      <View style={[styles.track, trackStyle]}>
        <View style={[styles.fill, fillStyle]} />
      </View>
      <Text style={[styles.meta, { color: textSoftColor }]} numberOfLines={1}>
        {progress.currentLabel || "Sending..."}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  cardLight: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.borderStrong,
  },
  cardDark: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  cardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
  },
  count: {
    fontSize: 12,
    fontWeight: "900",
  },
  track: {
    width: "100%",
    height: 8,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  trackLight: {
    backgroundColor: "rgba(22, 103, 58, 0.08)",
  },
  trackDark: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  fill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
  },
});
