import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { ScreenHero } from "../../components/ScreenHero";
import { PrimaryButton } from "../../components/PrimaryButton";
import { API_URL } from "../../config/env";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { MetricTile } from "../../components/MetricTile";
import { StatusChip } from "../../components/StatusChip";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import { getProjectWorkflowProfile, getWorkflowLabels, isAgricProject, isReliefRecoveryProject } from "../../green/projectProfile";
import { formatWorkflowTaskTypeLabel } from "../../green/workflow";
import { fetchTreeTasks, fetchTreeTimeline } from "../../api/green";
import { cacheTreeTasks, cacheTreeTimeline, readCachedTreeTasks, readCachedTreeTimeline } from "../../storage/database";
import { getErrorMessage } from "../../api/client";
import { formatDateTime } from "../../utils/format";
import { colors, radii, spacing } from "../../theme/tokens";
import type { TaskSummary } from "../../types/domain";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GreenAppStackParamList } from "../../types/navigation";

type TimelineEntry = {
  id?: number;
  event_type?: string;
  event_date?: string;
  description?: string;
  actor_name?: string;
};

type Props = NativeStackScreenProps<GreenAppStackParamList, "TreeDetail">;

const buildAgentQrDownloadQuery = (user?: { id?: number | null; organization_id?: number | null } | null) => {
  const pairs: string[] = [];
  const userId = Number(user?.id || 0);
  const organizationId = Number(user?.organization_id || 0);
  if (userId > 0) pairs.push(`user_id=${encodeURIComponent(String(userId))}`);
  if (organizationId > 0) pairs.push(`organization_id=${encodeURIComponent(String(organizationId))}`);
  return pairs.join("&");
};

const appendDownloadQuery = (url: string, query: string) => (query ? `${url}?${query}` : url);

