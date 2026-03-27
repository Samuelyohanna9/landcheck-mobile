import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { MetricTile } from "../../components/MetricTile";
import { StatusChip } from "../../components/StatusChip";
import { useGreenSync } from "../../context/GreenSyncContext";
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

export const TreeDetailScreen = ({ route }: Props) => {
  const { treeId, projectId } = route.params;
  const { trees, isOnline } = useGreenSync();
  const tree = trees.find((t) => t.id === treeId) || null;

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
      setError(getErrorMessage(err, "Failed to load tree details."));
    } finally {
      setLoading(false);
    }
  }, [isOnline, treeId]);

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

  return (
    <ScreenSurface refreshing={loading} onRefresh={() => void loadData()}>
      <ScreenHero
        title={tree ? `Tree #${tree.project_tree_no || tree.id}` : `Tree #${treeId}`}
        subtitle={tree ? `${tree.species || "Unknown species"} | ${tree.status || "Unknown status"}` : "Loading..."}
        badge={tree ? <StatusChip label={tree.status || "Unknown"} tone={chipTone(tree.status)} /> : undefined}
      />

      {error ? (
        <SectionCard title="Error">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      ) : null}

      {tree && (
        <SectionCard title="Tree details" subtitle={`Project ID: ${projectId}`}>
          <View style={styles.metricRow}>
            <MetricTile label="Species" value={tree.species || "-"} />
            <MetricTile label="Status" value={tree.status || "-"} tone={metricTone(tree.status)} />
          </View>
          <View style={styles.metricRow}>
            <MetricTile label="Height (m)" value={tree.tree_height_m != null ? String(tree.tree_height_m) : "-"} />
            <MetricTile label="Age (months)" value={tree.tree_age_months != null ? String(tree.tree_age_months) : "-"} />
          </View>
          <View style={styles.metricRow}>
            <MetricTile label="Origin" value={tree.tree_origin || "new_planting"} />
            <MetricTile label="Planted" value={tree.planting_date ? formatDateTime(tree.planting_date) : "-"} />
          </View>
          {tree.custodian_name ? (
            <View style={styles.metricRow}>
              <MetricTile label="Custodian" value={tree.custodian_name} />
              <MetricTile label="Created by" value={tree.created_by || "-"} />
            </View>
          ) : null}
          {tree.lng != null && tree.lat != null ? (
            <Text style={styles.coordText}>
              Coordinates: {Number(tree.lat).toFixed(6)}, {Number(tree.lng).toFixed(6)}
            </Text>
          ) : null}
        </SectionCard>
      )}

      <SectionCard
        title={`Tasks (${treeTasks.length})`}
        subtitle="All maintenance and monitoring tasks assigned to this tree."
      >
        {treeTasks.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No tasks found for this tree.</Text>
        ) : null}
        {treeTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            <View style={styles.taskHeader}>
              <Text style={styles.taskType}>{task.task_type}</Text>
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
        subtitle="Historical record of all events for this tree."
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
