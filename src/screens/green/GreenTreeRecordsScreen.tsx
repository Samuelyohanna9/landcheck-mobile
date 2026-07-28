import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { MetricTile } from "../../components/MetricTile";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  ATTENTION_TREE_STATUSES,
  DEAD_TREE_STATUSES,
  HEALTHY_TREE_STATUSES,
  normalizeName,
  normalizeTaskState,
} from "../../green/workflow";
import { getWorkflowLabels } from "../../green/projectProfile";
import { filterVisibleTreeRecords } from "../../green/treeRecords";
import { colors, radii, spacing } from "../../theme/tokens";

export const GreenTreeRecordsScreen = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { trees, selectedProject, matchedCustodian, isCustodianUser, refreshing, refreshAll } = useGreenSync();
  const workflowLabels = useMemo(() => getWorkflowLabels(selectedProject || null), [selectedProject]);

  const currentUserName = normalizeName(session?.user.full_name);

  const visibleTrees = useMemo(() => {
    const custodianId = Number(matchedCustodian?.id || 0);
    return filterVisibleTreeRecords(trees).filter((tree) => {
      if (isCustodianUser && custodianId > 0) {
        return Number(tree.custodian_id || 0) === custodianId;
      }
      if (Number(tree.custodian_id || 0) === custodianId && custodianId > 0) return true;
      return normalizeName(tree.created_by) === currentUserName;
    });
  }, [currentUserName, isCustodianUser, matchedCustodian?.id, trees]);

  const recordStats = useMemo(() => {
    const healthy = visibleTrees.filter((tree) => HEALTHY_TREE_STATUSES.has(normalizeTaskState(tree.status))).length;
    const dead = visibleTrees.filter((tree) => DEAD_TREE_STATUSES.has(normalizeTaskState(tree.status))).length;
    const needsAttention = visibleTrees.filter((tree) => ATTENTION_TREE_STATUSES.has(normalizeTaskState(tree.status))).length;
    return { healthy, dead, needsAttention };
  }, [visibleTrees]);

  const speciesSummary = useMemo(
    () =>
      Array.from(
        visibleTrees.reduce((map, tree) => {
          const key = String(tree.species || "Unspecified").trim() || "Unspecified";
          map.set(key, (map.get(key) || 0) + 1);
          return map;
        }, new Map<string, number>()),
      ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [visibleTrees],
  );

  const maxSpeciesCount = speciesSummary[0]?.[1] || 1;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <ScreenHero
        title={workflowLabels.recordsTitle}
        rightSlot={
          <Pressable onPress={() => navigation.goBack()} style={styles.topButton}>
            <Text style={styles.topButtonText}>Back Home</Text>
          </Pressable>
        }
      />

      <SectionCard title="Project" subtitle={undefined}>
        {selectedProject ? (
          <View style={styles.projectScopeCard}>
            <Text style={styles.projectScopeTitle}>{selectedProject.name}</Text>
            <Text style={styles.scopeText}>{selectedProject.location_text || "Project selected on the home screen"}</Text>
          </View>
        ) : (
          <Text style={styles.scopeText}>No project selected on the home screen yet.</Text>
        )}
      </SectionCard>

      <SectionCard title={workflowLabels.recordsTitle} subtitle={undefined}>
        <View style={styles.metricRow}>
          <MetricTile label={`My ${workflowLabels.entityPlural}`} value={visibleTrees.length} helper="Current user scope" />
          <MetricTile label={workflowLabels.healthyLabel} value={recordStats.healthy} tone="success" helper={workflowLabels.healthyHelper} />
        </View>
        <View style={styles.metricRow}>
          <MetricTile label={workflowLabels.deadLabel} value={recordStats.dead} tone={recordStats.dead > 0 ? "warning" : "default"} helper={workflowLabels.deadHelper} />
          <MetricTile label={workflowLabels.attentionLabel} value={recordStats.needsAttention} tone={recordStats.needsAttention > 0 ? "warning" : "default"} helper={workflowLabels.attentionHelper} />
        </View>

        {!visibleTrees.length ? (
          <EmptyState title={workflowLabels.noRecordsTitle} subtitle={workflowLabels.noRecordsSubtitle} />
        ) : (
          <View style={styles.speciesCard}>
            <Text style={styles.speciesTitle}>{workflowLabels.cropDistributionTitle}</Text>
            {speciesSummary.map(([species, count]) => (
              <View key={species} style={styles.speciesRow}>
                <View style={styles.speciesText}>
                  <Text style={styles.speciesName}>{species}</Text>
                  <Text style={styles.speciesCount}>{count} {count === 1 ? workflowLabels.entitySingular.toLowerCase() : workflowLabels.entityPlural.toLowerCase()}</Text>
                </View>
                <View style={styles.speciesTrack}>
                  <View style={[styles.speciesFill, { width: `${Math.max(10, Math.round((count / maxSpeciesCount) * 100))}%` }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 124,
  },
  topButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  topButtonText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  projectScopeCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  projectScopeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  scopeText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  speciesCard: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
  },
  speciesTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  speciesRow: {
    gap: 6,
  },
  speciesText: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  speciesName: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "700",
  },
  speciesCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  speciesTrack: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.panelMuted,
    overflow: "hidden",
  },
  speciesFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
});
