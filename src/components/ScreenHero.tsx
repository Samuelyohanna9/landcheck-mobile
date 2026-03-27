import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BrandMark } from "./BrandMark";
import { colors, radii, spacing } from "../theme/tokens";

type ScreenHeroProps = {
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  badge?: ReactNode;
  rightSlot?: ReactNode;
};

export const ScreenHero = ({ title, subtitle, logoUrl, badge, rightSlot }: ScreenHeroProps) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <BrandMark size={46} logoUrl={logoUrl} />
        <View style={styles.textBlock}>
          {badge ? <View style={styles.badgeRow}>{badge}</View> : null}
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: 12,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: 2,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.25,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
  },
  right: {
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
});
