import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

type EmptyStateProps = {
  title: string;
  subtitle: string;
};

export const EmptyState = ({ title, subtitle }: EmptyStateProps) => (
  <View style={styles.wrap}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    backgroundColor: colors.panelSoft,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
