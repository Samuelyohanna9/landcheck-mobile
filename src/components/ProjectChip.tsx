import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

type ProjectChipProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

export const ProjectChip = ({ active, label, onPress }: ProjectChipProps) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.active, pressed && styles.pressed]}>
    <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  chip: {
    maxWidth: 190,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  active: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.88,
  },
  label: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  activeLabel: {
    color: colors.text,
    fontWeight: "800",
  },
});
