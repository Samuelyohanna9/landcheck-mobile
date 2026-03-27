import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

type ActionTileBadge = {
  label: string;
  tone?: "neutral" | "success" | "warning";
};

type CornerBadgeTone = "success" | "warning" | "danger";

type ActionTileProps = {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badgeValue?: string | number;
  badgeTone?: CornerBadgeTone;
  secondaryBadgeValue?: string | number;
  secondaryBadgeTone?: CornerBadgeTone;
  footerBadges?: ActionTileBadge[];
  disabled?: boolean;
  onPress: () => void;
};

const badgeToneBackground = (tone: ActionTileBadge["tone"]) => {
  switch (tone) {
    case "success":
      return "rgba(35, 146, 82, 0.12)";
    case "warning":
      return "rgba(217, 138, 21, 0.14)";
    default:
      return colors.panelMuted;
  }
};

const badgeToneColor = (tone: ActionTileBadge["tone"]) => {
  switch (tone) {
    case "success":
      return colors.primaryDark;
    case "warning":
      return "#7a4b00";
    default:
      return colors.textSoft;
  }
};

const cornerBadgeGradient = (tone: CornerBadgeTone = "success") => {
  switch (tone) {
    case "warning":
      return ["#fbbf24", "#d97706"] as const;
    case "danger":
      return ["#ef4444", "#b91c1c"] as const;
    default:
      return ["#2aa852", "#1a6e37"] as const;
  }
};

const cornerBadgeTextColor = (tone: CornerBadgeTone = "success") => (tone === "warning" ? "#422006" : colors.inverseText);

export const ActionTile = ({
  title,
  subtitle,
  icon,
  badgeValue,
  badgeTone = "success",
  secondaryBadgeValue,
  secondaryBadgeTone = "danger",
  footerBadges,
  disabled,
  onPress,
}: ActionTileProps) => (
  <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.tile, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <View style={styles.tileInner}>
      {badgeValue !== undefined ? (
        <LinearGradient colors={cornerBadgeGradient(badgeTone)} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.badge}>
          <Text style={[styles.badgeText, { color: cornerBadgeTextColor(badgeTone) }]}>{badgeValue}</Text>
        </LinearGradient>
      ) : null}
      {secondaryBadgeValue !== undefined ? (
        <LinearGradient colors={cornerBadgeGradient(secondaryBadgeTone)} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.badge, styles.badgeLeft]}>
          <Text style={[styles.badgeText, { color: cornerBadgeTextColor(secondaryBadgeTone) }]}>{secondaryBadgeValue}</Text>
        </LinearGradient>
      ) : null}
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {footerBadges?.length ? (
        <View style={styles.footer}>
          {footerBadges.map((item) => (
            <View key={`${title}-${item.label}`} style={[styles.footerBadge, { backgroundColor: badgeToneBackground(item.tone) }]}>
              <Text style={[styles.footerBadgeText, { color: badgeToneColor(item.tone) }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
    overflow: "hidden",
  },
  tileInner: {
    flex: 1,
    padding: 12,
    gap: 6,
    minHeight: 136,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.62,
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badgeLeft: {
    right: "auto",
    left: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: "auto",
  },
  footerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  footerBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
