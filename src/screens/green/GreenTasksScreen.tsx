import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { DateField } from "../../components/DateField";
import { GreenTreeCaptureMap } from "../../components/GreenTreeCaptureMap";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ProjectChip } from "../../components/ProjectChip";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { SelectSheet } from "../../components/SelectSheet";
import { StatusChip } from "../../components/StatusChip";
import { SyncProgressPanel } from "../../components/SyncProgressPanel";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  INSPECTION_STATUS_OPTIONS,
  TASK_STATUS_OPTIONS,
  formatTreeConditionLabel,
  isTaskApproved,
  isTaskLockedForField,
  isTaskMetadataEditRequested,
  isTaskRejected,
  isTaskSubmitted,
  normalizeTreeStatus,
} from "../../green/workflow";
import { normalizePhotoList } from "../../green/normalize";
import { colors, radii, spacing } from "../../theme/tokens";
import type { DraftPhoto, TaskSummary } from "../../types/domain";
import { formatCoordinate, formatDate, formatDateTime, toTitle } from "../../utils/format";

const normalizeValue = (value?: string | null) => String(value || "").trim();
const isLocalDraftUri = (value?: string | null) => /^(file|content|asset|ph):/i.test(String(value || "").trim());

const getTaskPhotoUris = (task: TaskSummary) => normalizePhotoList([...(normalizePhotoList(task.photo_urls)), task.photo_url]);

const hasBaseTaskGps = (task: TaskSummary) =>
  Number.isFinite(task.activity_lat) && Number.isFinite(task.activity_lng);

const isPlantingMetadataTask = (task: TaskSummary) => {
  const taskType = String(task.task_type || "").trim().toLowerCase();
  return taskType === "planting" || taskType === "existing_inventory_intake";
};

const taskSortStamp = (task: TaskSummary) => {
  const candidates = [task.due_date, task.created_at, task.activity_recorded_at];
  for (const value of candidates) {
    const stamp = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(stamp)) return stamp;
  }
  return Number(task.id || 0);
};

