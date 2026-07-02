import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { DateField } from "../../components/DateField";
import { EmptyState } from "../../components/EmptyState";
import { GreenTreeCaptureMap } from "../../components/GreenTreeCaptureMap";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { SelectSheet } from "../../components/SelectSheet";
import { StatusChip } from "../../components/StatusChip";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  formatTreeConditionLabel,
  formatWorkflowTaskTypeLabel,
  INSPECTION_STATUS_OPTIONS,
  isTaskApproved,
  isTaskMetadataEditRequested,
  isTaskSubmitted,
  normalizeTreeStatus,
  PLANTING_TASK_TYPES,
} from "../../green/workflow";
import { normalizePhotoList } from "../../green/normalize";
import { getProjectWorkflowProfile, getWorkflowLabels, isAgricProject, isReliefRecoveryProject } from "../../green/projectProfile";
import { isHiddenSupportPlaceholderTree } from "../../green/treeRecords";
import { colors, radii, spacing } from "../../theme/tokens";
import { API_URL } from "../../config/env";
import type { DraftPhoto, TaskSummary } from "../../types/domain";
import { formatCoordinate, formatDate, formatDateTime, toTitle } from "../../utils/format";

type TaskDetailMode = "maintenance" | "review";
type TaskFieldErrors = Partial<
  Record<
    | "metadata"
    | "species"
    | "plantingDate"
    | "treeHeightM"
    | "treeAgeMonths"
    | "treeStatus"
    | "notes"
    | "gps"
    | "photos",
    string
  >
>;

const normalizeValue = (value?: string | null) => String(value || "").trim();
const isLocalDraftUri = (value?: string | null) => /^(file|content|asset|ph):/i.test(String(value || "").trim());
const getTaskPhotoUris = (task: TaskSummary) => normalizePhotoList([...(normalizePhotoList(task.photo_urls)), task.photo_url]);
const isPlantingMetadataTask = (task: TaskSummary) => PLANTING_TASK_TYPES.has(String(task.task_type || "").trim().toLowerCase());
const buildAgentQrDownloadQuery = (user?: { id?: number | null; organization_id?: number | null } | null) => {
  const pairs: string[] = [];
  const userId = Number(user?.id || 0);
  const organizationId = Number(user?.organization_id || 0);
  if (userId > 0) pairs.push(`user_id=${encodeURIComponent(String(userId))}`);
  if (organizationId > 0) pairs.push(`organization_id=${encodeURIComponent(String(organizationId))}`);
  return pairs.join("&");
};
const appendDownloadQuery = (url: string, query: string) => (query ? `${url}?${query}` : url);

const FieldLabel = ({ label, required = false }: { label: string; required?: boolean }) => (
  <Text style={styles.label}>
    {label}
    {required ? <Text style={styles.requiredAsterisk}> *</Text> : null}
  </Text>
);

const FieldError = ({ message }: { message?: string }) =>
  message ? <Text style={styles.fieldError}>{message}</Text> : null;

