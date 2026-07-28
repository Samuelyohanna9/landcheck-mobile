import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { MetricTile } from "../../components/MetricTile";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { SyncProgressPanel } from "../../components/SyncProgressPanel";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  FIELD_CAPTURE_TASK_TYPE,
  formatTreeConditionLabel,
  formatWorkflowTaskTypeLabel,
  isTaskApproved,
  isTaskMetadataEditRequested,
  isTaskRejected,
  isTaskSubmitted,
  normalizeTaskState,
  PLANTING_TASK_TYPES,
} from "../../green/workflow";
import { normalizePhotoList } from "../../green/normalize";
import { getProjectWorkflowProfile, getWorkflowLabels, isAgricProject, isReliefRecoveryProject } from "../../green/projectProfile";
import { isHiddenSupportPlaceholderTree } from "../../green/treeRecords";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatDate, toTitle } from "../../utils/format";
import type { TaskSummary } from "../../types/domain";

type TaskBoardMode = "maintenance" | "review";

const getTaskPhotoUris = (task: TaskSummary) => normalizePhotoList([...(normalizePhotoList(task.photo_urls)), task.photo_url]);

const taskSortStamp = (task: TaskSummary) => {
  const candidates = [task.due_date, task.created_at, task.activity_recorded_at, task.submitted_at];
  for (const value of candidates) {
    const stamp = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(stamp)) return stamp;
  }
  return Number(task.id || 0);
};

const isMaintenanceBoardTask = (task: TaskSummary) =>
  normalizeTaskState(task.task_type) !== FIELD_CAPTURE_TASK_TYPE &&
  !PLANTING_TASK_TYPES.has(normalizeTaskState(task.task_type)) &&
  !isTaskRejected(task) &&
  !isTaskMetadataEditRequested(task);

const isReviewBoardTask = (task: TaskSummary) => isTaskRejected(task) || isTaskMetadataEditRequested(task);

const getBoardMode = (routeName: string, routeMode?: string | null): TaskBoardMode => {
  if (routeMode === "review" || routeName === "GreenReview") return "review";
  return "maintenance";
};

const renderBoardStateChip = (task: TaskSummary, mode: TaskBoardMode) => {
  if (mode === "review") {
    if (isTaskMetadataEditRequested(task)) return <StatusChip label="METADATA EDIT" tone="warning" />;
    return <StatusChip label="RETURNED" tone="offline" />;
  }
  if (isTaskApproved(task)) return <StatusChip label="DONE" tone="online" />;
  if (isTaskSubmitted(task)) return <StatusChip label="SUBMITTED" tone="warning" />;
  return <StatusChip label="UNDONE" tone="offline" />;
};

