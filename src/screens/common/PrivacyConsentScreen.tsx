import { Linking, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { useAuth } from "../../context/AuthContext";
import { colors, radii, spacing } from "../../theme/tokens";

const PRIVACY_POLICY_URL = "https://landcheck.online/privacy";

const dataPoints = [
  "GPS coordinates for each tree planting and maintenance visit",
  "Photos captured as evidence for tree monitoring tasks",
  "Maintenance notes, species, and planting date metadata",
  "Device timestamps and network sync audit trail",
  "Organization and project assignment context",
];

export const PrivacyConsentScreen = () => {
  const { pendingConsent, acceptConsent, declineConsent } = useAuth();

  if (!pendingConsent) return null;

  const scopeKey =
    pendingConsent.session.appMode === "green" ? "green_field_data_capture" : "work_operational_data_processing";
  const scopeMeta = pendingConsent.policy.scopes?.[scopeKey];

  return (
    <ScreenSurface>
      <ScreenHero
        title="Privacy consent required"
        subtitle="Before entering the mobile workspace, the user must acknowledge how operational, GPS, photo, and organization data will be processed."
        logoUrl={pendingConsent.session.user.organization_logo_url || undefined}
        badge={<StatusChip label="Consent Gate" tone="warning" />}
      />

      <SectionCard
        title={scopeMeta?.title || "Operational privacy notice"}
        subtitle={`Consent version: ${pendingConsent.policy.consent_version}`}
      >
        <Text style={styles.bodyText}>{scopeMeta?.summary || "Operational privacy notice unavailable."}</Text>

        <View style={styles.bulletList}>
          <Text style={styles.bulletHeader}>This app collects and processes:</Text>
          {dataPoints.map((point, index) => (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{"\u2022"}</Text>
              <Text style={styles.bulletText}>{point}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.bodyText}>
          Continue only if you are authorized to collect, upload, review, or export this information for the relevant
          organization or project.
        </Text>

        <Text
          style={styles.policyLink}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        >
          Read the full privacy policy
        </Text>
      </SectionCard>

      <SectionCard title="Recorded with consent">
        <Text style={styles.bodyText}>User: {pendingConsent.session.user.full_name}</Text>
        <Text style={styles.bodyText}>Mode: LandCheck Green</Text>
        <Text style={styles.bodyText}>Organization: {pendingConsent.session.user.organization_name || "System scope"}</Text>
      </SectionCard>

      <View style={styles.actions}>
        <PrimaryButton label="I consent and continue" onPress={() => void acceptConsent()} />
        <PrimaryButton label="Decline and log out" onPress={() => void declineConsent()} variant="ghost" />
      </View>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  bodyText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
  },
  bulletList: {
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  bulletHeader: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletDot: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  bulletText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  policyLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
});
