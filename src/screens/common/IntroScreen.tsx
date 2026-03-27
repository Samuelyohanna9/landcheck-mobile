import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenSurface } from "../../components/ScreenSurface";
import { colors, radii, spacing } from "../../theme/tokens";

type Props = {
  onContinue: () => void;
};

const steps = [
  {
    icon: "leaf-outline" as const,
    title: "Capture trees in the field",
    description: "Snap a photo, pin the GPS location, and record species and planting details for each tree.",
  },
  {
    icon: "checkmark-circle-outline" as const,
    title: "Complete maintenance tasks",
    description: "View assigned tasks, record evidence (photos, notes, GPS), and submit for supervisor review.",
  },
  {
    icon: "cloud-upload-outline" as const,
    title: "Works offline, syncs automatically",
    description: "Capture data without network. Everything syncs automatically when connectivity returns.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Privacy-first design",
    description: "GPS and photo data is collected only for tree monitoring. Your privacy consent is recorded and respected.",
  },
];

export const IntroScreen = ({ onContinue }: Props) => (
  <ScreenSurface>
    <View style={styles.header}>
      <Text style={styles.title}>Welcome to LandCheck Green</Text>
      <Text style={styles.subtitle}>
        Your mobile workspace for tree planting, monitoring, and maintenance. Here is how it works:
      </Text>
    </View>

    <View style={styles.stepList}>
      {steps.map((step, index) => (
        <View key={index} style={styles.stepCard}>
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon} size={28} color={colors.primary} />
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepDesc}>{step.description}</Text>
          </View>
        </View>
      ))}
    </View>

    <View style={styles.actions}>
      <PrimaryButton label="Get started" onPress={onContinue} />
    </View>
  </ScreenSurface>
);

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  stepList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stepCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
});
