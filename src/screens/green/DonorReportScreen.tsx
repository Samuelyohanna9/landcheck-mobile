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
import { getWorkflowLabels, isAgricProject, isCsrProject, isReliefRecoveryProject } from "../../green/projectProfile";
import { filterVisibleTreeRecords } from "../../green/treeRecords";
import { colors, spacing } from "../../theme/tokens";

export const DonorReportScreen = () => {
  const { selectedProject, trees, isOnline } = useGreenSync();
  const { session } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);

  const projectId = selectedProject?.id;
  const workflowLabels = getWorkflowLabels(selectedProject || null);
  const agricMode = isAgricProject(selectedProject || null);
  const reliefMode = isReliefRecoveryProject(selectedProject || null);
  const csrMode = isCsrProject(selectedProject || null);
  const visibleTrees = filterVisibleTreeRecords(trees);

  const healthyTrees = visibleTrees.filter((t) => t.status === "healthy" || t.status === "alive").length;
  const totalTrees = visibleTrees.length;

  const handleDownload = useCallback(async () => {
    if (!projectId || !isOnline) {
      Alert.alert("Unavailable", "You need to be online and have a project selected to generate the report.");
      return;
    }
    setDownloading(true);
    try {
      const actorName = String(session?.user.full_name || "").trim();
      const url = fetchDonorReportUrl(projectId, includePhotos, agricMode || reliefMode ? undefined : actorName || undefined);
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Failed to open the donor report. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [agricMode, reliefMode, includePhotos, isOnline, projectId, session?.user.full_name]);

  return (
    <ScreenSurface>
      <ScreenHero
        title={agricMode ? "Agric programme report" : reliefMode ? "Relief programme report" : csrMode ? "CSR implementation report" : "Donor report"}
        subtitle={selectedProject ? `Project: ${selectedProject.name}` : "No project selected"}
        badge={<StatusChip label={isOnline ? "Online" : "Offline"} tone={isOnline ? "online" : "offline"} />}
      />

      <SectionCard
        title="Report summary"
        subtitle={
          agricMode
            ? "A PDF evidence pack for organisations: farmer registry, mapped plots, support delivery, and plot detail pages."
            : reliefMode
              ? "A PDF evidence pack for organisations: beneficiary registry, mapped sites, support delivery, and site detail pages."
              : csrMode
                ? "A PDF evidence pack for CSR managers: programme setup, mapped trees, field implementation, and verification-ready detail pages."
            : "A PDF overview of the project for donors and stakeholders."
        }
      >
        <View style={styles.metricRow}>
          <MetricTile label={workflowLabels.totalLabel} value={totalTrees} tone="success" />
          <MetricTile label={workflowLabels.healthyLabel} value={healthyTrees} tone="success" />
        </View>
        <View style={styles.metricRow}>
          <MetricTile label={workflowLabels.cropDistributionTitle} value={new Set(visibleTrees.map((t) => t.species).filter(Boolean)).size} />
          <MetricTile label="Project" value={selectedProject?.name || "-"} />
        </View>
      </SectionCard>

      <SectionCard
        title="Generate PDF"
        subtitle={
          agricMode
            ? "Opens the Agric programme PDF in your browser. Includes plot maps, farmer details, and optional plot photos. Requires network connectivity."
            : reliefMode
              ? "Opens the Relief programme PDF in your browser. Includes site maps, beneficiary details, and optional site photos. Requires network connectivity."
              : csrMode
                ? "Opens the CSR implementation PDF in your browser. Includes implementation maps, tree detail pages, and optional photo evidence. Requires network connectivity."
            : "Opens the server-generated PDF report in your browser. Requires network connectivity."
        }
      >
        <Pressable onPress={() => setIncludePhotos((prev) => !prev)} style={styles.toggleRow}>
          <View style={[styles.checkbox, includePhotos && styles.checkboxChecked]}>
            {includePhotos ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          <View style={styles.toggleTextBlock}>
            <Text style={styles.toggleTitle}>
              {agricMode ? "Include plot photos in detail pages" : reliefMode ? "Include site photos in detail pages" : `Include ${workflowLabels.entityPlural.toLowerCase()} photos in appendix`}
            </Text>
            <Text style={styles.toggleHint}>
              {agricMode
                ? "Each mapped plot page will embed its available photo evidence when this is enabled."
                : reliefMode
                  ? "Each mapped site page will embed its available photo evidence when this is enabled."
                : "Photo pages are appended after analytics and record pages."}
            </Text>
          </View>
        </Pressable>
        <PrimaryButton
          label={downloading ? "Opening..." : agricMode ? "Download Agric programme PDF" : reliefMode ? "Download Relief programme PDF" : csrMode ? "Download CSR implementation PDF" : "Download donor report PDF"}
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