export const GreenTaskDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { session } = useAuth();
  const taskId = Number(route.params?.taskId || 0);
  const mode: TaskDetailMode = route.params?.mode === "review" ? "review" : "maintenance";
  const {
    tasks,
    trees,
    selectedProject,
    selectedProjectId,
    refreshing,
    isOnline,
    syncing,
    refreshAll,
    updateTree,
    saveTaskUpdate,
    submitTask,
  } = useGreenSync();

  const task = useMemo(() => tasks.find((item) => Number(item.id) === taskId) || null, [taskId, tasks]);
  const taskTree = useMemo(() => trees.find((tree) => tree.id === task?.tree_id) || null, [task, trees]);
  const agricMode = useMemo(() => isAgricProject(selectedProject || null), [selectedProject]);
  const reliefMode = useMemo(() => isReliefRecoveryProject(selectedProject || null), [selectedProject]);
  const fieldWorkflowMode = agricMode || reliefMode;
  const publicSponsorshipProject = !fieldWorkflowMode && (
    String(selectedProject?.access_model || "").trim().toLowerCase() === "public_sponsorship" ||
    Boolean(selectedProject?.public_sponsor_enabled)
  );
  const workflowProfile = useMemo(() => getProjectWorkflowProfile(selectedProject || null), [selectedProject]);
  const workflowLabels = useMemo(() => getWorkflowLabels(selectedProject || null), [selectedProject]);
  const qrDownloadQuery = useMemo(
    () => buildAgentQrDownloadQuery(session?.user),
    [session?.user?.id, session?.user?.organization_id],
  );
  const hiddenPlaceholderTree = useMemo(() => isHiddenSupportPlaceholderTree(taskTree), [taskTree]);
  const metadataOnlyReview = Boolean(task && isTaskMetadataEditRequested(task));
  const supportsTreeMetadata = Boolean(
    task && (isPlantingMetadataTask(task) || (taskTree?.tree_origin === "existing_inventory" && !hiddenPlaceholderTree) || metadataOnlyReview),
  );
  const readOnlyMaintenance = Boolean(task && mode === "maintenance" && (isTaskApproved(task) || isTaskSubmitted(task)));
  const taskRecordNo = taskTree?.project_tree_no || task?.tree_id || 0;
  const taskTargetLabel = hiddenPlaceholderTree
    ? reliefMode
      ? `Site pending capture | Task #${task?.id || 0}`
      : `Plot pending capture | Task #${task?.id || 0}`
    : task
      ? `${workflowLabels.entitySingular} #${taskRecordNo}`
      : workflowLabels.entitySingular;
  const taskMapSubtitle = hiddenPlaceholderTree
    ? reliefMode
      ? "No saved site GPS yet. Capture current GPS and relief evidence during this visit."
      : "No saved plot GPS yet. Capture current GPS and visit evidence during this support visit."
    : metadataOnlyReview
      ? `Review the ${workflowLabels.entitySingular.toLowerCase()} context. Metadata-only resubmission keeps the original evidence.`
      : `The highlighted marker is the assigned ${workflowLabels.entitySingular.toLowerCase()}. GPS submission must still use the device location button.`;
  const taskMapOverlayTitle = hiddenPlaceholderTree
    ? reliefMode
      ? "Relief visit target"
      : "Support visit target"
    : metadataOnlyReview
      ? `${workflowLabels.entitySingular} location`
      : "Tap map for reference only";
  const taskMapOverlaySubtitle = hiddenPlaceholderTree
    ? reliefMode
      ? "Site capture will happen in the field. Use Current GPS and fresh evidence for this visit."
      : "Plot capture will happen in the field. Use Current GPS and fresh evidence for this visit."
    : metadataOnlyReview
      ? "Metadata-only review keeps the existing evidence and GPS history."
      : "Use Current GPS before submitting this task.";
  const conditionLabel = hiddenPlaceholderTree || fieldWorkflowMode ? `${workflowLabels.entitySingular} condition` : "Tree condition";
  const taskTargetRecordLabel =
    fieldWorkflowMode && taskTree
      ? String(
          agricMode
            ? taskTree.record_profile_data?.plot_code || taskTree.record_profile_data?.plot_name || ""
            : taskTree.record_profile_data?.asset_code || taskTree.record_profile_data?.asset_name || "",
        ).trim() || `${workflowLabels.entitySingular} #${taskRecordNo}`
      : `${workflowLabels.entitySingular} #${taskRecordNo}`;
  const taskTargetCrop = String(
    agricMode
      ? taskTree?.record_profile_data?.commodity || taskTree?.species || "Unspecified"
      : reliefMode
        ? taskTree?.record_profile_data?.asset_type || taskTree?.species || "Unspecified"
        : taskTree?.species || "Unspecified",
  ).trim() || "Unspecified";

  const [notes, setNotes] = useState("");
  const [treeStatus, setTreeStatus] = useState("healthy");
  const [activityLat, setActivityLat] = useState<number | null>(null);
  const [activityLng, setActivityLng] = useState<number | null>(null);
  const [activityRecordedAt, setActivityRecordedAt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [working, setWorking] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [species, setSpecies] = useState("");
  const [plantingDate, setPlantingDate] = useState("");
  const [treeHeightM, setTreeHeightM] = useState("");
  const [treeAgeMonths, setTreeAgeMonths] = useState("");
  const [treeStatusPickerOpen, setTreeStatusPickerOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [gpsSource, setGpsSource] = useState<"gps" | "map" | null>(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const initializedTaskIdRef = useRef<number | null>(null);

  const existingEvidence = useMemo(() => (task ? getTaskPhotoUris(task) : []), [task]);
  const currentGpsCaptured = gpsSource === "gps" && activityLat !== null && activityLng !== null;

  const clearFieldError = (field: keyof TaskFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const loadTaskIntoDraft = useCallback(
    (currentTask: TaskSummary) => {
      setNotes(currentTask.notes || "");
      const initialTreeStatus = normalizeTreeStatus(currentTask.reported_tree_status || currentTask.tree_status || "healthy");
      setTreeStatus(
        INSPECTION_STATUS_OPTIONS.some((option) => option.value === initialTreeStatus) ? initialTreeStatus : "healthy",
      );
      setActivityLat(currentTask.activity_lat ?? null);
      setActivityLng(currentTask.activity_lng ?? null);
      setActivityRecordedAt(currentTask.activity_recorded_at ?? null);
      setSpecies(taskTree?.species || currentTask.tree_species || "");
      setPlantingDate(taskTree?.planting_date || currentTask.tree_planting_date || "");
      setTreeHeightM(taskTree?.tree_height_m === null || taskTree?.tree_height_m === undefined ? "" : String(taskTree.tree_height_m));
      setTreeAgeMonths(
        taskTree?.tree_age_months === null || taskTree?.tree_age_months === undefined ? "" : String(Math.round(Number(taskTree.tree_age_months))),
      );
      setPhotos([]);
      setTaskMessage("");
      setFieldErrors({});
      setGpsSource(null);
    },
    [taskTree],
  );

  useEffect(() => {
    if (!task) {
      initializedTaskIdRef.current = null;
      return;
    }
    if (initializedTaskIdRef.current === Number(task.id)) return;
    loadTaskIntoDraft(task);
    initializedTaskIdRef.current = Number(task.id);
  }, [loadTaskIntoDraft, task]);

  useFocusEffect(
    useCallback(() => {
      if (!isOnline) return undefined;
      void refreshAll();
      return undefined;
    }, [isOnline, refreshAll]),
  );

  const captureCameraPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      setTaskMessage("Camera permission is required to attach field evidence.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
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
    clearFieldError("photos");
  };

  const captureGps = async () => {
    setCapturingGps(true);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setCapturingGps(false);
      setTaskMessage("Location permission is required. Use Current GPS before submitting.");
      return;
    }
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setActivityLat(current.coords.latitude);
      setActivityLng(current.coords.longitude);
      setActivityRecordedAt(new Date().toISOString());
      setGpsSource("gps");
      clearFieldError("gps");
      setTaskMessage(`Current GPS captured at ${Math.round(current.coords.accuracy || 0)}m accuracy.`);
    } catch {
      setTaskMessage("Current GPS could not be captured. Move to a clearer outdoor position and try again.");
    } finally {
      setCapturingGps(false);
    }
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

  const nextHeight = normalizeValue(treeHeightM) ? Number(treeHeightM) : null;
  const nextAge = normalizeValue(treeAgeMonths) ? Number(treeAgeMonths) : null;
  const nextSpecies = normalizeValue(species);
  const nextPlantingDate = normalizeValue(plantingDate) || null;
  const nextTreeStatus = normalizeTreeStatus(treeStatus);
  const previousTreeStatus = normalizeTreeStatus(taskTree?.status || task?.tree_status || "healthy");
  const treeOrigin = normalizeValue(taskTree?.tree_origin || "new_planting");
  const metadataChanged = Boolean(
    taskTree &&
      (nextSpecies !== normalizeValue(taskTree.species) ||
        nextPlantingDate !== (taskTree.planting_date || null) ||
        nextTreeStatus !== previousTreeStatus ||
        nextHeight !== (taskTree.tree_height_m ?? null) ||
        (treeOrigin === "existing_inventory" ? nextAge : null) !== (taskTree.tree_age_months ?? null)),
  );

  const validateForSubmit = () => {
    const nextErrors: TaskFieldErrors = {};

    if (supportsTreeMetadata) {
      if (!nextSpecies) nextErrors.species = `Enter the ${workflowLabels.cropLabel.toLowerCase()} before submitting.`;
      if (!nextPlantingDate) {
        nextErrors.plantingDate =
          fieldWorkflowMode
            ? `Select the observation date before resubmitting this ${workflowLabels.entitySingular.toLowerCase()}.`
            : treeOrigin === "existing_inventory"
              ? "Select the reference date before resubmitting this tree."
            : "Select the planting date before submitting this task.";
      }
      if (normalizeValue(treeHeightM) && (nextHeight === null || !Number.isFinite(nextHeight))) {
        nextErrors.treeHeightM = "Tree height must be a valid number in metres.";
      }
      if (normalizeValue(treeAgeMonths) && (nextAge === null || !Number.isFinite(nextAge))) {
        nextErrors.treeAgeMonths = "Estimated age must be a valid number of months.";
      }
    }

    if (metadataOnlyReview) {
      if (!metadataChanged) {
        nextErrors.metadata = "Update at least one requested metadata field before resubmitting to the supervisor.";
      }
      return nextErrors;
    }

    if (!normalizeValue(notes)) nextErrors.notes = `Add a short field note describing the ${fieldWorkflowMode ? workflowLabels.activityTitleSingular.toLowerCase() : "maintenance activity"}.`;
    if (!nextTreeStatus) nextErrors.treeStatus = hiddenPlaceholderTree || fieldWorkflowMode ? `Choose the current ${workflowLabels.entitySingular.toLowerCase()} condition.` : "Choose the current tree condition.";
    if (!currentGpsCaptured) nextErrors.gps = `Use Current GPS before submitting this ${fieldWorkflowMode ? workflowLabels.activityTitleSingular.toLowerCase() : "maintenance activity"}.`;
    if (photos.length === 0) nextErrors.photos = "Use the camera to take at least one fresh field photo before submitting.";

    return nextErrors;
  };

  const validateForSave = () => {
    const nextErrors: TaskFieldErrors = {};
    if (supportsTreeMetadata) {
      if (normalizeValue(treeHeightM) && (nextHeight === null || !Number.isFinite(nextHeight))) {
        nextErrors.treeHeightM = "Tree height must be a valid number in metres.";
      }
      if (normalizeValue(treeAgeMonths) && (nextAge === null || !Number.isFinite(nextAge))) {
        nextErrors.treeAgeMonths = "Estimated age must be a valid number of months.";
      }
    }
    return nextErrors;
  };

  const runMutation = async (submitMode: "save" | "submit") => {
    if (!task || !selectedProjectId) return;
    setWorking(true);
    setTaskMessage("");
    try {
      const nextErrors = submitMode === "submit" ? validateForSubmit() : validateForSave();
      setFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        setTaskMessage("Check the highlighted fields below before continuing.");
        return;
      }

      if (taskTree && metadataChanged) {
        await updateTree({
          projectId: selectedProjectId,
          treeId: taskTree.id,
          species: nextSpecies || undefined,
          plantingDate: nextPlantingDate,
          status: nextTreeStatus || undefined,
          treeHeightM: nextHeight,
          treeAgeMonths: treeOrigin === "existing_inventory" ? nextAge : null,
        });
      }

      const payload = {
        projectId: selectedProjectId,
        taskId: task.id,
        treeId: task.tree_id,
        status: submitMode === "submit" ? "done" : undefined,
        notes,
        treeStatus,
        activityLat,
        activityLng,
        activityRecordedAt,
        photos,
        existingPhotoUrls: existingEvidence.filter((uri) => !isLocalDraftUri(uri)),
        existingPhotoUrl: existingEvidence.filter((uri) => !isLocalDraftUri(uri)).slice(-1)[0] || null,
      };

      const result = submitMode === "submit" ? await submitTask(payload) : await saveTaskUpdate(payload);
      setPhotos([]);
      if (submitMode === "submit") {
        Alert.alert(
          mode === "review" ? "Task sent back to supervisor" : "Task submitted",
          result.message,
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
      } else {
        setTaskMessage(result.message);
      }
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : "Task action failed.");
    } finally {
      setWorking(false);
    }
  };

  if (!task) {
    return (
        <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
        <ScreenHero
          title={mode === "review" ? "Review" : workflowLabels.activityTitle}
          badge={<StatusChip label={isOnline ? "ONLINE" : "OFFLINE"} tone={isOnline ? "online" : "offline"} />}
        />
        <SectionCard title="Task unavailable" subtitle={undefined}>
          <EmptyState title="Task not found" subtitle="This task is no longer available in the selected project. Return to the previous screen and refresh." />
        </SectionCard>
      </ScreenSurface>
    );
  }

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <ScreenHero
        title={
          mode === "review"
            ? "Review task"
            : readOnlyMaintenance
              ? `${workflowLabels.activityTitleSingular} details`
              : `${workflowLabels.activityTitleSingular} task`
        }
        badge={<StatusChip label={isOnline ? "ONLINE" : "OFFLINE"} tone={isOnline ? "online" : "offline"} />}
        rightSlot={
          <Pressable onPress={() => navigation.goBack()} style={styles.topButton}>
            <Text style={styles.topButtonText}>Back</Text>
          </Pressable>
        }
      />

      <SectionCard title={formatWorkflowTaskTypeLabel(task.task_type, workflowProfile)} subtitle={selectedProject ? `${selectedProject.name}${selectedProject.location_text ? ` | ${selectedProject.location_text}` : ""}` : undefined}>
        <View style={styles.summaryRow}>
          <StatusChip label={taskTargetLabel} tone="neutral" />
          {metadataOnlyReview ? <StatusChip label="Metadata update" tone="warning" /> : <StatusChip label={isTaskApproved(task) ? "DONE" : isTaskSubmitted(task) ? "SUBMITTED" : "UNDONE"} tone={isTaskApproved(task) ? "online" : isTaskSubmitted(task) ? "warning" : "neutral"} />}
          {!metadataOnlyReview && task.reported_tree_status ? <StatusChip label={formatTreeConditionLabel(task.reported_tree_status || task.tree_status || "healthy")} tone="neutral" /> : null}
        </View>
        <Text style={styles.summaryText}>
          {!hiddenPlaceholderTree && (taskTree?.species || task.tree_species) ? `${taskTree?.species || task.tree_species} | ` : ""}
          {task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}
        </Text>
        {hiddenPlaceholderTree ? <Text style={styles.summaryText}>{reliefMode ? "Site record has not been captured yet. Use this visit to capture GPS, photos, and field notes." : "Plot record has not been captured yet. Use this visit to capture GPS, photos, and field notes."}</Text> : null}
        {readOnlyMaintenance ? (
          <Text style={styles.readOnlyNote}>
            {isTaskApproved(task)
              ? `This ${workflowLabels.activityTitleSingular.toLowerCase()} has already been approved. It is now view-only.`
              : `This ${workflowLabels.activityTitleSingular.toLowerCase()} has already been submitted for supervisor review. It is now view-only.`}
          </Text>
        ) : metadataOnlyReview ? <Text style={styles.summaryText}>Original evidence is kept. Update the requested metadata fields and resubmit.</Text> : null}
        {task.review_notes ? <Text style={styles.supervisorNote}>Supervisor note: {task.review_notes}</Text> : null}
        {fieldErrors.metadata ? <FieldError message={fieldErrors.metadata} /> : null}
        {taskMessage ? <Text style={styles.taskMessage}>{taskMessage}</Text> : null}
      </SectionCard>

      <SectionCard title="Task map" subtitle={taskMapSubtitle}>
        <GreenTreeCaptureMap
          trees={trees}
          focusTreeId={hiddenPlaceholderTree ? null : task.tree_id}
          captureLocation={activityLat !== null && activityLng !== null ? { latitude: activityLat, longitude: activityLng } : null}
          interactive={!metadataOnlyReview && !readOnlyMaintenance}
          onPickLocation={
            metadataOnlyReview || readOnlyMaintenance
              ? undefined
              : (next) => {
                  setActivityLat(next.latitude);
                  setActivityLng(next.longitude);
                  setActivityRecordedAt(new Date().toISOString());
                  setGpsSource("map");
                  clearFieldError("gps");
                  setTaskMessage("Map point updated. Submit still requires Use Current GPS.");
                }
          }
          mapHeight={220}
          overlayTitle={taskMapOverlayTitle}
          overlaySubtitle={taskMapOverlaySubtitle}
          workflowMode={agricMode ? "agric" : reliefMode ? "relief_recovery" : "green"}
        />
        {hiddenPlaceholderTree ? (
          <Text style={styles.mapHint}>{reliefMode ? "Site target: no saved site GPS yet. Capture the site location during this relief visit." : "Plot target: no saved plot GPS yet. Capture the farm location during this support visit."}</Text>
        ) : (taskTree || (task && task.tree_id)) ? (
          <>
            <Text style={styles.mapHint}>
              {taskTree
                ? (fieldWorkflowMode
                    ? `${taskTargetRecordLabel} | ${taskTree.custodian_name || (reliefMode ? "Beneficiary not linked" : "Farmer not linked")} | ${taskTargetCrop} | ${
                        taskTree.lat !== null && taskTree.lng !== null ? `${formatCoordinate(taskTree.lat)}, ${formatCoordinate(taskTree.lng)}` : "GPS missing"
                      }`
                    : `${workflowLabels.entitySingular} target: #${taskTree.project_tree_no || taskTree.id} | ${taskTree.species || "Unspecified"} | ${
                        taskTree.lat !== null && taskTree.lng !== null ? `${formatCoordinate(taskTree.lat)}, ${formatCoordinate(taskTree.lng)}` : "GPS missing"
                      }`)
                : `${workflowLabels.entitySingular} target: #${task.tree_id}`}
            </Text>
            {publicSponsorshipProject && (
              <View style={{ marginTop: spacing.xs }}>
                <PrimaryButton
                  label="Print QR Tag"
                  onPress={() => {
                    const targetTreeId = taskTree ? taskTree.id : task.tree_id;
                    const url = appendDownloadQuery(`${API_URL}/green/trees/${targetTreeId}/qr-tag/pdf`, qrDownloadQuery);
                    Linking.openURL(url).catch(() => {
                      Alert.alert("Error", "Failed to open QR tag PDF.");
                    });
                  }}
                  variant="ghost"
                />
              </View>
            )}
          </>
        ) : null}
      </SectionCard>

      {supportsTreeMetadata ? (
        <SectionCard
          title={agricMode ? "Plot record" : reliefMode ? "Site record" : "Tree metadata"}
          subtitle="These values are shown to supervisors in Work review."
        >
          <FieldLabel label={workflowLabels.cropLabel} required />
          <TextInput
            style={[styles.input, fieldErrors.species && styles.inputError]}
            placeholder={workflowLabels.cropLabel}
            placeholderTextColor={colors.textMuted}
            value={species}
            editable={!readOnlyMaintenance}
            onChangeText={(value) => {
              setSpecies(value);
              clearFieldError("species");
              clearFieldError("metadata");
            }}
          />
          <FieldError message={fieldErrors.species} />

          <FieldLabel
            label={fieldWorkflowMode ? "Observation date" : taskTree?.tree_origin === "existing_inventory" ? "Reference date" : "Planting date"}
            required
          />
          <View style={fieldErrors.plantingDate ? styles.fieldBlockError : undefined}>
            <DateField
              value={plantingDate}
              disabled={readOnlyMaintenance}
              onChange={(value) => {
                setPlantingDate(value);
                clearFieldError("plantingDate");
                clearFieldError("metadata");
              }}
              placeholder={
                fieldWorkflowMode
                  ? "Select observation date"
                  : taskTree?.tree_origin === "existing_inventory"
                    ? "Select reference date"
                    : "Select planting date"
              }
            />
          </View>
          <FieldError message={fieldErrors.plantingDate} />

          {!reliefMode ? (
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <FieldLabel label={fieldWorkflowMode ? "Reference tree height (m)" : "Tree height (m)"} />
                <TextInput
                  style={[styles.input, fieldErrors.treeHeightM && styles.inputError]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  value={treeHeightM}
                  editable={!readOnlyMaintenance}
                  onChangeText={(value) => {
                    setTreeHeightM(value);
                    clearFieldError("treeHeightM");
                  }}
                  keyboardType="decimal-pad"
                />
                <FieldError message={fieldErrors.treeHeightM} />
              </View>
              {taskTree?.tree_origin === "existing_inventory" ? (
                <View style={styles.formCol}>
                  <FieldLabel
                    label={fieldWorkflowMode ? "Estimated age (months, optional legacy tree field)" : "Estimated age (months)"}
                  />
                  <TextInput
                    style={[styles.input, fieldErrors.treeAgeMonths && styles.inputError]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    value={treeAgeMonths}
                    editable={!readOnlyMaintenance}
                    onChangeText={(value) => {
                      setTreeAgeMonths(value);
                      clearFieldError("treeAgeMonths");
                    }}
                    keyboardType="number-pad"
                  />
                  <FieldError message={fieldErrors.treeAgeMonths} />
                </View>
              ) : null}
            </View>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Activity report"
        subtitle={
          metadataOnlyReview
            ? "Metadata-only review keeps the original evidence already uploaded."
            : `Complete the required fields below before sending this ${workflowLabels.activityTitleSingular.toLowerCase()} back to the supervisor.`
        }
      >
        <FieldLabel label={conditionLabel} required={!metadataOnlyReview} />
        <Pressable
          onPress={() => {
            if (readOnlyMaintenance) return;
            setTreeStatusPickerOpen(true);
          }}
          style={[styles.selectField, fieldErrors.treeStatus && styles.inputError]}
        >
          <Text style={styles.selectValue}>
            {INSPECTION_STATUS_OPTIONS.find((option) => option.value === treeStatus)?.label || `Select ${conditionLabel.toLowerCase()}`}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
        </Pressable>
        <FieldError message={fieldErrors.treeStatus} />

        <FieldLabel label="Field notes" required={!metadataOnlyReview} />
        <TextInput
          style={[styles.input, styles.textArea, fieldErrors.notes && styles.inputError]}
          multiline
          placeholder={metadataOnlyReview ? "Optional note for the supervisor" : "Describe what you did in the field"}
          placeholderTextColor={colors.textMuted}
          value={notes}
          editable={!readOnlyMaintenance}
          onChangeText={(value) => {
            setNotes(value);
            clearFieldError("notes");
          }}
        />
        <FieldError message={fieldErrors.notes} />

        {metadataOnlyReview || readOnlyMaintenance ? null : (
          <>
            <FieldLabel label="Current GPS" required />
            <View style={styles.gpsCard}>
              <PrimaryButton label={capturingGps ? "Capturing..." : "Use Current GPS"} onPress={() => void captureGps()} variant="secondary" disabled={working || syncing || capturingGps} />
              {capturingGps ? (
                <View style={styles.progressRow}>
                  <ActivityIndicator size="small" color={colors.primaryDark} />
                  <Text style={styles.progressText}>Capturing current GPS...</Text>
                </View>
              ) : null}
              <Text style={styles.gpsMeta}>
                {currentGpsCaptured
                  ? `Captured at ${formatCoordinate(activityLat ?? 0)}, ${formatCoordinate(activityLng ?? 0)}${activityRecordedAt ? ` on ${formatDateTime(activityRecordedAt)}` : ""}`
                  : activityLat !== null && activityLng !== null
                    ? `Map point selected at ${formatCoordinate(activityLat)}, ${formatCoordinate(activityLng)}. Submit still requires Use Current GPS.`
                    : "Tap Use Current GPS to capture this task location."}
              </Text>
              {activityLat !== null && activityLng !== null ? (
                <Pressable style={styles.linkButton} onPress={() => void openDirections(activityLng, activityLat)}>
                  <Text style={styles.linkButtonText}>Open GPS point</Text>
                </Pressable>
              ) : null}
            </View>
            <FieldError message={fieldErrors.gps} />

            <FieldLabel label="Camera photo" required />
            <PrimaryButton label="Open Camera" onPress={() => void captureCameraPhoto()} variant="secondary" disabled={working || syncing} />
            <FieldError message={fieldErrors.photos} />
          </>
        )}

        {readOnlyMaintenance ? (
          <View style={styles.readOnlyDetails}>
            <Text style={styles.readOnlyDetailText}>
              {activityLat !== null && activityLng !== null
                ? `Recorded GPS: ${formatCoordinate(activityLat)}, ${formatCoordinate(activityLng)}${activityRecordedAt ? ` on ${formatDateTime(activityRecordedAt)}` : ""}`
                : "No recorded GPS on file."}
            </Text>
          </View>
        ) : null}

        {existingEvidence.length ? (
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionLabel}>{metadataOnlyReview ? "Original evidence kept" : "Existing evidence"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {existingEvidence.map((uri) => (
                <ExpoImage key={uri} source={{ uri }} style={styles.photo} contentFit="cover" />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!metadataOnlyReview && !readOnlyMaintenance && photos.length ? (
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionLabel}>New camera evidence</Text>
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
      </SectionCard>

      {readOnlyMaintenance ? null : (
        <SectionCard
          title="Finish"
          subtitle={
            mode === "review"
              ? "Save the correction or resubmit it to the supervisor."
              : `Save your draft or submit the completed ${workflowLabels.activityTitleSingular.toLowerCase()} for review.`
          }
        >
          <View style={styles.footerButtons}>
            <PrimaryButton
              label={working ? "Saving..." : "Save Draft"}
              onPress={() => void runMutation("save")}
              disabled={working || syncing}
            />
            <PrimaryButton
              label={working ? "Submitting..." : mode === "review" ? "Resubmit to Supervisor" : "Submit for Review"}
              onPress={() => void runMutation("submit")}
              disabled={working || syncing}
              variant="secondary"
            />
          </View>
        </SectionCard>
      )}

      <SelectSheet
        visible={treeStatusPickerOpen}
        title={conditionLabel}
        options={INSPECTION_STATUS_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
        selectedValue={treeStatus}
        onClose={() => setTreeStatusPickerOpen(false)}
        onSelect={(value) => {
          setTreeStatusPickerOpen(false);
          setTreeStatus(value);
          clearFieldError("treeStatus");
          clearFieldError("metadata");
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
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  summaryText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  readOnlyNote: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  supervisorNote: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  taskMessage: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
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
  requiredAsterisk: {
    color: colors.danger,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  fieldBlockError: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.24)",
    padding: 6,
    backgroundColor: "rgba(220,38,38,0.03)",
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formCol: {
    flex: 1,
    gap: spacing.xs,
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
  inputError: {
    borderColor: "rgba(220,38,38,0.38)",
    backgroundColor: "rgba(220,38,38,0.03)",
  },
  selectField: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  selectValue: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  textArea: {
    minHeight: 122,
    paddingTop: spacing.md,
    textAlignVertical: "top",
  },
  gpsCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  gpsMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  readOnlyDetails: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
  },
  readOnlyDetailText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  linkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  linkButtonText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  photoSection: {
    gap: spacing.xs,
  },
  photoSectionLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  photoRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  photoWrap: {
    width: 118,
    gap: 6,
  },
  photo: {
    width: 118,
    height: 118,
    borderRadius: radii.lg,
    backgroundColor: colors.panelElevated,
  },
  photoPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: "rgba(15,49,36,0.84)",
  },
  photoPillText: {
    color: colors.inverseText,
    fontSize: 11,
    fontWeight: "800",
  },
  footerButtons: {
    gap: spacing.sm,
  },
});