export const TreeDetailScreen = ({ route }: Props) => {
  const { treeId, projectId } = route.params;
  const { session } = useAuth();
  const { trees, isOnline, selectedProject } = useGreenSync();
  const tree = trees.find((t) => t.id === treeId) || null;
  const agricMode = isAgricProject(selectedProject || null);
  const reliefMode = isReliefRecoveryProject(selectedProject || null);
  const fieldWorkflowMode = agricMode || reliefMode;
  const workflowProfile = getProjectWorkflowProfile(selectedProject || null);
  const workflowLabels = getWorkflowLabels(selectedProject || null);
  const publicSponsorshipProject = !fieldWorkflowMode && (
    String(selectedProject?.access_model || "").trim().toLowerCase() === "public_sponsorship" ||
    Boolean(selectedProject?.public_sponsor_enabled)
  );
  const qrDownloadQuery = buildAgentQrDownloadQuery(session?.user);

  const [treeTasks, setTreeTasks] = useState<TaskSummary[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    // Load cached first
    const [cachedTasks, cachedTimeline] = await Promise.all([
      readCachedTreeTasks("green", treeId),
      readCachedTreeTimeline("green", treeId),
    ]);
    if (cachedTasks.length) setTreeTasks(cachedTasks);
    if (Array.isArray(cachedTimeline)) setTimeline(cachedTimeline as TimelineEntry[]);

    if (!isOnline) {
      setLoading(false);
      return;
    }

    try {
      const [liveTasks, liveTimeline] = await Promise.all([
        fetchTreeTasks(treeId),
        fetchTreeTimeline(treeId),
      ]);
      setTreeTasks(liveTasks);
      const timelineArray = Array.isArray(liveTimeline) ? liveTimeline : [];
      setTimeline(timelineArray as TimelineEntry[]);
      await Promise.all([
        cacheTreeTasks("green", treeId, liveTasks),
        cacheTreeTimeline("green", treeId, timelineArray),
      ]);
    } catch (err) {
      setError(getErrorMessage(err, `Failed to load ${workflowLabels.entitySingular.toLowerCase()} details.`));
    } finally {
      setLoading(false);
    }
  }, [isOnline, treeId, workflowLabels.entitySingular]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const chipTone = (status?: string | null): "online" | "warning" | "neutral" => {
    const s = String(status || "").toLowerCase();
    if (s === "healthy" || s === "alive") return "online";
    if (s === "dead" || s === "removed") return "warning";
    return "neutral";
  };

  const metricTone = (status?: string | null): "success" | "warning" | "default" => {
    const s = String(status || "").toLowerCase();
    if (s === "healthy" || s === "alive") return "success";
    if (s === "dead" || s === "removed") return "warning";
    return "default";
  };

  const reviewBadge = (state?: string | null) => {
    const s = String(state || "").toLowerCase();
    if (s === "approved") return "online" as const;
    if (s === "submitted") return "warning" as const;
    return "neutral" as const;
  };

  const detailTitle = tree
    ? agricMode
      ? String(tree.record_profile_data?.plot_code || tree.record_profile_data?.plot_name || "").trim() || `${workflowLabels.entitySingular} #${tree.project_tree_no || tree.id}`
      : reliefMode
        ? String(tree.record_profile_data?.asset_code || tree.record_profile_data?.asset_name || "").trim() || `${workflowLabels.entitySingular} #${tree.project_tree_no || tree.id}`
      : `${workflowLabels.entitySingular} #${tree.project_tree_no || tree.id}`
    : `${workflowLabels.entitySingular} #${treeId}`;
  const detailSubtitle = tree
    ? `${agricMode ? tree.record_profile_data?.commodity : reliefMode ? tree.record_profile_data?.asset_type : tree.species || `Unknown ${workflowLabels.cropLabel.toLowerCase()}`} | ${tree.status || "Unknown status"}`
    : "Loading...";
  const areaLabel = tree?.record_profile_data?.area_hectares != null
    ? `${tree.record_profile_data.area_hectares} ha`
    : tree?.existing_area_sqm != null
      ? `${(Number(tree.existing_area_sqm) / 10000).toFixed(4)} ha`
      : reliefMode && String(tree?.record_profile_data?.relief_boundary_capture_method || "").startsWith("line")
        ? "Linear asset"
        : reliefMode && String(tree?.record_profile_data?.relief_boundary_capture_method || "") === "point"
          ? "Point site"
          : "-";
  const seasonLabel =
    tree?.record_profile_data?.season_name || tree?.record_profile_data?.season_year
      ? [tree?.record_profile_data?.season_name, tree?.record_profile_data?.season_year].filter(Boolean).join(" ")
      : "-";

  return (
    <ScreenSurface refreshing={loading} onRefresh={() => void loadData()}>
      <ScreenHero
        title={detailTitle}
        subtitle={detailSubtitle}
        badge={tree ? <StatusChip label={tree.status || "Unknown"} tone={chipTone(tree.status)} /> : undefined}
      />

      {error ? (
        <SectionCard title="Error">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      ) : null}

      {tree && (
        <SectionCard title={agricMode ? "Farm details" : reliefMode ? "Site details" : "Tree details"} subtitle={`Project ID: ${projectId}`}>
          <View style={styles.metricRow}>
            <MetricTile
              label={workflowLabels.cropLabel}
              value={String(agricMode ? tree.record_profile_data?.commodity : reliefMode ? tree.record_profile_data?.asset_type : tree.species || "-")}
            />
            <MetricTile label="Status" value={tree.status || "-"} tone={metricTone(tree.status)} />
          </View>
          <View style={styles.metricRow}>
            <MetricTile
              label={fieldWorkflowMode ? reliefMode ? "Extent" : "Area" : "Height (m)"}
              value={fieldWorkflowMode ? areaLabel : tree.tree_height_m != null ? String(tree.tree_height_m) : "-"}
            />
            <MetricTile
              label={fieldWorkflowMode ? reliefMode ? "Mapped as" : "Boundary" : "Age (months)"}
              value={
                fieldWorkflowMode
                  ? String((agricMode ? tree.record_profile_data?.boundary_capture_method : tree.record_profile_data?.relief_boundary_capture_method) || (tree.existing_area_sqm ? "polygon_map" : "point")).replaceAll("_", " ")
                  : tree.tree_age_months != null
                    ? String(tree.tree_age_months)
                    : "-"
              }
            />
          </View>
          <View style={styles.metricRow}>
            <MetricTile
              label={agricMode ? "Season" : reliefMode ? "Damage" : "Origin"}
              value={agricMode ? seasonLabel : reliefMode ? String(tree.record_profile_data?.damage_level || "-") : tree.tree_origin || "new_planting"}
            />
            <MetricTile
              label={fieldWorkflowMode ? "Observation" : "Planted"}
              value={tree.planting_date ? formatDateTime(tree.planting_date) : "-"}
            />
          </View>
          {tree.custodian_name ? (
            <View style={styles.metricRow}>
              <MetricTile label={workflowLabels.ownerLabel} value={tree.custodian_name} />
              <MetricTile label="Created by" value={tree.created_by || "-"} />
            </View>
          ) : null}
          {agricMode ? (
            <View style={styles.metricRow}>
              <MetricTile label="Irrigation" value={String(tree.record_profile_data?.irrigation_type || "-")} />
              <MetricTile label="Stage" value={String(tree.record_profile_data?.production_stage || "-")} />
            </View>
          ) : reliefMode ? (
            <View style={styles.metricRow}>
              <MetricTile label="Response" value={String(tree.record_profile_data?.response_pathway || "-")} />
              <MetricTile label="Population Served" value={tree.record_profile_data?.population_served != null ? String(tree.record_profile_data.population_served) : "-"} />
            </View>
          ) : null}
          {tree.lng != null && tree.lat != null ? (
            <Text style={styles.coordText}>
              Coordinates: {Number(tree.lat).toFixed(6)}, {Number(tree.lng).toFixed(6)}
            </Text>
          ) : null}
          {publicSponsorshipProject && (
            <View style={{ marginTop: spacing.sm }}>
              <PrimaryButton
                label="Print QR Tag"
                onPress={() => {
                  const url = appendDownloadQuery(`${API_URL}/green/trees/${treeId}/qr-tag/pdf`, qrDownloadQuery);
                  Linking.openURL(url).catch(() => {
                    Alert.alert("Error", "Failed to open QR tag PDF.");
                  });
                }}
                variant="ghost"
              />
            </View>
          )}
        </SectionCard>
      )}

      <SectionCard
        title={`${fieldWorkflowMode ? workflowLabels.activityTitle : "Tasks"} (${treeTasks.length})`}
        subtitle={
          fieldWorkflowMode
            ? `All ${workflowLabels.activityTitle.toLowerCase()} assigned to this ${workflowLabels.entitySingular.toLowerCase()}.`
            : "All maintenance and monitoring tasks assigned to this tree."
        }
      >
        {treeTasks.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No tasks found for this {workflowLabels.entitySingular.toLowerCase()}.</Text>
        ) : null}
        {treeTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            <View style={styles.taskHeader}>
              <Text style={styles.taskType}>{formatWorkflowTaskTypeLabel(task.task_type, workflowProfile)}</Text>
              <StatusChip
                label={task.review_state || task.status || "pending"}
                tone={reviewBadge(task.review_state || task.status)}
              />
            </View>
            {task.assignee_name ? <Text style={styles.taskMeta}>Assignee: {task.assignee_name}</Text> : null}
            {task.due_date ? <Text style={styles.taskMeta}>Due: {formatDateTime(task.due_date)}</Text> : null}
            {task.notes ? <Text style={styles.taskNotes}>{task.notes}</Text> : null}
          </View>
        ))}
      </SectionCard>

      <SectionCard
        title={`Timeline (${timeline.length})`}
        subtitle={`Historical record of all events for this ${workflowLabels.entitySingular.toLowerCase()}.`}
      >
        {timeline.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No timeline entries available.</Text>
        ) : null}
        {timeline.map((entry, index) => (
          <View key={entry.id || index} style={styles.timelineRow}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineType}>{entry.event_type || "Event"}</Text>
              {entry.description ? <Text style={styles.timelineDesc}>{entry.description}</Text> : null}
              <Text style={styles.timelineMeta}>
                {entry.actor_name ? `${entry.actor_name} | ` : ""}
                {entry.event_date ? formatDateTime(entry.event_date) : ""}
              </Text>
            </View>
          </View>
        ))}
      </SectionCard>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  coordText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: "italic",
  },
  taskRow: {
    gap: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  taskType: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  taskMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  taskNotes: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  timelineRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 5,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
  },
  timelineType: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  timelineDesc: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  timelineMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