export const GreenTasksScreen = () => {
  const navigation = useNavigation<any>();
  const {
    projects,
    tasks,
    trees,
    selectedProjectId,
    selectedProject,
    loading,
    refreshing,
    syncing,
    isOnline,
    isCustodianUser,
    error,
    syncNotice,
    syncProgress,
    selectProject,
    refreshAll,
    updateTree,
    saveTaskUpdate,
    submitTask,
  } = useGreenSync();

  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
  const [notes, setNotes] = useState("");
  const [treeStatus, setTreeStatus] = useState("healthy");
  const [activityLat, setActivityLat] = useState<number | null>(null);
  const [activityLng, setActivityLng] = useState<number | null>(null);
  const [activityRecordedAt, setActivityRecordedAt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [working, setWorking] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [taskStatus, setTaskStatus] = useState("pending");
  const [species, setSpecies] = useState("");
  const [plantingDate, setPlantingDate] = useState("");
  const [treeHeightM, setTreeHeightM] = useState("");
  const [treeAgeMonths, setTreeAgeMonths] = useState("");
  const [treeStatusPickerOpen, setTreeStatusPickerOpen] = useState(false);
  const [taskStatusPickerTaskId, setTaskStatusPickerTaskId] = useState<number | null>(null);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      return taskSortStamp(b) - taskSortStamp(a);
    });
  }, [tasks]);

  const taskStats = useMemo(() => {
    const now = Date.now();
    const submitted = tasks.filter((task) => isTaskSubmitted(task)).length;
    const open = tasks.filter((task) => String(task.status || "").toLowerCase() !== "done").length;
    const overdue = tasks.filter((task) => {
      if (!task.due_date) return false;
      const due = new Date(task.due_date).getTime();
      return Number.isFinite(due) && due < now && String(task.status || "").toLowerCase() !== "done";
    }).length;
    const queued = tasks.filter((task) => task.sync_state === "pending").length;
    return { total: tasks.length, submitted, open, overdue, queued };
  }, [tasks]);

  const selectedTaskTree = useMemo(
    () => trees.find((tree) => tree.id === selectedTask?.tree_id) || null,
    [selectedTask, trees],
  );

  const loadTaskIntoDraft = (task: TaskSummary) => {
    const tree = trees.find((item) => item.id === task.tree_id) || null;
    setNotes(task.notes || "");
    const initialTaskStatus = normalizeTreeStatus(task.reported_tree_status || task.tree_status || "healthy");
    setTreeStatus(
      INSPECTION_STATUS_OPTIONS.some((option) => option.value === initialTaskStatus) ? initialTaskStatus : "healthy",
    );
    const initialWorkflowStatus = String(task.status || "pending").trim().toLowerCase();
    setTaskStatus(TASK_STATUS_OPTIONS.some((option) => option.value === initialWorkflowStatus) ? initialWorkflowStatus : "pending");
    setActivityLat(task.activity_lat ?? null);
    setActivityLng(task.activity_lng ?? null);
    setActivityRecordedAt(task.activity_recorded_at ?? null);
    setSpecies(tree?.species || task.tree_species || "");
    setPlantingDate(tree?.planting_date || task.tree_planting_date || "");
    setTreeHeightM(tree?.tree_height_m === null || tree?.tree_height_m === undefined ? "" : String(tree.tree_height_m));
    setTreeAgeMonths(
      tree?.tree_age_months === null || tree?.tree_age_months === undefined
        ? ""
        : String(Math.round(Number(tree.tree_age_months))),
    );
    setPhotos([]);
    setTaskMessage("");
  };

  useEffect(() => {
    if (!selectedTask) return;
    loadTaskIntoDraft(selectedTask);
  }, [selectedTask]);

  useFocusEffect(
    useCallback(() => {
      if (!isOnline) return undefined;
      void refreshAll();
      return undefined;
    }, [isOnline, refreshAll]),
  );

  const addLibraryPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setTaskMessage("Photo library permission was not granted.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    setPhotos((prev) => [
      ...prev,
      ...result.assets.map((asset) => ({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      })),
    ]);
  };

  const captureCameraPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      setTaskMessage("Camera permission was not granted.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhotos((prev) => [
      ...prev,
      {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      },
    ]);
  };

  const captureGps = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setTaskMessage("Location permission was not granted.");
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    setActivityLat(current.coords.latitude);
    setActivityLng(current.coords.longitude);
    setActivityRecordedAt(new Date().toISOString());
    setTaskMessage(`GPS captured at ${Math.round(current.coords.accuracy || 0)}m accuracy.`);
  };

  const removeDraftPhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.uri !== uri));
  };

  const openDirections = async (lng?: number | null, lat?: number | null) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    try {
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    } catch {
      setTaskMessage("Directions could not be opened on this device.");
    }
  };
  const currentEvidenceCount = selectedTask ? Array.from(new Set([...getTaskPhotoUris(selectedTask), ...photos.map((photo) => photo.uri)])).length : 0;
  const hasSubmissionEvidence = selectedTask ? Boolean(notes.trim() && currentEvidenceCount > 0) : false;

  const validateTaskTreeMetadata = () => {
    if (!selectedTask || !selectedTaskTree || !isPlantingMetadataTask(selectedTask)) return;
    const nextSpecies = normalizeValue(species);
    const nextPlantingDate = normalizeValue(plantingDate);
    const nextHeight = normalizeValue(treeHeightM) ? Number(treeHeightM) : null;
    const nextAge = normalizeValue(treeAgeMonths) ? Number(treeAgeMonths) : null;
    if (!nextSpecies) {
      throw new Error("Species is required for this submission.");
    }
    if (!nextPlantingDate) {
      throw new Error(
        normalizeValue(selectedTaskTree.tree_origin) === "existing_inventory"
          ? "Reference date is required for existing tree metadata."
          : "Planting date is required for this submission.",
      );
    }
    if (normalizeValue(treeHeightM) && (nextHeight === null || !Number.isFinite(nextHeight))) {
      throw new Error("Tree height must be a number between 0 and 120.");
    }
    if (normalizeValue(treeAgeMonths) && (nextAge === null || !Number.isFinite(nextAge))) {
      throw new Error("Estimated tree age must be a number between 0 and 2400 months.");
    }
  };

  const runMutation = async (mode: "save" | "submit") => {
    if (!selectedTask || !selectedProjectId) return;
    setWorking(true);
    setTaskMessage("");
    try {
      if (mode === "submit" && !hasSubmissionEvidence) {
        throw new Error("Add notes and photo proof before submission.");
      }
      validateTaskTreeMetadata();
      const nextHeight = normalizeValue(treeHeightM) ? Number(treeHeightM) : null;
      const nextAge = normalizeValue(treeAgeMonths) ? Number(treeAgeMonths) : null;
      if (nextHeight !== null && !Number.isFinite(nextHeight)) {
        throw new Error("Tree height must be numeric.");
      }
      if (normalizeValue(treeAgeMonths) && !Number.isFinite(nextAge)) {
        throw new Error("Tree age must be numeric.");
      }
      if (selectedTaskTree) {
        const nextSpecies = normalizeValue(species);
        const nextPlantingDate = normalizeValue(plantingDate) || null;
        const treeOrigin = normalizeValue(selectedTaskTree.tree_origin || "new_planting");
        const nextStatus = normalizeTreeStatus(treeStatus);
        const prevStatus = normalizeTreeStatus(selectedTaskTree.status || selectedTask.tree_status);
        const metadataChanged =
          nextSpecies !== normalizeValue(selectedTaskTree.species) ||
          nextPlantingDate !== (selectedTaskTree.planting_date || null) ||
          nextStatus !== prevStatus ||
          nextHeight !== (selectedTaskTree.tree_height_m ?? null) ||
          (treeOrigin === "existing_inventory" ? nextAge : null) !== (selectedTaskTree.tree_age_months ?? null);
        if (metadataChanged) {
          await updateTree({
            projectId: selectedProjectId,
            treeId: selectedTaskTree.id,
            species: nextSpecies || undefined,
            plantingDate: nextPlantingDate,
            status: nextStatus || undefined,
            treeHeightM: nextHeight,
            treeAgeMonths: treeOrigin === "existing_inventory" ? nextAge : null,
          });
        }
      }
      const payload = {
        projectId: selectedProjectId,
        taskId: selectedTask.id,
        treeId: selectedTask.tree_id,
        status: mode === "submit" ? "done" : taskStatus,
        notes,
        treeStatus,
        activityLat,
        activityLng,
        activityRecordedAt,
        photos,
        existingPhotoUrls: getTaskPhotoUris(selectedTask).filter((uri) => !isLocalDraftUri(uri)),
        existingPhotoUrl: getTaskPhotoUris(selectedTask)
          .filter((uri) => !isLocalDraftUri(uri))
          .slice(-1)[0] || null,
      };
      const result = mode === "submit" ? await submitTask(payload) : await saveTaskUpdate(payload);
      setPhotos([]);
      setTaskMessage(result.message);
      if (mode === "submit" && !result.queued) {
        setSelectedTask(null);
      }
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : "Task action failed.");
    } finally {
      setWorking(false);
    }
  };

  const getTaskEvidenceCount = (task: TaskSummary) => {
    const base = getTaskPhotoUris(task);
    if (selectedTask?.id !== task.id) return base.length;
    return Array.from(new Set([...base, ...photos.map((photo) => photo.uri)])).length;
  };

  const hasTaskGpsCapture = (task: TaskSummary) => {
    if (selectedTask?.id !== task.id) return hasBaseTaskGps(task);
    return activityLat !== null && activityLng !== null;
  };

  const renderStatusBadge = (task: TaskSummary) => {
    if (isTaskApproved(task)) {
      return (
        <View style={[styles.statusBadge, styles.statusApproved]}>
          <Text style={[styles.statusBadgeText, styles.statusApprovedText]}>
            Approved / {formatTreeConditionLabel(task.reported_tree_status || task.tree_status || "healthy")}
          </Text>
        </View>
      );
    }
    if (isTaskSubmitted(task)) {
      return (
        <View style={[styles.statusBadge, styles.statusSubmitted]}>
          <Text style={[styles.statusBadgeText, styles.statusSubmittedText]}>Submitted</Text>
        </View>
      );
    }
    if (isTaskRejected(task)) {
      return (
        <View style={[styles.statusBadge, styles.statusRejected]}>
          <Text style={[styles.statusBadgeText, styles.statusRejectedText]}>Rejected</Text>
        </View>
      );
    }
    return null;
  };

  const renderTaskStatusControl = (task: TaskSummary) => {
    const lockedBadge = renderStatusBadge(task);
    if (lockedBadge) return lockedBadge;
    const activeStatus = selectedTask?.id === task.id ? taskStatus : String(task.status || "pending");
    return (
      <Pressable
        onPress={() => {
          if (selectedTask?.id !== task.id) {
            setSelectedTask(task);
            loadTaskIntoDraft(task);
          }
          setTaskStatusPickerTaskId(task.id);
        }}
        style={styles.statusSelectField}
      >
        <Text style={styles.statusSelectValue}>{toTitle(activeStatus)}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSoft} />
      </Pressable>
    );
  };

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <ScreenHero
        title="Maintenance Tasks"
        badge={<StatusChip label={isOnline ? "ONLINE" : "OFFLINE"} tone={isOnline ? "online" : "offline"} />}
        rightSlot={
          navigation.canGoBack() ? (
            <Pressable onPress={() => navigation.goBack()} style={styles.topButton}>
              <Text style={styles.topButtonText}>Back Home</Text>
            </Pressable>
          ) : null
        }
      />

      <SectionCard title="Project" subtitle={undefined}>
        <View style={styles.projectChipRow}>
          {projects.map((project) => (
            <ProjectChip key={project.id} label={project.name} active={selectedProject?.id === project.id} onPress={() => void selectProject(project.id)} />
          ))}
        </View>
        {selectedProject ? <Text style={styles.scopeText}>{selectedProject.name} | {selectedProject.location_text || "Project selected"}</Text> : null}
        <SyncProgressPanel progress={syncProgress} />
        {syncNotice ? <Text style={styles.scopeNote}>{syncNotice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.metricRow}>
          <MetricTile label="Open" value={taskStats.open} tone="success" helper="Pending field action" />
          <MetricTile label="Submitted" value={taskStats.submitted} helper="Awaiting / after review" />
        </View>
      </SectionCard>

      <SectionCard
        title="Maintenance Tasks"
        subtitle={undefined}
        rightSlot={
          <Pressable onPress={() => void refreshAll()} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        }
      >
        {!selectedProject ? (
          <EmptyState title="No project selected" subtitle="Select a project before opening maintenance tasks." />
        ) : isCustodianUser ? (
          <EmptyState title="Maintenance disabled" subtitle="Maintenance tasks are disabled for custodians. Use Map & Add Trees to record custodian planting." />
        ) : loading ? (
          <Text style={styles.infoText}>Loading tasks...</Text>
        ) : !sortedTasks.length ? (
          <EmptyState title="No tasks assigned" subtitle="Assigned maintenance and planting tasks will appear here." />
        ) : (
          <>
            {sortedTasks.map((task) => {
              const editing = selectedTask?.id === task.id;
              const taskTree = trees.find((tree) => tree.id === task.tree_id) || null;
              const evidenceCount = getTaskEvidenceCount(task);
              const gpsCaptured = hasTaskGpsCapture(task);
              return (
                <View key={task.id} style={[styles.taskEntry, isTaskLockedForField(task) && styles.taskEntryLocked]}>
                  <View style={styles.taskDataBlock}>
                    <View style={styles.taskLine}>
                      <Text style={styles.taskLineLabel}>Task</Text>
                      <Text style={styles.taskLineValue}>{task.task_type}</Text>
                    </View>
                    <View style={styles.taskLine}>
                      <Text style={styles.taskLineLabel}>Tree</Text>
                      <Text style={styles.taskLineValue}>#{task.tree_id}</Text>
                    </View>
                    <View style={styles.taskLine}>
                      <Text style={styles.taskLineLabel}>Status</Text>
                      <View style={styles.taskLineValueWrap}>{renderTaskStatusControl(task)}</View>
                    </View>
                    <View style={styles.taskLine}>
                      <Text style={styles.taskLineLabel}>Due</Text>
                      <Text style={styles.taskLineValue}>{formatDate(task.due_date)}</Text>
                    </View>
                    <View style={styles.taskLine}>
                      <Text style={styles.taskLineLabel}>Action</Text>
                      <View style={[styles.taskLineValueWrap, styles.taskActionRow]}>
                        {isTaskLockedForField(task) ? (
                          <View style={styles.lockedPill}>
                            <Text style={styles.lockedPillText}>{isTaskSubmitted(task) ? "Submitted" : "Approved"}</Text>
                          </View>
                        ) : (
                          <>
                            <Pressable
                              style={styles.rowButton}
                              onPress={() => {
                                if (editing) {
                                  setSelectedTask(null);
                                  setTaskMessage("");
                                } else {
                                  setSelectedTask(task);
                                  loadTaskIntoDraft(task);
                                }
                              }}
                            >
                              <Text style={styles.rowButtonText}>{editing ? "Close" : "Edit"}</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.rowButton, isTaskSubmitted(task) && styles.rowButtonDisabled]}
                              disabled={isTaskSubmitted(task)}
                              onPress={() => {
                                if (!editing) {
                                  setSelectedTask(task);
                                  loadTaskIntoDraft(task);
                                  setTaskMessage("Review the task details, then submit for review.");
                                  return;
                                }
                                void runMutation("submit");
                              }}
                            >
                              <Text style={styles.rowButtonText}>{isTaskSubmitted(task) ? "Awaiting Review" : "Submit"}</Text>
                            </Pressable>
                            {Number.isFinite(task.lng) && Number.isFinite(task.lat) ? (
                              <Pressable style={styles.rowButton} onPress={() => void openDirections(task.lng, task.lat)}>
                                <Text style={styles.rowButtonText}>Directions</Text>
                              </Pressable>
                            ) : null}
                          </>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.infoRowWrap}>
                    <View style={styles.taskLine}>
                      <Text style={styles.taskLineLabel}>Verification</Text>
                      <Text style={[styles.infoRowText, styles.taskLineInfoValue]}>
                        Review: {task.review_state || "none"} | Evidence: {evidenceCount > 0 ? "complete" : "missing"} | GPS: {gpsCaptured ? "captured" : "missing"}
                        {isTaskMetadataEditRequested(task) ? " | Metadata edit requested" : ""}
                      </Text>
                    </View>
                  </View>

                  {(isTaskRejected(task) || isTaskMetadataEditRequested(task)) && task.review_notes ? (
                    <View style={styles.infoRowWrap}>
                      <Text style={styles.supervisorNote}>Supervisor note: {task.review_notes}</Text>
                    </View>
                  ) : null}

                  {editing ? (
                    <View style={styles.editorCard}>
                      <GreenTreeCaptureMap
                        trees={trees}
                        focusTreeId={task.tree_id}
                        captureLocation={activityLat !== null && activityLng !== null ? { latitude: activityLat, longitude: activityLng } : null}
                        interactive={!isTaskLockedForField(task)}
                        onPickLocation={(next) => {
                          if (isTaskLockedForField(task)) return;
                          setActivityLat(next.latitude);
                          setActivityLng(next.longitude);
                          setActivityRecordedAt(new Date().toISOString());
                          setTaskMessage("Activity point updated from the map.");
                        }}
                        mapHeight={220}
                        overlayTitle="Tap the map to record activity position"
                        overlaySubtitle="The highlighted marker is the assigned tree. Use the map or device GPS to record where maintenance happened."
                      />

                      {taskTree ? (
                        <Text style={styles.mapHint}>
                          Tree target: #{taskTree.project_tree_no || taskTree.id} | {taskTree.species || "Unspecified"} | {taskTree.lat !== null && taskTree.lng !== null ? `${formatCoordinate(taskTree.lat)}, ${formatCoordinate(taskTree.lng)}` : "GPS missing"}
                        </Text>
                      ) : null}

                      <Text style={styles.label}>Task Status</Text>
                      <Pressable
                        onPress={() => {
                          if (isTaskLockedForField(task)) return;
                          setTaskStatusPickerTaskId(task.id);
                        }}
                        style={[styles.input, styles.selectField, isTaskLockedForField(task) && styles.inputDisabled]}
                      >
                        <Text style={styles.selectValue}>
                          {TASK_STATUS_OPTIONS.find((option) => option.value === taskStatus)?.label || "Select task status"}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                      </Pressable>

                      <Text style={styles.label}>Species</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Species"
                        placeholderTextColor={colors.textMuted}
                        value={species}
                        onChangeText={setSpecies}
                        editable={!isTaskLockedForField(task)}
                      />

                      <Text style={styles.label}>{selectedTaskTree?.tree_origin === "existing_inventory" ? "Reference Date" : "Planting Date"}</Text>
                      <DateField
                        value={plantingDate}
                        onChange={setPlantingDate}
                        placeholder={selectedTaskTree?.tree_origin === "existing_inventory" ? "Select reference date" : "Select planting date"}
                        disabled={isTaskLockedForField(task)}
                      />

                      <View style={styles.formRow}>
                        <View style={styles.formCol}>
                          <Text style={styles.label}>Tree Height (m)</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Tree height (m)"
                            placeholderTextColor={colors.textMuted}
                            value={treeHeightM}
                            onChangeText={setTreeHeightM}
                            keyboardType="decimal-pad"
                            editable={!isTaskLockedForField(task)}
                          />
                        </View>
                        {selectedTaskTree?.tree_origin === "existing_inventory" ? (
                          <View style={styles.formCol}>
                            <Text style={styles.label}>Estimated Age (months)</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="Age (months)"
                              placeholderTextColor={colors.textMuted}
                              value={treeAgeMonths}
                              onChangeText={setTreeAgeMonths}
                              keyboardType="number-pad"
                              editable={!isTaskLockedForField(task)}
                            />
                          </View>
                        ) : null}
                      </View>

                      {isTaskMetadataEditRequested(task) ? (
                        <View style={styles.infoRowWrap}>
                          <Text style={styles.supervisorNote}>Supervisor asked for metadata correction only. Update the fields above, then resubmit.</Text>
                        </View>
                      ) : null}

                      <Text style={styles.label}>Notes</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        multiline
                        placeholder="Field notes"
                        placeholderTextColor={colors.textMuted}
                        value={notes}
                        onChangeText={setNotes}
                        editable={!isTaskLockedForField(task)}
                      />

                      <Text style={styles.label}>Tree Condition</Text>
                      <Pressable
                        onPress={() => {
                          if (isTaskLockedForField(task)) return;
                          setTreeStatusPickerOpen(true);
                        }}
                        style={[styles.input, styles.selectField, isTaskLockedForField(task) && styles.inputDisabled]}
                      >
                        <Text style={styles.selectValue}>
                          {INSPECTION_STATUS_OPTIONS.find((option) => option.value === treeStatus)?.label || "Select tree condition"}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                      </Pressable>

                      <Text style={styles.label}>Maintenance GPS</Text>
                      <View style={styles.formRow}>
                        <View style={styles.formCol}>
                          <PrimaryButton label="Use Current GPS" onPress={() => void captureGps()} variant="secondary" disabled={isTaskLockedForField(task)} />
                        </View>
                        <View style={styles.formCol}>
                          {activityLat !== null && activityLng !== null ? (
                            <PrimaryButton label="Open GPS Point" onPress={() => void openDirections(activityLng, activityLat)} variant="secondary" disabled={isTaskLockedForField(task)} />
                          ) : (
                            <View />
                          )}
                        </View>
                      </View>
                      <Text style={styles.gpsMeta}>
                        {activityLat !== null && activityLng !== null
                          ? `Captured at ${formatCoordinate(activityLat)}, ${formatCoordinate(activityLng)}${activityRecordedAt ? ` on ${formatDateTime(activityRecordedAt)}` : ""}`
                          : "No maintenance GPS captured yet."}
                      </Text>

                      <Text style={styles.label}>Photo Proof</Text>
                      <View style={styles.formRow}>
                        <View style={styles.formCol}>
                          <PrimaryButton label="Camera" onPress={() => void captureCameraPhoto()} variant="secondary" disabled={isTaskLockedForField(task)} />
                        </View>
                        <View style={styles.formCol}>
                          <PrimaryButton label="Photo Library" onPress={() => void addLibraryPhotos()} variant="secondary" disabled={isTaskLockedForField(task)} />
                        </View>
                      </View>

                      {getTaskPhotoUris(task).length ? (
                        <View style={styles.photoSection}>
                          <Text style={styles.photoSectionLabel}>Existing evidence</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                            {getTaskPhotoUris(task).map((uri) => (
                              <Image key={uri} source={{ uri }} style={styles.photo} resizeMode="cover" />
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}

                      {photos.length ? (
                        <View style={styles.photoSection}>
                          <Text style={styles.photoSectionLabel}>New evidence</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                            {photos.map((photo) => (
                              <Pressable key={photo.uri} onPress={() => removeDraftPhoto(photo.uri)} style={styles.photoWrap}>
                                <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
                                <View style={styles.photoPill}>
                                  <Text style={styles.photoPillText}>Remove</Text>
                                </View>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}

                      {taskMessage ? <Text style={styles.message}>{taskMessage}</Text> : null}

                      <View style={styles.footerButtons}>
                        <PrimaryButton
                          label={working ? "Saving..." : "Save Task Update"}
                          onPress={() => void runMutation("save")}
                          disabled={working || syncing || isTaskLockedForField(task)}
                        />
                        <PrimaryButton
                          label={isTaskSubmitted(task) ? "Awaiting Review" : working ? "Submitting..." : "Submit for Review"}
                          onPress={() => void runMutation("submit")}
                          disabled={working || syncing || isTaskLockedForField(task)}
                          variant="secondary"
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </SectionCard>
      <SelectSheet
        visible={treeStatusPickerOpen}
        title="Tree Condition"
        options={INSPECTION_STATUS_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
        selectedValue={treeStatus}
        onClose={() => setTreeStatusPickerOpen(false)}
        onSelect={(value) => {
          setTreeStatusPickerOpen(false);
          setTreeStatus(value);
        }}
      />
      <SelectSheet
        visible={taskStatusPickerTaskId !== null}
        title="Task Status"
        options={TASK_STATUS_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
        selectedValue={taskStatus}
        onClose={() => setTaskStatusPickerTaskId(null)}
        onSelect={(value) => {
          setTaskStatusPickerTaskId(null);
          setTaskStatus(value);
        }}
      />
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
  projectChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  scopeText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  scopeNote: {
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
  taskEntry: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    overflow: "hidden",
    gap: 0,
  },
  taskEntryLocked: {
    backgroundColor: colors.panelMuted,
  },
  taskDataBlock: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  taskLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  taskLineLabel: {
    width: 88,
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  taskLineValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    minWidth: 0,
  },
  taskLineValueWrap: {
    flex: 1,
    minWidth: 0,
  },
  statusBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusApproved: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
  },
  statusApprovedText: {
    color: colors.primaryDark,
  },
  statusSubmitted: {
    backgroundColor: "rgba(217,138,21,0.12)",
    borderColor: "rgba(217,138,21,0.28)",
  },
  statusSubmittedText: {
    color: "#8a5600",
  },
  statusRejected: {
    backgroundColor: "rgba(213,83,83,0.10)",
    borderColor: "rgba(213,83,83,0.24)",
  },
  statusRejectedText: {
    color: colors.danger,
  },
  statusPending: {
    backgroundColor: colors.panel,
    borderColor: colors.borderStrong,
  },
  statusPendingText: {
    color: colors.textSoft,
  },
  statusSelectField: {
    minHeight: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  statusSelectValue: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
  },
  taskActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-start",
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  rowButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  rowButtonDisabled: {
    opacity: 0.62,
  },
  rowButtonText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
  },
  lockedPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  lockedPillText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
  },
  infoRowWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  infoRowText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  taskLineInfoValue: {
    paddingTop: 1,
  },
  supervisorNote: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  editorCard: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.panel,
  },
  mapHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  optionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionChipDisabled: {
    opacity: 0.55,
  },
  optionChipLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  optionChipLabelActive: {
    color: colors.primaryDark,
  },
  optionChipLabelDisabled: {
    color: colors.textMuted,
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formCol: {
    flex: 1,
  },
  input: {
    minHeight: 50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    fontWeight: "600",
  },
  inputDisabled: {
    opacity: 0.7,
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  selectValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.md,
    textAlignVertical: "top",
  },
  gpsMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  photoSection: {
    gap: 8,
  },
  photoSectionLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  photoRow: {
    gap: spacing.sm,
  },
  photoWrap: {
    width: 92,
    height: 92,
    borderRadius: radii.md,
    overflow: "hidden",
    position: "relative",
  },
  photo: {
    width: 92,
    height: 92,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  photoPill: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(7,24,14,0.72)",
    paddingVertical: 4,
    alignItems: "center",
  },
  photoPillText: {
    color: colors.inverseText,
    fontSize: 10,
    fontWeight: "800",
  },
  message: {
    color: colors.primaryDark,
    fontSize: 13,
    lineHeight: 19,
  },
  footerButtons: {
    gap: spacing.sm,
  },
});
