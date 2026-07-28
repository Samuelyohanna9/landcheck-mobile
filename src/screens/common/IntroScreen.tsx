import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenSurface } from "../../components/ScreenSurface";
import { useAuth } from "../../context/AuthContext";
import { colors, radii, spacing } from "../../theme/tokens";

type Props = {
  onContinue: () => void;
};

export const IntroScreen = ({ onContinue }: Props) => {
  const { session } = useAuth();
  const sponsorMode = session?.auth_mode === "sponsor_user" || session?.appMode === "green_sponsor";
  const steps = sponsorMode
    ? [
        {
          icon: "leaf-outline" as const,
          title: "Choose approved projects",
          description: "Browse sponsor-enabled planting projects published by the admin team in LandCheck Work.",
        },
        {
          icon: "card-outline" as const,
          title: "Submit sponsorship orders",
          description: "Reserve one or more trees, add a dedication if you want, and submit your payment reference for review.",
        },
        {
          icon: "images-outline" as const,
          title: "Track verified evidence",
          description: "See approved tree photos, map locations, maintenance updates, and digital certificates in one place.",
        },
        {
          icon: "leaf-outline" as const,
          title: "Follow carbon impact",
          description: "Each sponsored tree shows live carbon impact once the field team plants and the supervisor approves it.",
        },
      ]
    : [
        {
          icon: "leaf-outline" as const,
          title: "Capture field records",
          description: "Map plots or trees, snap photos, pin GPS, and record the core field details needed by your programme.",
        },
        {
          icon: "checkmark-circle-outline" as const,
          title: "Complete assigned visits",
          description: "Open assigned field tasks, record evidence (photos, notes, GPS), and submit for supervisor review.",
        },
        {
          icon: "cloud-upload-outline" as const,
          title: "Works offline, syncs automatically",
          description: "Capture data without network. Everything syncs automatically when connectivity returns.",
        },
        {
          icon: "shield-checkmark-outline" as const,
          title: "Privacy-first design",
          description: "GPS and photo data is collected only for approved field operations. Your privacy consent is recorded and respected.",
        },
      ];

  return (
    <ScreenSurface>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to LandCheck Mobile</Text>
        <Text style={styles.subtitle}>
          {sponsorMode
            ? "Your sponsor workspace for public tree sponsorship, certificates, live tree updates, and carbon impact."
            : "Your mobile workspace for field capture, mapped records, and offline sync. Here is how it works:"}
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
};

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
