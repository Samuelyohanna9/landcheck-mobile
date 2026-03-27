import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { PrimaryButton } from "../../components/PrimaryButton";
import { MetricTile } from "../../components/MetricTile";
import { StatusChip } from "../../components/StatusChip";
import { useGreenSync } from "../../context/GreenSyncContext";
import { fetchDonorReportUrl } from "../../api/green";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing } from "../../theme/tokens";

export const DonorReportScreen = () => {
  const { selectedProject, trees, isOnline } = useGreenSync();
  const { session } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);

  const projectId = selectedProject?.id;

  const healthyTrees = trees.filter((t) => t.status === "healthy" || t.status === "alive").length;
  const totalTrees = trees.length;

  const handleDownload = useCallback(async () => {
    if (!projectId || !isOnline) {
      Alert.alert("Unavailable", "You need to be online and have a project selected to generate the report.");
      return;
    }
    setDownloading(true);
    try {
      const actorName = String(session?.user.full_name || "").trim();
      const url = fetchDonorReportUrl(projectId, includePhotos, actorName || undefined);
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Failed to open the donor report. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [includePhotos, isOnline, projectId, session?.user.full_name]);

  return (
    <ScreenSurface>
      <ScreenHero
        title="Donor report"
        subtitle={selectedProject ? `Project: ${selectedProject.name}` : "No project selected"}
        badge={<StatusChip label={isOnline ? "Online" : "Offline"} tone={isOnline ? "online" : "offline"} />}
      />

      <SectionCard title="Report summary" subtitle="A PDF overview of the project for donors and stakeholders.">
        <View style={styles.metricRow}>
          <MetricTile label="Total trees" value={totalTrees} tone="success" />
          <MetricTile label="Healthy" value={healthyTrees} tone="success" />
        </View>
        <View style={styles.metricRow}>
          <MetricTile label="Species count" value={new Set(trees.map((t) => t.species).filter(Boolean)).size} />
          <MetricTile label="Project" value={selectedProject?.name || "-"} />
        </View>
      </SectionCard>

      <SectionCard title="Generate PDF" subtitle="Opens the server-generated PDF report in your browser. Requires network connectivity.">
        <Pressable onPress={() => setIncludePhotos((prev) => !prev)} style={styles.toggleRow}>
          <View style={[styles.checkbox, includePhotos && styles.checkboxChecked]}>
            {includePhotos ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          <View style={styles.toggleTextBlock}>
            <Text style={styles.toggleTitle}>Include tree photos in appendix</Text>
            <Text style={styles.toggleHint}>Photo pages are appended after analytics and record pages.</Text>
          </View>
        </Pressable>
        <PrimaryButton
          label={downloading ? "Opening..." : "Download donor report PDF"}
          onPress={() => void handleDownload()}
          disabled={!isOnline || !projectId || downloading}
        />
        {!isOnline && (
          <Text style={styles.offlineHint}>Report generation requires an active network connection.</Text>
        )}
      </SectionCard>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  offlineHint: {
    color: colors.warning,
    fontSize: 13,
    fontStyle: "italic",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  checkboxTick: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
  toggleTextBlock: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
});
