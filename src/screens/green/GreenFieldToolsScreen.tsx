import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getErrorMessage } from "../../api/client";
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
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  EXISTING_TREE_STATUS_OPTIONS,
  NEW_TREE_STATUS_OPTIONS,
  normalizeName,
  normalizeTaskState,
  PLANTING_TASK_TYPES,
} from "../../green/workflow";
import { normalizeMapGeometry, normalizeSpeciesAllocations } from "../../green/normalize";
import { downloadOfflinePack, listOfflinePacks, projectOfflinePackName } from "../../maps/offlineRegions";
import { colors, radii, spacing } from "../../theme/tokens";
import type { DraftPhoto } from "../../types/domain";
import { boundsFromPoints, coordinateSummaryFromGeometry, polygonCentroid, polygonGeoJsonFromPoints, type LngLat } from "../../utils/geo";
import { formatCoordinate, formatDate, toTitle } from "../../utils/format";

const todayString = () => new Date().toISOString().slice(0, 10);
const isClosedWorkOrder = (value?: string | null) => {
  const status = normalizeTaskState(value);
  return status === "done" || status === "completed" || status === "closed" || status === "cancelled";
};
const isTruthyFlag = (value: unknown) => {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
};

export const GreenFieldToolsScreen = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const {
    projects,
    tasks,
    trees,
    custodians,
    workOrders,
    distributionAllocations,
    selectedProjectId,
    matchedCustodian,
    loading,
    refreshing,
    syncing,
    isOnline,
    isCustodianUser,
    offlineStats,
    selectProject,
    refreshAll,
    createTree,
  } = useGreenSync();

  const [species, setSpecies] = useState("");
  const [plantingDate, setPlantingDate] = useState(todayString());
  const [treeOrigin, setTreeOrigin] = useState<"new_planting" | "existing_inventory">("new_planting");
  const [status, setStatus] = useState("alive");
  const [notes, setNotes] = useState("");
  const [treeHeightM, setTreeHeightM] = useState("");
  const [treeAgeMonths, setTreeAgeMonths] = useState("");
  const [inventoryTreeCount, setInventoryTreeCount] = useState("2");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<LngLat[]>([]);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [existingBatchMode, setExistingBatchMode] = useState(false);
  const [useAssignedArea, setUseAssignedArea] = useState(false);
  const [selectedAreaOrderId, setSelectedAreaOrderId] = useState("");
  const [selectedCustodianId, setSelectedCustodianId] = useState("");
  const [custodianPickerOpen, setCustodianPickerOpen] = useState(false);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [treeOriginPickerOpen, setTreeOriginPickerOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [speciesPickerOpen, setSpeciesPickerOpen] = useState(false);
  const [reuseRefreshAttempted, setReuseRefreshAttempted] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [plantingFlowState, setPlantingFlowState] = useState<"idle" | "loading" | "success">("idle");
  const [plantingFlowMessage, setPlantingFlowMessage] = useState("");

  const activeProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || projects[0] || null, [projects, selectedProjectId]);
  const currentUser = normalizeName(session?.user.full_name);

  const myTrees = useMemo(() => {
    const custodianId = Number(matchedCustodian?.id || 0);
    return trees.filter((tree) => {
      if (isCustodianUser && custodianId > 0) return Number(tree.custodian_id || 0) === custodianId;
      if (custodianId > 0 && Number(tree.custodian_id || 0) === custodianId) return true;
      return normalizeName(tree.created_by) === currentUser;
    });
  }, [currentUser, isCustodianUser, matchedCustodian?.id, trees]);

  const workWaitingToSend = offlineStats.queued;
  const workStatusMessage =
    workWaitingToSend > 0
      ? `${workWaitingToSend} item${workWaitingToSend === 1 ? "" : "s"} saved on this phone. They will send automatically when you have network.`
      : "Everything you recorded has been sent.";

  const userPlantingTrees = useMemo(
    () => myTrees.filter((tree) => normalizeTaskState(tree.tree_origin || "new_planting") === "new_planting"),
    [myTrees],
  );

  const activePlantingOrders = useMemo(
    () =>
      workOrders
        .filter((row) => PLANTING_TASK_TYPES.has(normalizeTaskState(row.work_type)))
        .filter((row) => !isClosedWorkOrder(row.status)),
    [workOrders],
  );

  const activeOrderSpeciesAllocations = useMemo(() => {
    const merged = new Map<string, { species: string; count: number }>();
    activePlantingOrders.forEach((order) => {
      normalizeSpeciesAllocations(order.species_allocations).forEach((row) => {
        const key = normalizeName(row.species);
        if (!key) return;
        const existing = merged.get(key);
        if (existing) {
          existing.count += Number(row.count || 0);
          return;
        }
        merged.set(key, {
          species: row.species,
          count: Number(row.count || 0),
        });
      });
    });
    return Array.from(merged.values()).sort((a, b) => a.species.localeCompare(b.species));
  }, [activePlantingOrders]);

  const speciesOptions = useMemo(() => {
    const plantedCounts = new Map<string, number>();
    userPlantingTrees.forEach((tree) => {
      const key = normalizeName(tree.species);
      if (!key) return;
      plantedCounts.set(key, (plantedCounts.get(key) || 0) + 1);
    });
    return activeOrderSpeciesAllocations.map((allocation) => {
      const key = normalizeName(allocation.species);
      const planted = plantedCounts.get(key) || 0;
      const remaining = Math.max(Number(allocation.count || 0) - planted, 0);
      return {
        species: allocation.species,
        total: Number(allocation.count || 0),
        planted,
        remaining,
      };
    });
  }, [activeOrderSpeciesAllocations, userPlantingTrees]);

  const hasSpeciesBasedPlantingAllocation = speciesOptions.length > 0;

  const assignedPlantingAreas = useMemo(
    () => activePlantingOrders.filter((row) => isTruthyFlag(row.area_enabled) && Boolean(row.area_geojson)),
    [activePlantingOrders],
  );

  const reusableAreaOrders = useMemo(
    () => assignedPlantingAreas.filter((row) => isTruthyFlag(row.allow_existing_tree_area_reuse)),
    [assignedPlantingAreas],
  );

  const selectedAreaOrder = useMemo(
    () => reusableAreaOrders.find((row) => String(row.id) === String(selectedAreaOrderId)) || reusableAreaOrders[0] || null,
    [reusableAreaOrders, selectedAreaOrderId],
  );

  const effectiveCustodianId = useMemo(
    () => (isCustodianUser && matchedCustodian ? Number(matchedCustodian.id) : selectedCustodianId ? Number(selectedCustodianId) : null),
    [isCustodianUser, matchedCustodian, selectedCustodianId],
  );

  const overlayAreas = useMemo(
    () => [
      ...myTrees
        .filter((tree) => tree.tree_origin === "existing_inventory" && tree.existing_area_geojson)
        .map((tree) => ({
          id: `existing-${tree.id}`,
          geometry: normalizeMapGeometry(tree.existing_area_geojson),
          strokeColor: "rgba(35,146,82,0.84)",
          fillColor: "rgba(35,146,82,0.08)",
        })),
      ...assignedPlantingAreas.map((row) => ({
        id: `order-${row.id}`,
        geometry: normalizeMapGeometry(row.area_geojson),
        strokeColor: "rgba(35,146,82,0.84)",
        fillColor: "rgba(35,146,82,0.08)",
      })),
    ],
    [assignedPlantingAreas, myTrees],
  );

  const activeUserPoints = useMemo(
    () =>
      myTrees
        .filter((tree) => Number.isFinite(tree.lng) && Number.isFinite(tree.lat))
        .map((tree) => [Number(tree.lng), Number(tree.lat)] as LngLat),
    [myTrees],
  );

  const assignedPlantingAreaPoints = useMemo(
    () => assignedPlantingAreas.flatMap((row) => coordinateSummaryFromGeometry(row.area_geojson).points),
    [assignedPlantingAreas],
  );

  const selectedAreaPoints = useMemo(
    () => (useAssignedArea && selectedAreaOrder ? coordinateSummaryFromGeometry(selectedAreaOrder.area_geojson).points : []),
    [selectedAreaOrder, useAssignedArea],
  );

  const projectBounds = useMemo(() => {
    const pointCoords: LngLat[] = myTrees
      .filter((tree) => Number.isFinite(tree.lng) && Number.isFinite(tree.lat))
      .map((tree) => [Number(tree.lng), Number(tree.lat)]);
    const geoCoords = [
      ...myTrees.flatMap((tree) => coordinateSummaryFromGeometry(tree.existing_area_geojson).points),
      ...activePlantingOrders.flatMap((row) => coordinateSummaryFromGeometry(row.area_geojson).points),
    ];
    return boundsFromPoints([...pointCoords, ...geoCoords]);
  }, [activePlantingOrders, myTrees]);

  const pendingPlanting = useMemo(() => {
    if (isCustodianUser && matchedCustodian) {
      const allocated = distributionAllocations
        .filter((row) => Number(row.custodian_id || 0) === Number(matchedCustodian.id))
        .reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0);
      return Math.max(allocated - myTrees.length, 0);
    }
    return activePlantingOrders
      .reduce((sum, row) => sum + Math.max(Number(row.target_trees || 0) - Number(row.planted_count || 0), 0), 0);
  }, [activePlantingOrders, distributionAllocations, isCustodianUser, matchedCustodian, myTrees.length]);

  const plantingReviewCounts = useMemo(() => {
    const plantingTasks = tasks.filter((task) => PLANTING_TASK_TYPES.has(normalizeTaskState(task.task_type)));
    return {
      submitted: plantingTasks.filter((task) => normalizeTaskState(task.review_state) === "submitted").length,
      approved: plantingTasks.filter((task) => normalizeTaskState(task.review_state) === "approved").length,
    };
  }, [tasks]);

  const activeCustodian = useMemo(
    () =>
      (effectiveCustodianId ? custodians.find((custodian) => Number(custodian.id) === Number(effectiveCustodianId)) : null) ||
      matchedCustodian ||
      null,
    [custodians, effectiveCustodianId, matchedCustodian],
  );

  const activeCustodianAllocations = useMemo(
    () =>
      activeCustodian
        ? distributionAllocations.filter((row) => Number(row.custodian_id || 0) === Number(activeCustodian.id))
        : [],
    [activeCustodian, distributionAllocations],
  );

  const activeCustodianSpecies = useMemo(
    () =>
      Array.from(
        new Set(activeCustodianAllocations.map((row) => String(row.species || "").trim()).filter(Boolean)),
      ),
    [activeCustodianAllocations],
  );

  const existingTreeBatchCaptureActive = treeOrigin === "existing_inventory" && existingBatchMode;
  const treeStatusOptions = treeOrigin === "existing_inventory" ? EXISTING_TREE_STATUS_OPTIONS : NEW_TREE_STATUS_OPTIONS;

  const goHome = () => {
    const state = navigation.getState?.();
    if (state?.routeNames?.includes("GreenHome")) {
      navigation.navigate("GreenHome");
      return;
    }

    if (state?.routeNames?.includes("GreenTabs")) {
      navigation.navigate("GreenTabs", { screen: "GreenHome" });
      return;
    }

    const parent = navigation.getParent?.();
    const parentState = parent?.getState?.();

    if (parentState?.routeNames?.includes("GreenHome")) {
      parent.navigate("GreenHome");
      return;
    }

    if (parentState?.routeNames?.includes("GreenTabs")) {
      parent.navigate("GreenTabs", { screen: "GreenHome" });
      return;
    }

    navigation.goBack();
  };

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      void selectProject(projects[0].id);
    }
  }, [projects, selectedProjectId, selectProject]);

  useEffect(() => {
    if (plantingFlowState !== "success") return;
    const timer = setTimeout(() => {
      setPlantingFlowState("idle");
      setPlantingFlowMessage("");
      goHome();
    }, 1100);
    return () => clearTimeout(timer);
  }, [plantingFlowState]);

  useEffect(() => {
    if (treeOrigin === "existing_inventory") return;
    if (!hasSpeciesBasedPlantingAllocation || speciesOptions.length === 0) return;
    const allowedKeys = new Set(speciesOptions.map((item) => normalizeName(item.species)));
    const currentKey = normalizeName(species);
    if (currentKey && allowedKeys.has(currentKey)) return;
    const firstSpecies = speciesOptions[0]?.species || "";
    if (firstSpecies) setSpecies(firstSpecies);
  }, [hasSpeciesBasedPlantingAllocation, species, speciesOptions, treeOrigin]);

  useEffect(() => {
    if (reusableAreaOrders.length && !selectedAreaOrderId) {
      setSelectedAreaOrderId(String(reusableAreaOrders[0].id));
    }
  }, [reusableAreaOrders, selectedAreaOrderId]);

  useEffect(() => {
    if (!existingTreeBatchCaptureActive) {
      setUseAssignedArea(false);
      setSelectedAreaOrderId("");
      setReuseRefreshAttempted(false);
      return;
    }
    if (reusableAreaOrders.length === 0) {
      setUseAssignedArea(false);
      setSelectedAreaOrderId("");
      return;
    }
    if (!useAssignedArea) return;
    const selectedId = Number(selectedAreaOrderId || 0);
    if (!selectedId || !reusableAreaOrders.some((order) => Number(order.id) === selectedId)) {
      setSelectedAreaOrderId(String(reusableAreaOrders[0].id));
    }
  }, [existingTreeBatchCaptureActive, reusableAreaOrders, selectedAreaOrderId, useAssignedArea]);

  useEffect(() => {
    if (!isOnline) return;
    if (!existingTreeBatchCaptureActive) return;
    if (reuseRefreshAttempted) return;
    if (!assignedPlantingAreas.length) return;
    if (reusableAreaOrders.length > 0) return;
    setReuseRefreshAttempted(true);
    void refreshAll();
  }, [
    assignedPlantingAreas.length,
    existingTreeBatchCaptureActive,
    isOnline,
    refreshAll,
    reusableAreaOrders.length,
    reuseRefreshAttempted,
  ]);

  useEffect(() => {
    let active = true;
    const ensureProjectMapSaved = async () => {
      if (!isOnline || !selectedProjectId || !projectBounds) return;
      try {
        const packName = projectOfflinePackName(selectedProjectId);
        const packs = await listOfflinePacks();
        if (!active) return;
        const currentPack = packs.find((item) => item.name === packName);
        if (currentPack && Number(currentPack.percentage || 0) >= 100) return;
        await downloadOfflinePack({
          packName,
          bounds: projectBounds,
        });
      } catch {
        // Silent by design: map saving is automatic and should not interrupt field work.
      }
    };
    void ensureProjectMapSaved();
    return () => {
      active = false;
    };
  }, [isOnline, projectBounds, selectedProjectId]);

  const setPoint = (latitude: number, longitude: number, source: "gps" | "map") => {
    setLat(latitude);
    setLng(longitude);
    setMessage(source === "gps" ? "Current GPS captured." : "Tree point updated from the map.");
  };

  const useGps = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setMessage("Location permission was not granted.");
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    setPoint(current.coords.latitude, current.coords.longitude, "gps");
  };

  const addDraftPhotos = (items: DraftPhoto[]) => setPhotos((prev) => [...prev, ...items]);

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      setMessage("Camera permission was not granted.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    addDraftPhotos([{ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, fileSize: asset.fileSize }]);
  };

  const resetForm = () => {
    setSpecies("");
    setPlantingDate(todayString());
    setTreeOrigin("new_planting");
    setStatus("alive");
    setNotes("");
    setTreeHeightM("");
    setTreeAgeMonths("");
    setInventoryTreeCount("2");
    setLat(null);
    setLng(null);
    setPolygonPoints([]);
    setPhotos([]);
    setExistingBatchMode(false);
    setUseAssignedArea(false);
    setSelectedAreaOrderId("");
    setSelectedCustodianId("");
  };

  const switchTreeOrigin = (nextOrigin: "new_planting" | "existing_inventory") => {
    if (nextOrigin !== "existing_inventory") {
      setExistingBatchMode(false);
      setPolygonPoints([]);
      setInventoryTreeCount("");
      setUseAssignedArea(false);
      setSelectedAreaOrderId("");
      setPhotos([]);
    }
    setTreeOrigin(nextOrigin);
    setStatus(nextOrigin === "existing_inventory" ? "healthy" : "alive");
    if (nextOrigin === "existing_inventory") {
      setPlantingDate("");
    } else {
      setPlantingDate((prev) => prev || todayString());
      setTreeAgeMonths("");
    }
  };

  const toggleExistingBatchMode = (checked: boolean) => {
    setExistingBatchMode(checked);
    setReuseRefreshAttempted(false);
    if (checked) {
      setLat(null);
      setLng(null);
    }
    setPolygonPoints([]);
    setInventoryTreeCount(checked ? (inventoryTreeCount || "2") : "");
    setUseAssignedArea(false);
    setSelectedAreaOrderId("");
    setPhotos([]);
  };

  const toggleUseAssignedArea = (checked: boolean) => {
    if (checked && reusableAreaOrders.length === 0) {
      setMessage("No reusable supervisor polygon is available for this assigned planting area.");
      return;
    }
    setUseAssignedArea(checked);
    if (checked) {
      setSelectedAreaOrderId(String(selectedAreaOrder?.id || reusableAreaOrders[0]?.id || ""));
      setPolygonPoints([]);
    }
  };

  const handleSelectMapDrawTool = (tool: "point" | "polygon") => {
    if (tool === "point") {
      if (existingTreeBatchCaptureActive) {
        toggleExistingBatchMode(false);
      }
      return;
    }

    if (treeOrigin !== "existing_inventory") {
      switchTreeOrigin("existing_inventory");
    }
    if (!existingBatchMode) {
      toggleExistingBatchMode(true);
      return;
    }
    if (useAssignedArea) {
      setUseAssignedArea(false);
    }
  };

  const handleClearMapDraft = () => {
    if (existingTreeBatchCaptureActive) {
      if (useAssignedArea) {
        setUseAssignedArea(false);
      }
      setPolygonPoints([]);
      return;
    }
    setLat(null);
    setLng(null);
  };

  const saveTree = async () => {
    const projectId = selectedProjectId || activeProject?.id || null;
    if (!projectId) {
      setMessage("Select a project first.");
      return;
    }
    const speciesValue = species.trim();
    if (!speciesValue) {
      setMessage(treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation ? "Select one of your assigned species first." : "Species is required.");
      return;
    }
    if (treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation) {
      const allowedKeys = new Set(speciesOptions.map((item) => normalizeName(item.species)));
      if (!allowedKeys.has(normalizeName(speciesValue))) {
        setMessage("Selected species is outside your assigned planting species list.");
        return;
      }
    }

    const heightValue = treeHeightM.trim() ? Number(treeHeightM) : null;
    const ageValue = treeAgeMonths.trim() ? Number(treeAgeMonths) : null;
    if (heightValue !== null && !Number.isFinite(heightValue)) {
      setMessage("Tree height must be numeric.");
      return;
    }
    if (treeAgeMonths.trim() && !Number.isFinite(ageValue)) {
      setMessage("Tree age must be numeric.");
      return;
    }

    const isBatch = existingTreeBatchCaptureActive;
    let finalLat = lat;
    let finalLng = lng;
    let batchAreaGeojson: Record<string, unknown> | null = null;
    let batchCount = 1;

    if (isBatch) {
      batchCount = Math.max(Number(inventoryTreeCount || 0), 2);
      batchAreaGeojson = useAssignedArea
        ? (normalizeMapGeometry(selectedAreaOrder?.area_geojson) || null)
        : polygonPoints.length >= 3
          ? polygonGeoJsonFromPoints(polygonPoints)
          : null;
      if (!batchAreaGeojson) {
        setMessage(useAssignedArea ? "Select a reusable supervisor polygon first." : "Draw one polygon on the map first.");
        return;
      }
      const centroid = useAssignedArea
        ? polygonCentroid(coordinateSummaryFromGeometry(batchAreaGeojson).points)
        : polygonCentroid(polygonPoints);
      if (!centroid) {
        setMessage("Polygon centroid could not be determined.");
        return;
      }
      finalLng = centroid.lng;
      finalLat = centroid.lat;
    } else if (finalLat === null || finalLng === null) {
      setMessage("Set the tree point on the map or capture GPS before saving.");
      return;
    }

    if (treeOrigin === "existing_inventory" && !plantingDate && ageValue === null) {
      setMessage("Provide a reference date or estimated age for an existing tree.");
      return;
    }
    if (photos.length === 0) {
      setMessage(
        isBatch
          ? "Add at least one tree photo before saving this existing-tree area."
          : "Take or choose a tree photo before adding this tree.",
      );
      return;
    }

    setSubmitting(true);
    setMessage("");
    setPlantingFlowState("loading");
    setPlantingFlowMessage(
      isBatch
        ? "Saving existing-tree area..."
        : treeOrigin === "existing_inventory"
          ? "Saving existing tree..."
          : "Adding tree...",
    );
    try {
      const result = await createTree({
        projectId,
        species: speciesValue,
        plantingDate: plantingDate || null,
        status,
        notes,
        lat: Number(finalLat),
        lng: Number(finalLng),
        photos,
        treeHeightM: heightValue,
        treeOrigin,
        attributionScope: treeOrigin === "existing_inventory" ? "monitor_only" : "full",
        countInPlantingKpis: treeOrigin === "existing_inventory" ? false : true,
        countInCarbonScope: true,
        custodianId: effectiveCustodianId,
        treeAgeMonths: treeOrigin === "existing_inventory" ? ageValue : null,
        inventoryTreeCount: isBatch ? batchCount : 1,
        existingAreaGeojson: batchAreaGeojson,
      });
      setPlantingFlowState("success");
      setPlantingFlowMessage(result.message || (isBatch ? "Existing-tree area saved." : "Tree saved."));
      resetForm();
    } catch (error) {
      setPlantingFlowState("idle");
      setPlantingFlowMessage("");
      setMessage(getErrorMessage(error, "Tree capture failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const mapFitPoints = useMemo(() => {
    if (polygonPoints.length > 0) return polygonPoints;
    if (selectedAreaPoints.length > 0) return selectedAreaPoints;
    if (assignedPlantingAreaPoints.length > 0) return assignedPlantingAreaPoints;
    return activeUserPoints;
  }, [activeUserPoints, assignedPlantingAreaPoints, polygonPoints, selectedAreaPoints]);
  const mapOverlayTitle =
    existingTreeBatchCaptureActive
      ? useAssignedArea
        ? "Supervisor polygon selected"
        : "Tap the map to draw the existing-tree area"
      : treeOrigin === "existing_inventory"
        ? "Tap the map to place the existing tree"
        : "Tap the map to place the new tree";
  const mapOverlaySubtitle =
    existingTreeBatchCaptureActive
      ? useAssignedArea
        ? "The highlighted supervisor polygon will be saved with this existing-tree batch record."
        : polygonPoints.length >= 3
          ? "Polygon captured on map."
          : `Polygon vertices: ${polygonPoints.length}`
      : lat !== null && lng !== null
        ? `Lat ${formatCoordinate(lat)} | Lng ${formatCoordinate(lng)}`
        : treeOrigin === "existing_inventory"
          ? "Existing trees remain visible for context. The green marker is the existing tree you are about to save."
          : "Existing trees remain visible for context. The green marker is the tree you are about to save.";

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <ScreenHero
        title="Map & Add Trees"
        badge={<StatusChip label={isOnline ? "Online" : "Offline"} tone={isOnline ? "online" : "offline"} />}
        rightSlot={
          navigation.canGoBack() ? (
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={18} color={colors.primaryDark} />
              <Text style={styles.backText}>Home</Text>
            </Pressable>
          ) : null
        }
      />

      <SectionCard title="Project Project" subtitle={undefined}>
        <View style={styles.chips}>
          {projects.map((project) => (
            <ProjectChip key={project.id} active={selectedProjectId === project.id} label={project.name} onPress={() => void selectProject(project.id)} />
          ))}
        </View>
        {!projects.length ? (
          <EmptyState title="No assigned project yet" subtitle="This mobile app only saves records inside projects already assigned to the signed-in Green user." />
        ) : activeProject ? (
          <View style={styles.projectCard}>
            <View style={styles.projectHeader}>
              <View style={styles.projectText}>
                <Text style={styles.projectName}>{activeProject.name}</Text>
                <Text style={styles.projectMeta}>{activeProject.location_text || "Location text not added yet"}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <MetricTile label="My trees" value={myTrees.length} tone="success" helper="Trees you recorded" />
              <MetricTile label="Waiting to send" value={workWaitingToSend} tone="warning" helper="Will send automatically" />
            </View>
            <Text style={styles.note}>{workStatusMessage}</Text>
            {isCustodianUser && matchedCustodian ? <Text style={styles.note}>Custodian mode active for {matchedCustodian.name}. Maintenance stays disabled; use this map to record planting and existing trees.</Text> : null}
          </View>
        ) : null}
      </SectionCard>

      {activeCustodian || activeCustodianAllocations.length ? (
        <SectionCard title="Community / custodian branch" subtitle="This follows the Green community workflow: custodians plant against allocations while maintenance stays disabled.">
          {activeCustodian ? (
            <View style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectText}>
                  <Text style={styles.projectName}>{activeCustodian.name}</Text>
                  <Text style={styles.projectMeta}>
                    {toTitle(activeCustodian.custodian_type)}{activeCustodian.community_name ? ` | ${activeCustodian.community_name}` : ""}
                  </Text>
                </View>
                <StatusChip label={toTitle(activeCustodian.verification_status || "pending")} tone={activeCustodian.verification_status === "verified" ? "online" : "warning"} />
              </View>
              <View style={styles.metricRow}>
                <MetricTile label="Allocations" value={activeCustodianAllocations.length} helper="Distribution events linked here" />
                <MetricTile
                  label="Supervision live"
                  value={activeCustodianAllocations.reduce((sum, row) => sum + Number(row.supervision_live || 0), 0)}
                  helper="Open supervision visits"
                />
              </View>
              <View style={styles.metricRow}>
                <MetricTile
                  label="Target seedlings"
                  value={activeCustodianAllocations.reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0)}
                  helper="Allocated quantity"
                />
                <MetricTile
                  label="Remaining"
                  value={Math.max(activeCustodianAllocations.reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0) - myTrees.length, 0)}
                  helper="Still to record"
                />
              </View>
              {activeCustodianSpecies.length ? (
                <View style={styles.rowWrap}>
                  {activeCustodianSpecies.map((item) => (
                    <View key={item} style={styles.chip}>
                      <Text style={styles.chipText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.note}>
                {isCustodianUser
                  ? "This login is matched to a custodian record. Use planting or existing-tree capture only. Maintenance remains unavailable."
                  : "If you link an existing-tree or planting record to a custodian, it will follow the same community allocation trail used in Green web."}
              </Text>
            </View>
          ) : (
            <Text style={styles.note}>No custodian is selected yet. Existing-tree records can still be linked to one from the tree form below.</Text>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="Map & Add Trees" subtitle={undefined}>
        <View style={styles.summaryChipRow}>
          <StatusChip label={`Submitted: ${plantingReviewCounts.submitted}`} tone="warning" />
          <StatusChip label={`Approved: ${plantingReviewCounts.approved}`} tone="online" />
          <StatusChip label={`Remaining: ${pendingPlanting}`} tone={pendingPlanting > 0 ? "warning" : "online"} />
        </View>

        {assignedPlantingAreas.length > 0 ? (
          <View style={styles.assignedAreaBanner}>
            <Text style={styles.assignedAreaTitle}>Assigned planting area enabled</Text>
            <Text style={styles.assignedAreaText}>
              {assignedPlantingAreas.length} plot{assignedPlantingAreas.length === 1 ? "" : "s"} visible on map for this user.
            </Text>
          </View>
        ) : null}

        <GreenTreeCaptureMap
          trees={myTrees}
          captureLocation={existingTreeBatchCaptureActive ? null : lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null}
          onPickLocation={!existingTreeBatchCaptureActive ? (coordinate) => setPoint(coordinate.latitude, coordinate.longitude, "map") : undefined}
          onAddPolygonPoint={(coordinate) => setPolygonPoints((prev) => [...prev, [coordinate.longitude, coordinate.latitude]])}
          interactive={!(existingTreeBatchCaptureActive && useAssignedArea)}
          mode={existingTreeBatchCaptureActive ? "polygon" : "point"}
          drawTool={existingTreeBatchCaptureActive ? "polygon" : "point"}
          showDrawControls
          onSelectDrawTool={handleSelectMapDrawTool}
          onClearDraft={handleClearMapDraft}
          polygonPoints={existingTreeBatchCaptureActive && !useAssignedArea ? polygonPoints : []}
          overlayAreas={[
            ...overlayAreas,
            ...(useAssignedArea && selectedAreaOrder?.area_geojson
              ? [{ id: `selected-order-${selectedAreaOrder.id}`, geometry: normalizeMapGeometry(selectedAreaOrder.area_geojson), strokeColor: "rgba(35,146,82,0.92)", fillColor: "rgba(35,146,82,0.10)" }]
              : []),
          ]}
          mapHeight={320}
          overlayTitle={mapOverlayTitle}
          overlaySubtitle={mapOverlaySubtitle}
          fitPoints={mapFitPoints}
        />

        {existingTreeBatchCaptureActive && !useAssignedArea ? (
          <View style={styles.metricRow}>
            <PrimaryButton label="Clear polygon" onPress={() => setPolygonPoints([])} variant="secondary" />
          </View>
        ) : null}

        <View style={styles.formSection}>
        {!existingTreeBatchCaptureActive ? (
          <>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>GPS</Text>
                <PrimaryButton label="Use GPS Location" onPress={() => void useGps()} variant="secondary" />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>LNG</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Longitude"
                  placeholderTextColor={colors.textMuted}
                  value={lng === null ? "" : String(lng)}
                  onChangeText={(value) => setLng(value.trim() ? Number(value) : null)}
                  keyboardType="decimal-pad"
                  editable={false}
                />
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>LAT</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Latitude"
                  placeholderTextColor={colors.textMuted}
                  value={lat === null ? "" : String(lat)}
                  onChangeText={(value) => setLat(value.trim() ? Number(value) : null)}
                  keyboardType="decimal-pad"
                  editable={false}
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>SPECIES</Text>
                {treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation ? (
                  <Pressable onPress={() => setSpeciesPickerOpen(true)} style={styles.selectField}>
                    <Text style={[styles.selectValue, !species && styles.selectPlaceholder]}>
                      {species || "Select assigned species"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                  </Pressable>
                ) : (
                  <TextInput style={styles.input} placeholder="Species" placeholderTextColor={colors.textMuted} value={species} onChangeText={setSpecies} />
                )}
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>SPECIES</Text>
            {treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation ? (
              <Pressable onPress={() => setSpeciesPickerOpen(true)} style={styles.selectField}>
                <Text style={[styles.selectValue, !species && styles.selectPlaceholder]}>
                  {species || "Select assigned species"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
              </Pressable>
            ) : (
              <TextInput style={styles.input} placeholder="Species" placeholderTextColor={colors.textMuted} value={species} onChangeText={setSpecies} />
            )}
          </>
        )}
        <Text style={styles.fieldLabel}>Tree Entry Type</Text>
        <Pressable onPress={() => setTreeOriginPickerOpen(true)} style={styles.selectField}>
          <Text style={styles.selectValue}>{treeOrigin === "existing_inventory" ? "Existing Tree" : "New Planting"}</Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
        </Pressable>
        <Text style={styles.fieldLabel}>{treeOrigin === "existing_inventory" ? "Reference date" : "Planting date"}</Text>
        <DateField
          value={plantingDate}
          onChange={setPlantingDate}
          placeholder={treeOrigin === "existing_inventory" ? "Select reference date" : "Select planting date"}
        />
        {treeOrigin === "existing_inventory" ? (
          <Text style={styles.helpText}>Saved as the tree planting date/reference date and shown to supervisors in Work review.</Text>
        ) : null}
        {treeOrigin === "existing_inventory" ? (
          <>
            <Text style={styles.fieldLabel}>Estimated age (months)</Text>
            <TextInput style={styles.input} placeholder="Optional if exact planting date is unknown" placeholderTextColor={colors.textMuted} value={treeAgeMonths} onChangeText={setTreeAgeMonths} keyboardType="number-pad" />
            <Text style={styles.helpText}>Optional. Used for CO2 estimation when planting date is not available for an existing tree.</Text>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" ? (
          <>
            <Pressable onPress={() => toggleExistingBatchMode(!existingBatchMode)} style={styles.checkRow}>
              <Ionicons name={existingBatchMode ? "checkbox" : "square-outline"} size={20} color={colors.primaryDark} />
              <Text style={styles.checkText}>Capture multiple existing trees in one mapped area (polygon)</Text>
            </Pressable>
            <Text style={styles.helpText}>Use this when recording an existing-tree inventory area. Draw the polygon on the map and enter the number of trees.</Text>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" && existingBatchMode && reusableAreaOrders.length > 0 ? (
          <>
            <Pressable onPress={() => toggleUseAssignedArea(!useAssignedArea)} style={styles.checkRow}>
              <Ionicons name={useAssignedArea ? "checkbox" : "square-outline"} size={20} color={colors.primaryDark} />
              <Text style={styles.checkText}>Use supervisor-assigned polygon instead of drawing a new one</Text>
            </Pressable>
            <Text style={styles.helpText}>
              {`Supervisors enabled reuse on ${reusableAreaOrders.length} assigned planting area${reusableAreaOrders.length === 1 ? "" : "s"}.`}
            </Text>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" && existingBatchMode && useAssignedArea && reusableAreaOrders.length > 1 ? (
          <>
            <Text style={styles.fieldLabel}>Supervisor Polygon</Text>
            <Pressable onPress={() => setAreaPickerOpen(true)} style={styles.selectField}>
              <Text style={styles.selectValue}>{selectedAreaOrder?.area_label || `Area order #${selectedAreaOrder?.id || ""}`}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
            </Pressable>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" && existingBatchMode ? (
          <>
            <Text style={styles.fieldLabel}>Number of trees in area</Text>
            <TextInput style={styles.input} placeholder="e.g. 24" placeholderTextColor={colors.textMuted} value={inventoryTreeCount} onChangeText={setInventoryTreeCount} keyboardType="number-pad" />
            <Text style={styles.fieldLabel}>Area Polygon</Text>
            <TextInput
              style={styles.input}
              editable={false}
              value={
                useAssignedArea
                  ? selectedAreaOrder
                    ? `Using supervisor polygon: ${selectedAreaOrder.area_label?.trim() || `Assigned area #${selectedAreaOrder.id}`}`
                    : "No reusable supervisor polygon selected"
                  : polygonPoints.length >= 3
                    ? "Polygon captured on map"
                    : "No polygon drawn yet"
              }
            />
            <Text style={styles.helpText}>
              {useAssignedArea
                ? "The selected supervisor polygon will be stored for this existing-tree batch record."
                : "Tap the map to draw one polygon for this existing-tree batch record."}
            </Text>
          </>
        ) : null}
          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={styles.fieldLabel}>Tree Height (m)</Text>
              <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={colors.textMuted} value={treeHeightM} onChangeText={setTreeHeightM} keyboardType="decimal-pad" />
            </View>
            <View style={styles.formCol}>
              <Text style={styles.fieldLabel}>Status</Text>
              <Pressable onPress={() => setStatusPickerOpen(true)} style={styles.selectField}>
                <Text style={styles.selectValue}>{treeStatusOptions.find((option) => option.value === status)?.label || "Select status"}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
              </Pressable>
            </View>
          </View>

        {treeOrigin === "existing_inventory" && !isCustodianUser ? (
          <>
            <Text style={styles.fieldLabel}>Custodian</Text>
            <Pressable onPress={() => setCustodianPickerOpen(true)} style={styles.selectField}>
              <Text style={styles.selectValue}>{effectiveCustodianId ? custodians.find((custodian) => custodian.id === effectiveCustodianId)?.name || "Selected custodian" : "No custodian"}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
            </Pressable>
          </>
        ) : null}
        <Text style={styles.fieldLabel}>Added By</Text>
        <View style={styles.selectField}>
          <Text style={styles.selectValue}>{session?.user.full_name || "Current user"}</Text>
        </View>

        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="Field notes" placeholderTextColor={colors.textMuted} multiline value={notes} onChangeText={setNotes} />
        <Text style={styles.fieldLabel}>{existingTreeBatchCaptureActive ? "Tree Photos (Multiple) *" : "Tree Photo *"}</Text>
        <View style={styles.metricRow}>
          <PrimaryButton label="Camera" onPress={() => void capturePhoto()} variant="secondary" />
        </View>
        <Text style={styles.helpText}>
          {existingTreeBatchCaptureActive
            ? "Take one or more photos with the camera for this existing-tree area record. At least one photo is required."
            : "Take one tree photo with the camera before adding this tree."}
        </Text>
        {photos.length ? (
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <Pressable key={photo.uri} onPress={() => setPhotos((prev) => prev.filter((item) => item.uri !== photo.uri))} style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <View style={styles.photoTag}><Text style={styles.photoTagText}>Remove</Text></View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {message ? <Text style={styles.note}>{message}</Text> : null}
        <PrimaryButton label={submitting ? "Saving..." : treeOrigin === "existing_inventory" ? "Save Existing Tree" : "Add Tree"} onPress={() => void saveTree()} disabled={submitting || loading || syncing || !projects.length} />
        </View>
      </SectionCard>

      <SectionCard title="My latest tree records" subtitle="Recent tree records saved by this Green mobile user remain visible offline.">
        {!myTrees.length ? (
          <EmptyState title="No saved trees yet" subtitle="Once this user captures trees in the active project, they will appear here." />
        ) : (
          myTrees.slice(0, 8).map((tree) => (
            <View key={tree.id} style={styles.treeCard}>
              <View style={styles.treeHeader}>
                <View style={styles.treeText}>
                  <Text style={styles.treeTitle}>Tree #{tree.project_tree_no || tree.id}</Text>
                  <Text style={styles.treeSub}>{tree.species || "Unspecified species"}</Text>
                </View>
                {tree.sync_state === "pending" ? <StatusChip label="Queued" tone="warning" /> : <StatusChip label="Cached" tone="neutral" />}
              </View>
              <Text style={styles.meta}>{toTitle(tree.status)} | {formatDate(tree.planting_date)}</Text>
              <Text style={styles.meta}>GPS {tree.lat !== null && tree.lng !== null ? `${formatCoordinate(tree.lat)}, ${formatCoordinate(tree.lng)}` : "Not set"}</Text>
              {(tree.inventory_tree_count || 1) > 1 ? <Text style={styles.meta}>Batch record: {tree.inventory_tree_count} trees</Text> : null}
            </View>
          ))
        )}
      </SectionCard>

      <SelectSheet
        visible={custodianPickerOpen}
        title="Select custodian"
        options={[
          { label: "No custodian", value: "" },
          ...custodians.map((custodian) => ({ label: custodian.name, value: String(custodian.id), description: `${custodian.custodian_type}${custodian.community_name ? ` | ${custodian.community_name}` : ""}` })),
        ]}
        selectedValue={selectedCustodianId}
        onClose={() => setCustodianPickerOpen(false)}
        onSelect={(value) => setSelectedCustodianId(value)}
      />

      <SelectSheet
        visible={areaPickerOpen}
        title="Select reusable polygon"
        options={reusableAreaOrders.map((row) => ({ label: row.area_label || `Area order #${row.id}`, value: String(row.id), description: row.assignee_name || "Supervisor-assigned polygon" }))}
        selectedValue={selectedAreaOrderId}
        onClose={() => setAreaPickerOpen(false)}
        onSelect={(value) => setSelectedAreaOrderId(value)}
      />
      <SelectSheet
        visible={treeOriginPickerOpen}
        title="Tree Entry Type"
        options={[
          { label: "New Planting", value: "new_planting" },
          { label: "Existing Tree", value: "existing_inventory" },
        ]}
        selectedValue={treeOrigin}
        onClose={() => setTreeOriginPickerOpen(false)}
        onSelect={(value) => {
          setTreeOriginPickerOpen(false);
          switchTreeOrigin(value === "existing_inventory" ? "existing_inventory" : "new_planting");
        }}
      />
      <SelectSheet
        visible={speciesPickerOpen}
        title="Select assigned species"
        options={speciesOptions.map((item) => ({
          label: item.species,
          value: item.species,
          description: `${item.remaining} remaining of ${item.total}`,
        }))}
        selectedValue={species}
        onClose={() => setSpeciesPickerOpen(false)}
        onSelect={(value) => {
          setSpeciesPickerOpen(false);
          setSpecies(value);
        }}
      />
      <SelectSheet
        visible={statusPickerOpen}
        title="Status"
        options={treeStatusOptions.map((option) => ({ label: option.label, value: option.value }))}
        selectedValue={status}
        onClose={() => setStatusPickerOpen(false)}
        onSelect={(value) => {
          setStatusPickerOpen(false);
          setStatus(value);
        }}
      />
      {plantingFlowState !== "idle" ? (
        <View style={styles.plantingOverlay}>
          <View style={styles.plantingModal}>
            {plantingFlowState === "loading" ? (
              <View style={styles.plantingCircle}>
                <ActivityIndicator size="large" color={colors.primaryDark} />
              </View>
            ) : (
              <View style={[styles.plantingCircle, styles.plantingCircleSuccess]}>
                <Ionicons name="checkmark" size={30} color={colors.inverseText} />
              </View>
            )}
            <Text style={styles.plantingTitle}>
              {plantingFlowState === "loading"
                ? treeOrigin === "existing_inventory"
                  ? "Saving record"
                  : "Adding tree"
                : "Saved"}
            </Text>
            <Text style={styles.plantingMessage}>{plantingFlowMessage}</Text>
          </View>
        </View>
      ) : null}
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 124 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  backText: { color: colors.primaryDark, fontSize: 13, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  projectCard: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
  },
  projectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  projectText: { flex: 1, gap: 4 },
  projectName: { color: colors.text, fontSize: 18, fontWeight: "900" },
  projectMeta: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  metricRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  summaryChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  note: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  helpText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  plantingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13, 29, 19, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  plantingModal: {
    width: "86%",
    maxWidth: 320,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  plantingCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
  },
  plantingCircleSuccess: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  plantingTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  plantingMessage: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  assignedAreaBanner: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    gap: 4,
  },
  assignedAreaTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: "800" },
  assignedAreaText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  formSection: { gap: spacing.md },
  fieldLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  formRow: { flexDirection: "row", gap: spacing.sm },
  formCol: { flex: 1, gap: spacing.xs },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: "600",
  },
  textArea: { minHeight: 110, paddingTop: spacing.md, textAlignVertical: "top" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSoft, fontSize: 13, fontWeight: "800" },
  chipTextActive: { color: colors.primaryDark },
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
  selectValue: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  selectPlaceholder: { color: colors.textMuted, fontWeight: "500" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoWrap: { width: 92, height: 92, borderRadius: radii.md, overflow: "hidden", position: "relative" },
  photo: { width: "100%", height: "100%" },
  photoTag: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(7,24,14,0.72)",
    paddingVertical: 4,
    alignItems: "center",
  },
  photoTagText: { color: colors.inverseText, fontSize: 10, fontWeight: "800" },
  treeCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: 6,
  },
  treeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  treeText: { flex: 1, gap: 2 },
  treeTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  treeSub: { color: colors.textSoft, fontSize: 13, fontWeight: "700" },
});