export const GreenTasksScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const mode = getBoardMode(route.name, route.params?.mode);
  const {
    tasks,
    trees,
    selectedProject,
    loading,
    refreshing,
    isOnline,
    error,
    syncNotice,
    syncProgress,
    refreshAll,
  } = useGreenSync();

  useFocusEffect(
    useCallback(() => {
      if (!isOnline) return undefined;
      void refreshAll();
      return undefined;
    }, [isOnline, refreshAll]),
  );

  const boardTasks = useMemo(() => {
    const filtered = tasks.filter((task) => (mode === "review" ? isReviewBoardTask(task) : isMaintenanceBoardTask(task)));
    return filtered.sort((a, b) => taskSortStamp(b) - taskSortStamp(a));
  }, [mode, tasks]);
  const treeById = useMemo(() => new Map(trees.map((tree) => [Number(tree.id), tree])), [trees]);
  const agricMode = useMemo(() => isAgricProject(selectedProject || null), [selectedProject]);
  const reliefMode = useMemo(() => isReliefRecoveryProject(selectedProject || null), [selectedProject]);
  const fieldWorkflowMode = agricMode || reliefMode;
  const workflowProfile = useMemo(() => getProjectWorkflowProfile(selectedProject || null), [selectedProject]);
  const workflowLabels = useMemo(() => getWorkflowLabels(selectedProject || null), [selectedProject]);

  const boardStats = useMemo(() => {
    if (mode === "review") {
      const metadataEdits = boardTasks.filter((task) => isTaskMetadataEditRequested(task)).length;
      const rejected = boardTasks.filter((task) => isTaskRejected(task)).length;
      return {
        primaryLabel: "Returned",
        primaryValue: boardTasks.length,
        secondaryLabel: "Metadata edits",
        secondaryValue: metadataEdits,
        tertiaryLabel: "Rejected",
        tertiaryValue: rejected,
      };
    }
    const open = boardTasks.filter((task) => !isTaskApproved(task) && !isTaskSubmitted(task)).length;
    const submitted = boardTasks.filter((task) => isTaskSubmitted(task)).length;
    const approved = boardTasks.filter((task) => isTaskApproved(task)).length;
    return {
      primaryLabel: "Open",
      primaryValue: open,
      secondaryLabel: "Submitted",
      secondaryValue: submitted,
      tertiaryLabel: "Approved",
      tertiaryValue: approved,
    };
  }, [boardTasks, mode]);

  const openTask = (task: TaskSummary) => {
    navigation.navigate("GreenTaskDetail", { taskId: task.id, mode });
  };

  const heroTitle = mode === "review" ? "Review" : workflowLabels.activityTitle;
  const heroSubtitle =
    mode === "review"
      ? "Returned tasks and metadata corrections for the selected project."
      : `Assigned ${workflowLabels.activityTitle.toLowerCase()} for the selected project.`;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <ScreenHero
        title={heroTitle}
        badge={<StatusChip label={isOnline ? "ONLINE" : "OFFLINE"} tone={isOnline ? "online" : "offline"} />}
      />

      <SectionCard title="Current project" subtitle={heroSubtitle}>
        {selectedProject ? (
          <>
            <Text style={styles.projectName}>{selectedProject.name}</Text>
            <Text style={styles.projectMeta}>{selectedProject.location_text || "Project selected"}</Text>
            <SyncProgressPanel progress={syncProgress} />
            {syncNotice ? <Text style={styles.syncNote}>{syncNotice}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.metricRow}>
              <MetricTile label={boardStats.primaryLabel} value={boardStats.primaryValue} tone={mode === "review" ? "warning" : "success"} />
              <MetricTile label={boardStats.secondaryLabel} value={boardStats.secondaryValue} />
              <MetricTile label={boardStats.tertiaryLabel} value={boardStats.tertiaryValue} helper={mode === "review" ? "Need supervisor-ready correction" : "Completed and accepted"} />
            </View>
          </>
        ) : (
          <EmptyState
            title="No project selected"
            subtitle={`Choose a project from Overview first. The selected project drives ${workflowLabels.activityTitle} and Review.`}
          />
        )}
      </SectionCard>

      <SectionCard
        title={mode === "review" ? "Review queue" : workflowLabels.activityTitle}
        subtitle={
          mode === "review"
            ? "Open the returned task to correct and resubmit it."
            : `Open any ${workflowLabels.activityTitleSingular.toLowerCase()} to record notes, photo evidence, and current GPS.`
        }
        rightSlot={
          <Pressable onPress={() => void refreshAll()} style={styles.refreshButton}>
            <Ionicons name="refresh" size={16} color={colors.primaryDark} />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        }
      >
        {!selectedProject ? (
          <EmptyState title="Project required" subtitle="Open Overview and select the project you want to work on." />
        ) : loading ? (
          <Text style={styles.infoText}>Loading tasks...</Text>
        ) : !boardTasks.length ? (
          <EmptyState
            title={mode === "review" ? "No returned tasks" : `No ${workflowLabels.activityTitle.toLowerCase()}`}
            subtitle={
              mode === "review"
                ? "Rejected and metadata-edit tasks will appear here."
                : `Assigned ${workflowLabels.activityTitle.toLowerCase()} for the selected project will appear here.`
            }
          />
        ) : (
          boardTasks.map((task) => {
            const evidenceCount = getTaskPhotoUris(task).length;
            const reviewState = normalizeTaskState(task.review_state);
            const taskTree = treeById.get(Number(task.tree_id)) || null;
            const hiddenPlaceholderTree = isHiddenSupportPlaceholderTree(taskTree);
            const taskRecordNo = taskTree?.project_tree_no || task.tree_id;
            return (
              <Pressable key={task.id} style={styles.taskCard} onPress={() => openTask(task)}>
                <View style={styles.taskHeadRow}>
                  <View style={styles.taskTitleBlock}>
                    <Text style={styles.taskTitle}>{formatWorkflowTaskTypeLabel(task.task_type, workflowProfile)}</Text>
                    <Text style={styles.taskSubtitle}>
                      {hiddenPlaceholderTree ? `${reliefMode ? "Site pending capture" : "Plot pending capture"} | Task #${task.id}` : `${workflowLabels.entitySingular} #${taskRecordNo}`}
                      {!hiddenPlaceholderTree && (taskTree?.species || task.tree_species) ? ` | ${taskTree?.species || task.tree_species}` : ""}
                      {task.due_date ? ` | Due ${formatDate(task.due_date)}` : ""}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                </View>

                <View style={styles.chipRow}>
                  {renderBoardStateChip(task, mode)}
                  {task.priority ? <StatusChip label={`Priority ${toTitle(task.priority)}`} tone="neutral" /> : null}
                  {task.reported_tree_status ? <StatusChip label={formatTreeConditionLabel(task.reported_tree_status)} tone="neutral" /> : null}
                </View>

                <Text style={styles.detailText}>
                  {mode === "review"
                    ? reviewState === "metadata_edit"
                      ? "Correct the requested metadata and resubmit. Original evidence stays attached."
                      : "Open this returned task, capture current field evidence again if needed, and resubmit."
                    : `Open this ${fieldWorkflowMode ? workflowLabels.activityTitleSingular.toLowerCase() : "activity"} to capture notes, current GPS, and camera evidence from the field.`}
                </Text>

                {task.review_notes ? <Text style={styles.reviewNote}>Supervisor note: {task.review_notes}</Text> : null}

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>
                    Evidence on file: {evidenceCount} photo{evidenceCount === 1 ? "" : "s"}
                  </Text>
                  <Text style={styles.footerAction}>
                    {mode === "review" ? "Open review" : isTaskApproved(task) || isTaskSubmitted(task) ? "View details" : "Open task"}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </SectionCard>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 124,
  },
  projectName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  projectMeta: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  syncNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  refreshButtonText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  infoText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  taskCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  taskHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  taskTitleBlock: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  taskSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  detailText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  reviewNote: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  footerText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
  footerAction: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
});
