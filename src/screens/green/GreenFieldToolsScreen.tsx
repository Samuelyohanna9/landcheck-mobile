import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { buildSponsorAgentQrSheetUrl, fetchSponsorAgentQrUnits, fetchTreePhotoDataUri, fetchTreeTimeline } from "../../api/green";
import { getErrorMessage } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { DateField } from "../../components/DateField";
import { GreenTreeCaptureMap } from "../../components/GreenTreeCaptureMap";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { SelectSheet } from "../../components/SelectSheet";
import { StatusChip } from "../../components/StatusChip";
import { SyncProgressPanel } from "../../components/SyncProgressPanel";
import { API_URL } from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  EXISTING_TREE_STATUS_OPTIONS,
  FIELD_CAPTURE_TASK_TYPE,
  NEW_TREE_STATUS_OPTIONS,
  formatWorkflowTaskTypeLabel,
  normalizeName,
  normalizeTaskState,
  PLANTING_TASK_TYPES,
} from "../../green/workflow";
import { getWorkflowLabels, isAgricProject, isReliefRecoveryProject } from "../../green/projectProfile";
import { normalizeMapGeometry, normalizePhotoList, normalizeSpeciesAllocations } from "../../green/normalize";
import { filterVisibleTreeRecords } from "../../green/treeRecords";
import { downloadOfflinePack, listOfflinePacks, projectOfflinePackName } from "../../maps/offlineRegions";
import { colors, radii, spacing } from "../../theme/tokens";
import type { AgricPlotProfile, DraftPhoto, ReliefSiteProfile, SponsorAgentQrUnitSummary, TaskSummary, TreeSummary } from "../../types/domain";
import { appendGreenAssetRenderParams, cacheGreenAssetLocally, resolveGreenAssetCandidates } from "../../utils/assets";
import { boundsFromPoints, coordinateSummaryFromGeometry, polygonAreaSquareMeters, polygonCentroid, polygonGeoJsonFromPoints, type LngLat } from "../../utils/geo";
import { formatCoordinate, formatDate, toTitle } from "../../utils/format";
import { cacheTreeTasks, cacheTreeTimeline, readCachedTreeTimeline } from "../../storage/database";

const todayString = () => new Date().toISOString().slice(0, 10);
const treePhotoEndpoint = (treeId: number) => `${API_URL}/green/trees/${treeId}/photo?w=1280&q=76&fm=jpeg`;

const buildTreePhotoCandidates = (treeId: number, tree?: TreeSummary | null) => {
  if (!treeId) return [] as string[];
  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (value: string) => {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    urls.push(next);
  };

  const urlSources = normalizePhotoList([tree?.photo_url, ...(tree?.photo_urls || [])]);
  for (const url of urlSources) {
    for (const candidate of resolveGreenAssetCandidates(url)) {
      add(appendGreenAssetRenderParams(candidate, { w: 1280, q: 76, fm: "jpeg" }));
    }
  }

  add(treePhotoEndpoint(treeId));
  return urls;
};

const isClosedWorkOrder = (value?: string | null) => {
  const status = normalizeTaskState(value);
  return status === "done" || status === "completed" || status === "closed" || status === "cancelled";
};
const isTruthyFlag = (value: unknown) => {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
};

const isPublicSponsorshipProject = (project?: { access_model?: string | null; public_sponsor_enabled?: boolean | null } | null) => {
  const accessModel = String(project?.access_model || "").trim().toLowerCase();
  return accessModel === "public_sponsorship" || Boolean(project?.public_sponsor_enabled);
};

const buildAgentQrDownloadQuery = (user?: { id?: number | null; organization_id?: number | null } | null) => {
  const pairs: string[] = [];
  const userId = Number(user?.id || 0);
  const organizationId = Number(user?.organization_id || 0);
  if (userId > 0) pairs.push(`user_id=${encodeURIComponent(String(userId))}`);
  if (organizationId > 0) pairs.push(`organization_id=${encodeURIComponent(String(organizationId))}`);
  // Cache-bust: without this, some Android browsers/PDF viewers reopen a previously
  // downloaded copy for what looks like the same URL instead of fetching a fresh one.
  pairs.push(`_ts=${Date.now()}`);
  return pairs.join("&");
};

const appendDownloadQuery = (url: string, query: string) => (query ? `${url}?${query}` : url);

const FieldError = ({ message }: { message?: string }) =>
  message ? <Text style={styles.fieldError}>{message}</Text> : null;

const AGRIC_IRRIGATION_OPTIONS = [
  { label: "Rainfed", value: "rainfed" },
  { label: "Manual", value: "manual" },
  { label: "Pump", value: "pump" },
  { label: "Drip", value: "drip" },
  { label: "Sprinkler", value: "sprinkler" },
  { label: "Flood", value: "flood" },
  { label: "Other", value: "other" },
];

const AGRIC_PRODUCTION_STAGE_OPTIONS = [
  { label: "Land preparation", value: "land_preparation" },
  { label: "Nursery", value: "nursery" },
  { label: "Planting", value: "planting" },
  { label: "Vegetative", value: "vegetative" },
  { label: "Flowering", value: "flowering" },
  { label: "Fruiting", value: "fruiting" },
  { label: "Harvest", value: "harvest" },
  { label: "Post-harvest", value: "post_harvest" },
];

const RELIEF_ASSET_TYPE_OPTIONS = [
  { label: "House", value: "house" },
  { label: "Shelter unit", value: "shelter_unit" },
  { label: "Shop", value: "shop" },
  { label: "School block", value: "school_block" },
  { label: "Health facility", value: "health_facility" },
  { label: "Water point", value: "water_point" },
  { label: "Latrine block", value: "latrine_block" },
  { label: "Road segment", value: "road_segment" },
  { label: "Drainage", value: "drainage" },
  { label: "Community asset", value: "community_asset" },
  { label: "Other", value: "other" },
];
const RELIEF_DAMAGE_LEVEL_OPTIONS = [
  { label: "Minor damage", value: "minor" },
  { label: "Major damage", value: "major" },
  { label: "Destroyed", value: "destroyed" },
  { label: "Habitable with repair", value: "habitable_with_repair" },
  { label: "Not habitable", value: "not_habitable" },
  { label: "Unknown", value: "unknown" },
];
const RELIEF_RESPONSE_PATHWAY_OPTIONS = [
  { label: "Assessment only", value: "assessment_only" },
  { label: "Repair", value: "repair" },
  { label: "Rebuild", value: "rebuild" },
  { label: "Cash support", value: "cash_support" },
  { label: "Materials only", value: "materials_only" },
  { label: "Contractor rehab", value: "contractor_rehab" },
  { label: "Infrastructure repair", value: "infrastructure_repair" },
  { label: "Other", value: "other" },
];

type ReliefGeometryMode = "point" | "line" | "polygon";

const RELIEF_POINT_ASSET_TYPES = new Set(["water_point"]);
const RELIEF_LINE_ASSET_TYPES = new Set(["road_segment", "drainage"]);

const getReliefGeometryMode = (assetType: string): ReliefGeometryMode => {
  const normalized = String(assetType || "").trim().toLowerCase();
  if (RELIEF_POINT_ASSET_TYPES.has(normalized)) return "point";
  if (RELIEF_LINE_ASSET_TYPES.has(normalized)) return "line";
  return "polygon";
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
    syncProgress,
    selectProject,
    refreshAll,
    createTree,
    deleteTree,
    updateTree,
  } = useGreenSync();

  const [species, setSpecies] = useState("");
  const [plotCode, setPlotCode] = useState("");
  const [plotVariety, setPlotVariety] = useState("");
  const [plotSeasonName, setPlotSeasonName] = useState("");
  const [plotSeasonYear, setPlotSeasonYear] = useState(String(new Date().getFullYear()));
  const [plotLandUse, setPlotLandUse] = useState("");
  const [plotEstimatedYieldKg, setPlotEstimatedYieldKg] = useState("");
  const [plotIrrigationType, setPlotIrrigationType] = useState("");
  const [plotProductionStage, setPlotProductionStage] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAssetType, setSiteAssetType] = useState("");
  const [siteDamageLevel, setSiteDamageLevel] = useState("");
  const [siteOccupancyStatus, setSiteOccupancyStatus] = useState("");
  const [siteTenureStatus, setSiteTenureStatus] = useState("");
  const [siteResponsePathway, setSiteResponsePathway] = useState("");
  const [siteFloorAreaSqm, setSiteFloorAreaSqm] = useState("");
  const [siteRoomsCount, setSiteRoomsCount] = useState("");
  const [siteEstimatedRepairCost, setSiteEstimatedRepairCost] = useState("");
  const [sitePopulationServed, setSitePopulationServed] = useState("");
  const [siteSupportPackage, setSiteSupportPackage] = useState("");
  const [siteSafetyRisks, setSiteSafetyRisks] = useState("");
  const [siteReportedNeed, setSiteReportedNeed] = useState("");
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
  const [reliefDrawTool, setReliefDrawTool] = useState<ReliefGeometryMode>("polygon");
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [existingBatchMode, setExistingBatchMode] = useState(false);
  const [useAssignedArea, setUseAssignedArea] = useState(false);
  const [selectedAreaOrderId, setSelectedAreaOrderId] = useState("");
  const [selectedCustodianId, setSelectedCustodianId] = useState("");
  const [fieldViewTab, setFieldViewTab] = useState<"map" | "add_tree">("map");
  const [custodianPickerOpen, setCustodianPickerOpen] = useState(false);
  const [lockedCaptureTaskId, setLockedCaptureTaskId] = useState<number | null>(null);
  const [lockedCaptureFarmerName, setLockedCaptureFarmerName] = useState<string | null>(null);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [treeOriginPickerOpen, setTreeOriginPickerOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [speciesPickerOpen, setSpeciesPickerOpen] = useState(false);
  const [plotIrrigationPickerOpen, setPlotIrrigationPickerOpen] = useState(false);
  const [plotProductionStagePickerOpen, setPlotProductionStagePickerOpen] = useState(false);
  const [siteAssetTypePickerOpen, setSiteAssetTypePickerOpen] = useState(false);
  const [siteDamageLevelPickerOpen, setSiteDamageLevelPickerOpen] = useState(false);
  const [siteResponsePathwayPickerOpen, setSiteResponsePathwayPickerOpen] = useState(false);
  const [reuseRefreshAttempted, setReuseRefreshAttempted] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [gpsSource, setGpsSource] = useState<"gps" | "map" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [plantingFlowState, setPlantingFlowState] = useState<"idle" | "loading" | "success">("idle");
  const [plantingFlowMessage, setPlantingFlowMessage] = useState("");
  const [selectedTreeId, setSelectedTreeId] = useState<number | null>(null);
  const [isAdjustingTree, setIsAdjustingTree] = useState(false);
  const [treeDraftLocation, setTreeDraftLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [treeActionBusy, setTreeActionBusy] = useState<"move" | "delete" | null>(null);
  const [selectedTreeRecentTasks, setSelectedTreeRecentTasks] = useState<TaskSummary[]>([]);
  const [selectedTreeInspectorLoading, setSelectedTreeInspectorLoading] = useState(false);
  const [selectedTreePhotoUrlIndex, setSelectedTreePhotoUrlIndex] = useState(0);
  const [selectedTreePhotoCachedUri, setSelectedTreePhotoCachedUri] = useState("");
  const [selectedTreePhotoDataUri, setSelectedTreePhotoDataUri] = useState("");
  const [selectedTreePhotoLoading, setSelectedTreePhotoLoading] = useState(false);
  const [capturingGps, setCapturingGps] = useState(false);
  const [sponsorQrUnits, setSponsorQrUnits] = useState<SponsorAgentQrUnitSummary[]>([]);
  const [sponsorQrUnitsLoading, setSponsorQrUnitsLoading] = useState(false);
  const [sponsorQrUnitsError, setSponsorQrUnitsError] = useState("");

  const activeProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || projects[0] || null, [projects, selectedProjectId]);
  const workflowLabels = useMemo(() => getWorkflowLabels(activeProject || null), [activeProject]);
  const agricMode = useMemo(() => isAgricProject(activeProject || null), [activeProject]);
  const reliefMode = useMemo(() => isReliefRecoveryProject(activeProject || null), [activeProject]);
  const fieldWorkflowMode = agricMode || reliefMode;
  const publicSponsorshipProject = useMemo(
    () => !fieldWorkflowMode && isPublicSponsorshipProject(activeProject || null),
    [activeProject, fieldWorkflowMode],
  );
  const reliefGeometryMode = reliefMode ? reliefDrawTool : "polygon";
  const currentUser = normalizeName(session?.user.full_name);
  const qrDownloadQuery = useMemo(
    () => buildAgentQrDownloadQuery(session?.user),
    [session?.user?.id, session?.user?.organization_id],
  );
  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    if (!fieldWorkflowMode) return;
    setTreeOrigin("existing_inventory");
    setStatus("healthy");
    setExistingBatchMode(true);
  }, [fieldWorkflowMode]);

  useEffect(() => {
    if (!reliefMode) return;
    setReliefDrawTool(getReliefGeometryMode(siteAssetType));
  }, [reliefMode, siteAssetType]);

  const visibleProjectTrees = useMemo(() => filterVisibleTreeRecords(trees), [trees]);

  const myTrees = useMemo(() => {
    const custodianId = Number(matchedCustodian?.id || 0);
    return visibleProjectTrees.filter((tree) => {
      if (isCustodianUser && custodianId > 0) return Number(tree.custodian_id || 0) === custodianId;
      if (custodianId > 0 && Number(tree.custodian_id || 0) === custodianId) return true;
      return normalizeName(tree.created_by) === currentUser;
    });
  }, [currentUser, isCustodianUser, matchedCustodian?.id, visibleProjectTrees]);

  const mapTreeRecords = useMemo(
    () => (fieldWorkflowMode ? visibleProjectTrees : myTrees),
    [fieldWorkflowMode, myTrees, visibleProjectTrees],
  );

  const editableTreeIds = useMemo(() => new Set(myTrees.map((tree) => Number(tree.id))), [myTrees]);

  const selectedTree = useMemo(
    () => mapTreeRecords.find((tree) => tree.id === selectedTreeId) || null,
    [mapTreeRecords, selectedTreeId],
  );

  const selectedTreeEditable = Boolean(selectedTree && editableTreeIds.has(Number(selectedTree.id)));

  const mapTrees = useMemo(
    () =>
      mapTreeRecords.map((tree) =>
        tree.id === selectedTreeId && treeDraftLocation
          ? {
              ...tree,
              lat: treeDraftLocation.latitude,
              lng: treeDraftLocation.longitude,
            }
          : tree,
      ),
    [mapTreeRecords, selectedTreeId, treeDraftLocation],
  );

  // Ordered list of photo URLs to try for the selected tree.
  // expo-image tries index 0 first. On each onError the index advances to the next candidate.
  // Last entry is always the server-side /photo endpoint which does its own DB lookup across all sources.
  const _legacySelectedTreePhotoUrls = useMemo(() => {
    if (!selectedTreeId) return [] as string[];
    const seen = new Set<string>();
    const urls: string[] = [];
    const add = (u: string) => {
      const v = u.trim();
      if (v && !seen.has(v)) { seen.add(v); urls.push(v); }
    };
    const urlSources = [selectedTree?.photo_url, ...(selectedTree?.photo_urls || [])];
    for (const url of urlSources) {
      const str = String(url || "").trim();
      if (!str) continue;
      for (const candidate of resolveGreenAssetCandidates(str)) {
        add(appendGreenAssetRenderParams(candidate, { w: 1280, q: 76, fm: "jpeg" }));
      }
    }
    // Server-side endpoint aggregates all sources (tree + tasks + visits) — always last resort
    add(`${API_URL}/green/trees/${selectedTreeId}/photo?w=1280&q=76&fm=jpeg`);
    return urls;
  }, [selectedTree, selectedTreeId]);
  const selectedTreePhotoUrls = useMemo(
    () => (selectedTreeId ? buildTreePhotoCandidates(selectedTreeId, selectedTree) : []),
    [selectedTree, selectedTreeId],
  );

  const workWaitingToSend = offlineStats.queued;
  const showWorkStatus = syncProgress.active || workWaitingToSend > 0;
  const workStatusMessage = syncProgress.active
    ? "Saved work is being sent now. Keep the app open until it finishes."
    : workWaitingToSend > 0
      ? `${workWaitingToSend} item${workWaitingToSend === 1 ? "" : "s"} saved on this phone. They will send automatically when you have network.`
      : "";

  const userPlantingTrees = useMemo(
    () => myTrees.filter((tree) => normalizeTaskState(tree.tree_origin || "new_planting") === "new_planting"),
    [myTrees],
  );
  const approvedPlantingTrees = useMemo(
    () => userPlantingTrees.filter((tree) => normalizeTaskState(tree.status) !== "pending_planting"),
    [userPlantingTrees],
  );

  const activePlantingOrders = useMemo(
    () =>
      workOrders
        .filter((row) => PLANTING_TASK_TYPES.has(normalizeTaskState(row.work_type)))
        .filter((row) => !isClosedWorkOrder(row.status)),
    [workOrders],
  );

  const loadSponsorQrUnits = useCallback(() => {
    if (!publicSponsorshipProject || !activeProject?.id || !session?.user?.id) {
      setSponsorQrUnits([]);
      setSponsorQrUnitsError("");
      setSponsorQrUnitsLoading(false);
      return;
    }
    setSponsorQrUnitsLoading(true);
    setSponsorQrUnitsError("");
    fetchSponsorAgentQrUnits(activeProject.id, Number(session.user.id || 0), session.user.organization_id ?? null)
      .then((rows) => {
        setSponsorQrUnits(rows);
        setSponsorQrUnitsError("");
      })
      .catch((error) => {
        setSponsorQrUnits([]);
        setSponsorQrUnitsError(getErrorMessage(error, "Failed to load sponsor QR tags."));
      })
      .finally(() => {
        setSponsorQrUnitsLoading(false);
      });
  }, [activeProject?.id, publicSponsorshipProject, session?.user?.id, session?.user?.organization_id]);

  useEffect(() => {
    loadSponsorQrUnits();
  }, [loadSponsorQrUnits]);

  const sponsorPlantingRestricted = publicSponsorshipProject && !fieldWorkflowMode && treeOrigin !== "existing_inventory";
  const sponsorQrLookupRecoverable =
    sponsorPlantingRestricted &&
    !sponsorQrUnitsLoading &&
    Boolean(sponsorQrUnitsError) &&
    activePlantingOrders.length > 0;
  const sponsorAssignmentRequiredMessage = sponsorPlantingRestricted
    ? sponsorQrUnitsLoading
      ? "Checking your sponsor-funded planting assignment..."
      : sponsorQrUnits.length > 0
        ? ""
        : sponsorQrUnitsError && !sponsorQrLookupRecoverable
        ? "Sponsor assignment could not be confirmed yet. Refresh this page or reconnect, then try again."
        : sponsorQrUnits.length === 0
          ? "No sponsor-funded tree is currently assigned to you in this project yet. Ask your supervisor to assign sponsor QR tags before planting."
          : ""
    : "";
  const sponsorAssignmentWarningMessage =
    sponsorPlantingRestricted && sponsorQrLookupRecoverable
      ? "Sponsor QR tags could not be refreshed just now. If this planting order was already assigned to you, you can continue and the server will confirm the reservation when you save."
      : "";

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
    approvedPlantingTrees.forEach((tree) => {
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
  }, [activeOrderSpeciesAllocations, approvedPlantingTrees]);

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

  const formatMapPlotAreaLabel = (tree: (typeof visibleProjectTrees)[number]) => {
    const hectares = Number(tree.record_profile_data?.area_hectares);
    if (Number.isFinite(hectares) && hectares > 0) return `${hectares.toFixed(2)} ha`;
    const squareMeters = Number(tree.existing_area_sqm || 0);
    if (!Number.isFinite(squareMeters) || squareMeters <= 0) return "";
    return `${(squareMeters / 10000).toFixed(2)} ha`;
  };

  const formatReliefMapGeometryLabel = (tree: (typeof visibleProjectTrees)[number]) => {
    const areaLabel = formatMapPlotAreaLabel(tree);
    if (areaLabel) return areaLabel;
    const boundaryMethod = String(tree.record_profile_data?.relief_boundary_capture_method || "").trim();
    if (boundaryMethod.startsWith("line")) return "Linear asset";
    if (boundaryMethod === "point") return "Point site";
    const geometryType = String(normalizeMapGeometry(tree.existing_area_geojson)?.type || "").trim();
    if (geometryType === "LineString" || geometryType === "MultiLineString") return "Linear asset";
    if (geometryType === "Point") return "Point site";
    return "";
  };

  const buildAgricPlotOverlayLabel = (tree: (typeof visibleProjectTrees)[number]) => {
    const cropLabel = String(
      agricMode
        ? tree.record_profile_data?.commodity || tree.species || ""
        : reliefMode
          ? tree.record_profile_data?.asset_type || tree.species || ""
          : tree.species || "",
    ).trim();
    const areaLabel = reliefMode ? formatReliefMapGeometryLabel(tree) : formatMapPlotAreaLabel(tree);
    return [
      String(tree.custodian_name || "").trim() || (reliefMode ? "Beneficiary not linked" : "Farmer not linked"),
      [cropLabel, areaLabel].filter(Boolean).join(" | "),
    ]
      .filter(Boolean)
      .join("\n");
  };

  const overlayAreas = useMemo(
    () =>
      fieldWorkflowMode
        ? [
            ...visibleProjectTrees
              .filter((tree) => tree.existing_area_geojson)
              .map((tree) => ({
                id: `${reliefMode ? "site" : "plot"}-${tree.id}`,
                geometry: normalizeMapGeometry(tree.existing_area_geojson),
                strokeColor: "rgba(185,28,28,0.94)",
                fillColor: "rgba(220,38,38,0.08)",
                label: buildAgricPlotOverlayLabel(tree),
                recordId: Number(tree.id),
              })),
            ...assignedPlantingAreas.map((row) => ({
              id: `order-${row.id}`,
              geometry: normalizeMapGeometry(row.area_geojson),
              strokeColor: "rgba(127,29,29,0.94)",
              fillColor: "rgba(185,28,28,0.05)",
            })),
          ]
        : [
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
    [agricMode, assignedPlantingAreas, fieldWorkflowMode, myTrees, reliefMode, visibleProjectTrees],
  );

  const activeUserPoints = useMemo(
    () =>
      mapTreeRecords
        .filter((tree) => Number.isFinite(tree.lng) && Number.isFinite(tree.lat))
        .map((tree) => [Number(tree.lng), Number(tree.lat)] as LngLat),
    [mapTreeRecords],
  );

  const assignedPlantingAreaPoints = useMemo(
    () => assignedPlantingAreas.flatMap((row) => coordinateSummaryFromGeometry(row.area_geojson).points),
    [assignedPlantingAreas],
  );

  const selectedAreaPoints = useMemo(
    () => (useAssignedArea && selectedAreaOrder ? coordinateSummaryFromGeometry(selectedAreaOrder.area_geojson).points : []),
    [selectedAreaOrder, useAssignedArea],
  );

  const existingTreeBatchCaptureActive = treeOrigin === "existing_inventory" && (agricMode || existingBatchMode);
  const reliefStructuredCapture = reliefMode && treeOrigin === "existing_inventory";
  const geometryDrawMode: "point" | "line" | "polygon" = reliefStructuredCapture ? reliefDrawTool : existingTreeBatchCaptureActive ? "polygon" : "point";
  const drawingPolylineGeometry = geometryDrawMode === "line" || geometryDrawMode === "polygon";
  const draftAreaSquareMeters = useMemo(() => {
    if (!existingTreeBatchCaptureActive || geometryDrawMode !== "polygon") return 0;
    if (useAssignedArea && selectedAreaPoints.length >= 3) {
      return polygonAreaSquareMeters(selectedAreaPoints);
    }
    if (polygonPoints.length >= 3) {
      return polygonAreaSquareMeters(polygonPoints);
    }
    return 0;
  }, [existingTreeBatchCaptureActive, geometryDrawMode, polygonPoints, selectedAreaPoints, useAssignedArea]);

  const projectBounds = useMemo(() => {
    const pointCoords: LngLat[] = mapTreeRecords
      .filter((tree) => Number.isFinite(tree.lng) && Number.isFinite(tree.lat))
      .map((tree) => [Number(tree.lng), Number(tree.lat)]);
    const geoCoords = [
      ...mapTreeRecords.flatMap((tree) => coordinateSummaryFromGeometry(tree.existing_area_geojson).points),
      ...activePlantingOrders.flatMap((row) => coordinateSummaryFromGeometry(row.area_geojson).points),
    ];
    return boundsFromPoints([...pointCoords, ...geoCoords]);
  }, [activePlantingOrders, mapTreeRecords]);

  const pendingPlanting = useMemo(() => {
    if (isCustodianUser && matchedCustodian) {
      const allocated = distributionAllocations
        .filter((row) => Number(row.custodian_id || 0) === Number(matchedCustodian.id))
        .reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0);
      const approvedPlanted = approvedPlantingTrees.filter((tree) => Number(tree.custodian_id || 0) === Number(matchedCustodian.id)).length;
      return Math.max(allocated - approvedPlanted, 0);
    }
    return activePlantingOrders
      .reduce((sum, row) => sum + Math.max(Number(row.target_trees || 0) - Number(row.planted_count || 0), 0), 0);
  }, [activePlantingOrders, approvedPlantingTrees, distributionAllocations, isCustodianUser, matchedCustodian]);

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

  const pendingFieldCaptureTasks = useMemo(() => {
    if (!fieldWorkflowMode) return [] as Array<{ task: TaskSummary; ownerName: string; ownerId: number; dueDate: string | null }>;
    const treeById = new Map(trees.map((tree) => [Number(tree.id), tree]));
    return tasks
      .filter((task) => normalizeTaskState(task.task_type) === FIELD_CAPTURE_TASK_TYPE)
      .filter((task) => {
        const status = normalizeTaskState(task.status);
        const reviewState = normalizeTaskState(task.review_state);
        return !(reviewState === "approved" || status === "done" || status === "completed" || status === "closed");
      })
      .map((task) => {
        const taskTree = treeById.get(Number(task.tree_id));
        const custodianNameFromTask = String(task.custodian_name || taskTree?.custodian_name || "").trim();
        const ownerName = custodianNameFromTask || `Unlinked ${workflowLabels.ownerLabel.toLowerCase()}`;
        let ownerId = Number(taskTree?.custodian_id || 0);
        // Resolve custodian id by name when the placeholder tree is not yet cached locally
        if (ownerId === 0 && custodianNameFromTask) {
          const found = custodians.find((c) => normalizeName(c.name) === normalizeName(custodianNameFromTask));
          if (found) ownerId = Number(found.id);
        }
        return {
          task,
          ownerName,
          ownerId,
          dueDate: task.due_date || null,
        };
      })
      .filter((row) => row.ownerId > 0 || String(row.task.custodian_name || "").trim().length > 0)
      .sort((a, b) => {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
  }, [custodians, fieldWorkflowMode, tasks, trees, workflowLabels.ownerLabel]);

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

  const handleSelectTree = (treeId: number | null) => {
    setSelectedTreeId(treeId);
    setIsAdjustingTree(false);
    setTreeDraftLocation(null);
  };

  const beginAdjustTree = () => {
    if (!selectedTree || selectedTree.lat == null || selectedTree.lng == null) return;
    if (!selectedTreeEditable) {
      setMessage(
        fieldWorkflowMode
          ? `This mapped ${workflowLabels.entitySingular.toLowerCase()} is read-only on this device. Open one captured by your workflow to adjust its anchor.`
          : "This record is read-only on this device.",
      );
      return;
    }
    setIsAdjustingTree(true);
    setTreeDraftLocation({
      latitude: Number(selectedTree.lat),
      longitude: Number(selectedTree.lng),
    });
    setMessage(
      fieldWorkflowMode
        ? `Drag the selected ${workflowLabels.entitySingular.toLowerCase()} anchor on the map only if the boundary needs a new anchor, then save.`
        : `Drag the selected ${workflowLabels.entitySingular.toLowerCase()} marker on the map, then save the new position.`,
    );
  };

  const cancelAdjustTree = () => {
    setIsAdjustingTree(false);
    setTreeDraftLocation(null);
    setMessage("");
  };

  const saveAdjustedTreePosition = async () => {
    if (!selectedTree || !treeDraftLocation) return;
    setTreeActionBusy("move");
    setMessage("");
    try {
      await updateTree({
        projectId: selectedTree.project_id,
        treeId: selectedTree.id,
        lat: treeDraftLocation.latitude,
        lng: treeDraftLocation.longitude,
      });
      setIsAdjustingTree(false);
      setTreeDraftLocation(null);
      setMessage(fieldWorkflowMode ? `${workflowLabels.entitySingular} anchor updated.` : `${workflowLabels.entitySingular} position updated.`);
    } catch (error) {
      setMessage(getErrorMessage(error, fieldWorkflowMode ? `Failed to update ${workflowLabels.entitySingular.toLowerCase()} anchor.` : `Failed to update ${workflowLabels.entitySingular.toLowerCase()} position.`));
    } finally {
      setTreeActionBusy(null);
    }
  };

  const confirmDeleteTree = () => {
    if (!selectedTree) return;
    if (!selectedTreeEditable) {
      setMessage(
        fieldWorkflowMode
          ? `This mapped ${workflowLabels.entitySingular.toLowerCase()} is read-only on this device and cannot be deleted here.`
          : `This ${workflowLabels.entitySingular.toLowerCase()} is read-only on this device.`,
      );
      return;
    }
    Alert.alert(
      `Delete ${workflowLabels.entitySingular.toLowerCase()}`,
      `Delete ${workflowLabels.entitySingular} #${selectedTree.project_tree_no || selectedTree.id}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setTreeActionBusy("delete");
              setMessage("");
              try {
                await deleteTree({ projectId: selectedTree.project_id, treeId: selectedTree.id });
                setSelectedTreeId(null);
                setIsAdjustingTree(false);
                setTreeDraftLocation(null);
                setMessage(`${workflowLabels.entitySingular} deleted.`);
              } catch (error) {
                setMessage(getErrorMessage(error, `Failed to delete ${workflowLabels.entitySingular.toLowerCase()}.`));
              } finally {
                setTreeActionBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      void selectProject(projects[0].id);
    }
  }, [projects, selectedProjectId, selectProject]);

  useEffect(() => {
    if (selectedTreeId && !selectedTree) {
      setSelectedTreeId(null);
      setIsAdjustingTree(false);
      setTreeDraftLocation(null);
    }
  }, [selectedTree, selectedTreeId]);

  useEffect(() => {
    setSelectedTreePhotoUrlIndex(0);
    setSelectedTreePhotoCachedUri("");
    setSelectedTreePhotoDataUri("");
  }, [selectedTreeId]);

  useEffect(() => {
    if (!isOnline || !myTrees.length) return;
    let cancelled = false;

    void (async () => {
      for (const tree of myTrees) {
        if (cancelled) return;
        const cacheableCandidates = buildTreePhotoCandidates(tree.id, tree).filter((url) => url !== treePhotoEndpoint(tree.id));
        for (const candidate of cacheableCandidates) {
          if (cancelled) return;
          try {
            const cachedUri = await cacheGreenAssetLocally(candidate, `tree-${tree.id}`);
            if (cachedUri) break;
          } catch {
            // Keep moving until one source is cached.
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOnline, myTrees]);

  useEffect(() => {
    if (!selectedTreeId) {
      setSelectedTreeRecentTasks([]);
      setSelectedTreeInspectorLoading(false);
      setSelectedTreePhotoLoading(false);
      return;
    }

    const localTasks = tasks
      .filter((task) => Number(task.tree_id) === Number(selectedTreeId))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    setSelectedTreeRecentTasks(localTasks.slice(0, 5));
    setSelectedTreeInspectorLoading(true);
    setSelectedTreePhotoLoading(true);

    let cancelled = false;

    void (async () => {
      try {
        const cachedTimeline = await readCachedTreeTimeline("green", selectedTreeId);
        const timelineTasks = Array.isArray((cachedTimeline as { tasks?: unknown[] } | null | undefined)?.tasks)
          ? ((cachedTimeline as { tasks?: unknown[] }).tasks || []).map((row) => row as TaskSummary)
          : [];
        if (!cancelled && timelineTasks.length) {
          setSelectedTreeRecentTasks(timelineTasks.slice(0, 5));
        }
      } catch {
        // Keep current local task summary when tree cache is unavailable.
      }
      if (!isOnline) {
        if (!cancelled) setSelectedTreeInspectorLoading(false);
        return;
      }
      try {
        const payload = await fetchTreeTimeline(selectedTreeId);
        if (cancelled) return;
        const timelineTasks = Array.isArray(payload?.tasks) ? (payload.tasks as TaskSummary[]) : [];
        setSelectedTreeRecentTasks(timelineTasks.slice(0, 5));
        await Promise.all([
          cacheTreeTimeline("green", selectedTreeId, payload),
          cacheTreeTasks("green", selectedTreeId, timelineTasks),
        ]);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setSelectedTreeInspectorLoading(false);
      }
    })();

    void (async () => {
      try {
        let resolved = false;
        for (const candidate of selectedTreePhotoUrls) {
          if (cancelled) return;
          try {
            const cachedUri = await cacheGreenAssetLocally(candidate, `tree-${selectedTreeId}`);
            if (!cancelled && cachedUri) {
              setSelectedTreePhotoCachedUri(cachedUri);
              resolved = true;
              break;
            }
          } catch {
            // Try the next candidate or fall back to the inline API response.
          }
        }
        if (cancelled || resolved || !isOnline) return;
        const dataUri = await fetchTreePhotoDataUri(selectedTreeId);
        if (cancelled) return;
        setSelectedTreePhotoDataUri(dataUri || "");
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setSelectedTreePhotoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOnline, selectedTreeId, selectedTreePhotoUrls, tasks]);

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
    setGpsSource(source);
    setSelectedTreeId(null);
    setIsAdjustingTree(false);
    setTreeDraftLocation(null);
    clearFieldError("gps");
    setMessage(
      source === "gps"
        ? "Current GPS captured."
        : `${workflowLabels.entitySingular} point updated from the map. Save still requires Use Current GPS.`,
    );
  };

  const useGps = async () => {
    setCapturingGps(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage(`Location permission is required to save this ${workflowLabels.entitySingular.toLowerCase()}.`);
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      if (drawingPolylineGeometry && !useAssignedArea) {
        setPolygonPoints((prev) => [...prev, [current.coords.longitude, current.coords.latitude]]);
        setGpsSource("gps");
        clearFieldError("areaPolygon");
        setMessage(
          reliefMode && geometryDrawMode === "line"
            ? `Current GPS vertex added to the ${workflowLabels.entitySingular.toLowerCase()} line.`
            : fieldWorkflowMode
              ? `Current GPS point added to the ${workflowLabels.entitySingular.toLowerCase()} boundary.`
              : "Current GPS point added to the polygon.",
        );
        return;
      }
      setPoint(current.coords.latitude, current.coords.longitude, "gps");
    } finally {
      setCapturingGps(false);
    }
  };

  const addDraftPhotos = (items: DraftPhoto[]) => setPhotos((prev) => [...prev, ...items]);

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      setMessage(`Camera permission is required to attach ${workflowLabels.entitySingular.toLowerCase()} evidence.`);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    addDraftPhotos([{ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, fileSize: asset.fileSize }]);
    clearFieldError("photos");
  };

  const resetForm = () => {
    setSpecies("");
    setPlotCode("");
    setPlotVariety("");
    setPlotSeasonName("");
    setPlotSeasonYear(String(new Date().getFullYear()));
    setPlotLandUse("");
    setPlotEstimatedYieldKg("");
    setPlotIrrigationType("");
    setPlotProductionStage("");
    setSiteCode("");
    setSiteAssetType("");
    setSiteDamageLevel("");
    setSiteOccupancyStatus("");
    setSiteTenureStatus("");
    setSiteResponsePathway("");
    setSiteFloorAreaSqm("");
    setSiteRoomsCount("");
    setSiteEstimatedRepairCost("");
    setSitePopulationServed("");
    setSiteSupportPackage("");
    setSiteSafetyRisks("");
    setSiteReportedNeed("");
    setPlantingDate(todayString());
    setTreeOrigin(fieldWorkflowMode ? "existing_inventory" : "new_planting");
    setStatus(fieldWorkflowMode ? "healthy" : "alive");
    setNotes("");
    setTreeHeightM("");
    setTreeAgeMonths("");
    setInventoryTreeCount("2");
    setLat(null);
    setLng(null);
    setPolygonPoints([]);
    setPhotos([]);
    setExistingBatchMode(fieldWorkflowMode);
    setUseAssignedArea(false);
    setSelectedAreaOrderId("");
    setSelectedCustodianId("");
    setLockedCaptureTaskId(null);
    setLockedCaptureFarmerName(null);
    setFieldErrors({});
    setGpsSource(null);
  };

  const switchTreeOrigin = (nextOrigin: "new_planting" | "existing_inventory") => {
    if (fieldWorkflowMode) {
      setTreeOrigin("existing_inventory");
      setStatus("healthy");
      return;
    }
    if (nextOrigin !== "existing_inventory") {
      setExistingBatchMode(false);
      setPolygonPoints([]);
      setInventoryTreeCount("");
      setUseAssignedArea(false);
      setSelectedAreaOrderId("");
      setPhotos([]);
    }
    setFieldErrors({});
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
    if (fieldWorkflowMode) {
      setExistingBatchMode(true);
      return;
    }
    setExistingBatchMode(checked);
    setReuseRefreshAttempted(false);
    if (checked) {
      setLat(null);
      setLng(null);
      setGpsSource(null);
    }
    setPolygonPoints([]);
    setInventoryTreeCount(checked ? (inventoryTreeCount || "2") : "");
    setUseAssignedArea(false);
    setSelectedAreaOrderId("");
    setPhotos([]);
    setFieldErrors({});
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

  const handleSelectMapDrawTool = (tool: "point" | "line" | "polygon") => {
    if (reliefMode) {
      setReliefDrawTool(tool);
      if (tool !== "polygon") {
        setUseAssignedArea(false);
        setSelectedAreaOrderId("");
      }
      if (tool === "point") {
        setPolygonPoints([]);
        return;
      }
      setLat(null);
      setLng(null);
      setGpsSource(null);
      return;
    }
    if (tool === "point") {
      if (fieldWorkflowMode) return;
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
    if (reliefMode && reliefDrawTool === "point") {
      setLat(null);
      setLng(null);
      setGpsSource(null);
      return;
    }
    if (existingTreeBatchCaptureActive) {
      if (useAssignedArea) {
        setUseAssignedArea(false);
      }
      setPolygonPoints([]);
      return;
    }
    setLat(null);
    setLng(null);
    setGpsSource(null);
  };

  const applyFieldCaptureAssignment = (ownerId: number, ownerName: string, taskId: number) => {
    setSelectedCustodianId(ownerId > 0 ? String(ownerId) : "");
    setLockedCaptureTaskId(taskId);
    setLockedCaptureFarmerName(ownerName);
    setSelectedTreeId(null);
    setIsAdjustingTree(false);
    setTreeDraftLocation(null);
    setFieldViewTab("add_tree");
    setMessage(
      reliefMode
        ? `Task #${taskId} ready for ${ownerName}. Capture the site as a point, line, or polygon, add GPS/photo evidence, and save the first site record.`
        : `Task #${taskId} ready for ${ownerName}. Draw the farm boundary, add GPS/photo evidence, and save the first plot.`,
    );
  };

  const saveTree = async () => {
    const projectId = selectedProjectId || activeProject?.id || null;
    if (!projectId) {
      setMessage("Select a project first.");
      return;
    }
    if (sponsorAssignmentRequiredMessage) {
      setMessage(sponsorAssignmentRequiredMessage);
      return;
    }
    const nextErrors: Record<string, string> = {};
    const speciesValue = species.trim();
    if (!speciesValue) {
      nextErrors.species =
        treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation
          ? "Select one of your assigned species before saving."
          : `${workflowLabels.cropLabel} is required.`;
    }
    if (treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation) {
      const allowedKeys = new Set(speciesOptions.map((item) => normalizeName(item.species)));
      if (!allowedKeys.has(normalizeName(speciesValue))) {
        nextErrors.species = "Choose one of the species assigned to this planting order.";
      }
    }

    const heightValue = treeHeightM.trim() ? Number(treeHeightM) : null;
    const ageValue = treeAgeMonths.trim() ? Number(treeAgeMonths) : null;
    const seasonYearValue = plotSeasonYear.trim() ? Number(plotSeasonYear) : null;
    const estimatedYieldValue = plotEstimatedYieldKg.trim() ? Number(plotEstimatedYieldKg) : null;
    const floorAreaValue = siteFloorAreaSqm.trim() ? Number(siteFloorAreaSqm) : null;
    const roomsCountValue = siteRoomsCount.trim() ? Number(siteRoomsCount) : null;
    const repairCostValue = siteEstimatedRepairCost.trim() ? Number(siteEstimatedRepairCost) : null;
    const populationServedValue = sitePopulationServed.trim() ? Number(sitePopulationServed) : null;
    if (heightValue !== null && !Number.isFinite(heightValue)) {
      nextErrors.treeHeightM = "Tree height must be a valid number in metres.";
    }
    if (treeAgeMonths.trim() && !Number.isFinite(ageValue)) {
      nextErrors.treeAgeMonths = "Estimated age must be a valid number of months.";
    }
    if (plotSeasonYear.trim() && !Number.isFinite(seasonYearValue)) {
      nextErrors.plotSeasonYear = "Season year must be a valid year.";
    }
    if (plotEstimatedYieldKg.trim() && !Number.isFinite(estimatedYieldValue)) {
      nextErrors.plotEstimatedYieldKg = "Estimated yield must be a valid number in kilograms.";
    }
    if (siteFloorAreaSqm.trim() && !Number.isFinite(floorAreaValue)) {
      nextErrors.siteFloorAreaSqm = "Floor area must be a valid number.";
    }
    if (siteRoomsCount.trim() && !Number.isFinite(roomsCountValue)) {
      nextErrors.siteRoomsCount = "Rooms count must be a valid number.";
    }
    if (siteEstimatedRepairCost.trim() && !Number.isFinite(repairCostValue)) {
      nextErrors.siteEstimatedRepairCost = "Estimated repair cost must be a valid number.";
    }
    if (sitePopulationServed.trim() && !Number.isFinite(populationServedValue)) {
      nextErrors.sitePopulationServed = "Population served must be a valid number.";
    }

    const isBatch = reliefMode ? reliefDrawTool !== "point" || treeOrigin === "existing_inventory" : existingTreeBatchCaptureActive;
    let finalLat = lat;
    let finalLng = lng;
    let batchAreaGeojson: Record<string, unknown> | null = null;
    let batchCount = 1;

    if (fieldWorkflowMode) {
      batchCount = 1;
      if (reliefMode && reliefDrawTool === "point") {
        if (finalLat === null || finalLng === null) {
          nextErrors.gps = "Use Current GPS before saving this site.";
        } else if (gpsSource !== "gps") {
          nextErrors.gps = "Use Current GPS before saving this site.";
        } else {
          batchAreaGeojson = {
            type: "Point",
            coordinates: [finalLng, finalLat],
          };
        }
      } else {
        batchAreaGeojson = useAssignedArea
          ? (normalizeMapGeometry(selectedAreaOrder?.area_geojson) || null)
          : reliefMode && reliefDrawTool === "line"
            ? polygonPoints.length >= 2
              ? { type: "LineString", coordinates: polygonPoints }
              : null
            : polygonPoints.length >= 3
              ? polygonGeoJsonFromPoints(polygonPoints)
              : null;
        if (!batchAreaGeojson) {
          nextErrors.areaPolygon =
            reliefMode && reliefDrawTool === "line"
              ? "Capture the site line on the map first."
              : useAssignedArea
                ? "Select a reusable supervisor boundary first."
                : `Draw the ${workflowLabels.entitySingular.toLowerCase()} geometry on the map first.`;
        }
        const centroid = useAssignedArea
          ? polygonCentroid(coordinateSummaryFromGeometry(batchAreaGeojson).points)
          : polygonCentroid(polygonPoints);
        if (!centroid) {
          nextErrors.areaPolygon = `The ${workflowLabels.entitySingular.toLowerCase()} geometry could not be processed. Capture it again on the map.`;
        } else {
          finalLng = centroid.lng;
          finalLat = centroid.lat;
        }
      }
    } else if (isBatch) {
      batchCount = fieldWorkflowMode ? 1 : Math.max(Number(inventoryTreeCount || 0), 2);
      batchAreaGeojson = useAssignedArea
        ? (normalizeMapGeometry(selectedAreaOrder?.area_geojson) || null)
        : polygonPoints.length >= 3
          ? polygonGeoJsonFromPoints(polygonPoints)
          : null;
      if (!batchAreaGeojson) {
        nextErrors.areaPolygon = useAssignedArea ? "Select a reusable supervisor polygon first." : "Draw the existing-tree area polygon on the map first.";
      }
      const centroid = useAssignedArea
        ? polygonCentroid(coordinateSummaryFromGeometry(batchAreaGeojson).points)
        : polygonCentroid(polygonPoints);
      if (!centroid) {
        nextErrors.areaPolygon = "The polygon could not be processed. Redraw it on the map.";
      }
      if (!fieldWorkflowMode && (!Number.isFinite(batchCount) || batchCount < 2)) {
        nextErrors.inventoryTreeCount = "Enter the number of trees inside this mapped area.";
      }
      if (centroid) {
        finalLng = centroid.lng;
        finalLat = centroid.lat;
      }
    } else if (finalLat === null || finalLng === null) {
      nextErrors.gps = `Use Current GPS before saving this ${workflowLabels.entitySingular.toLowerCase()}.`;
    } else if (gpsSource !== "gps") {
      nextErrors.gps = `Use Current GPS before saving this ${workflowLabels.entitySingular.toLowerCase()}.`;
    }

    if (treeOrigin === "existing_inventory" && !plantingDate && ageValue === null) {
      nextErrors.plantingDate = fieldWorkflowMode ? `Add an observation date before saving this ${workflowLabels.entitySingular.toLowerCase()}.` : "Add a reference date or estimated age before saving this existing tree.";
    }
    if (fieldWorkflowMode && !effectiveCustodianId) {
      nextErrors.custodian = `Select the ${workflowLabels.ownerLabel.toLowerCase()} linked to this ${workflowLabels.entitySingular.toLowerCase()}.`;
    }
    if (photos.length === 0) {
      nextErrors.photos = isBatch
        ? fieldWorkflowMode
          ? `Take at least one camera photo before saving this ${workflowLabels.entitySingular.toLowerCase()} boundary.`
          : "Take at least one camera photo before saving this existing-tree area."
        : fieldWorkflowMode
          ? `Take at least one camera photo before saving this ${workflowLabels.entitySingular.toLowerCase()}.`
          : "Take at least one camera photo before adding this tree.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage("Check the highlighted fields below before saving.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setPlantingFlowState("loading");
    setPlantingFlowMessage(
      photos.length > 0
        ? photos.length === 1
          ? "Uploading photo..."
          : `Uploading photos (0/${photos.length})...`
        : isBatch
          ? fieldWorkflowMode
            ? reliefMode && reliefDrawTool === "point"
              ? `Saving ${workflowLabels.entitySingular.toLowerCase()} location...`
              : reliefMode && reliefDrawTool === "line"
                ? `Saving ${workflowLabels.entitySingular.toLowerCase()} line...`
                : `Saving ${workflowLabels.entitySingular.toLowerCase()} boundary...`
            : "Saving existing-tree area..."
        : treeOrigin === "existing_inventory"
            ? fieldWorkflowMode
              ? `Saving ${workflowLabels.entitySingular.toLowerCase()}...`
              : "Saving existing tree..."
            : fieldWorkflowMode
              ? `Adding ${workflowLabels.entitySingular.toLowerCase()}...`
              : "Adding tree...",
    );
    try {
      const recordProfileData: AgricPlotProfile | ReliefSiteProfile | null = agricMode
        ? {
            plot_code: plotCode.trim() || null,
            plot_name: speciesValue || null,
            commodity: speciesValue || null,
            variety: plotVariety.trim() || null,
            season_name: plotSeasonName.trim() || null,
            season_year: Number.isFinite(seasonYearValue) ? seasonYearValue : null,
            land_use: plotLandUse.trim() || null,
            irrigation_type: plotIrrigationType || null,
            production_stage: plotProductionStage || null,
            estimated_yield_kg: Number.isFinite(estimatedYieldValue) ? estimatedYieldValue : null,
            boundary_capture_method: isBatch ? (gpsSource === "gps" ? "polygon_gps_walk" : "polygon_map") : "point",
          }
        : reliefMode
          ? {
              asset_code: siteCode.trim() || null,
              asset_name: speciesValue || null,
              asset_type: siteAssetType || null,
              damage_level: siteDamageLevel || null,
              occupancy_status: siteOccupancyStatus.trim() || null,
              tenure_status: siteTenureStatus.trim() || null,
              response_pathway: siteResponsePathway || null,
              floor_area_sqm: Number.isFinite(floorAreaValue) ? floorAreaValue : null,
              rooms_count: Number.isFinite(roomsCountValue) ? roomsCountValue : null,
              estimated_repair_cost: Number.isFinite(repairCostValue) ? repairCostValue : null,
              population_served: Number.isFinite(populationServedValue) ? populationServedValue : null,
              support_package: siteSupportPackage.trim() || null,
              safety_risks: siteSafetyRisks.trim() || null,
              reported_need: siteReportedNeed.trim() || null,
              relief_boundary_capture_method:
                reliefDrawTool === "point"
                  ? "point"
                  : reliefDrawTool === "line"
                    ? gpsSource === "gps"
                      ? "line_gps_walk"
                      : "line_map"
                    : gpsSource === "gps"
                      ? "polygon_gps_walk"
                      : "polygon_map",
            }
          : null;
      const result = await createTree(
        {
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
          recordProfileData,
        },
        {
          onProgress: (progress) => {
            setPlantingFlowMessage(progress.message);
          },
        },
      );
      setPlantingFlowState("success");
      setPlantingFlowMessage(
        result.message ||
          (isBatch
            ? fieldWorkflowMode
              ? `${workflowLabels.entitySingular} boundary saved.`
              : "Existing-tree area saved."
            : fieldWorkflowMode
              ? `${workflowLabels.entitySingular} saved.`
              : "Tree saved."),
      );
      resetForm();
    } catch (error) {
      setPlantingFlowState("idle");
      setPlantingFlowMessage("");
      setMessage(getErrorMessage(error, `${workflowLabels.entitySingular} capture failed.`));
    } finally {
      setSubmitting(false);
    }
  };

  const showingAddTreeTab = fieldViewTab === "add_tree";
  const mapUsesDraftCapture = showingAddTreeTab && drawingPolylineGeometry;
  const mapFitPoints = useMemo(() => {
    if (selectedTree && !mapUsesDraftCapture) {
      const focusLat = treeDraftLocation?.latitude ?? (selectedTree.lat != null ? Number(selectedTree.lat) : null);
      const focusLng = treeDraftLocation?.longitude ?? (selectedTree.lng != null ? Number(selectedTree.lng) : null);
      if (focusLat != null && focusLng != null) {
        return [[focusLng, focusLat]] as LngLat[];
      }
    }
    if (showingAddTreeTab && polygonPoints.length > 0) return polygonPoints;
    if (showingAddTreeTab && selectedAreaPoints.length > 0) return selectedAreaPoints;
    if (showingAddTreeTab && assignedPlantingAreaPoints.length > 0) return assignedPlantingAreaPoints;
    return activeUserPoints;
  }, [activeUserPoints, assignedPlantingAreaPoints, mapUsesDraftCapture, polygonPoints, selectedAreaPoints, selectedTree, showingAddTreeTab, treeDraftLocation]);
  const mapOverlayTitle =
    !showingAddTreeTab
      ? isAdjustingTree && selectedTree
        ? `Adjust ${workflowLabels.entitySingular} #${selectedTree.project_tree_no || selectedTree.id}`
        : selectedTree
          ? `${workflowLabels.entitySingular} #${selectedTree.project_tree_no || selectedTree.id} selected`
          : workflowLabels.mapTitle
      : existingTreeBatchCaptureActive
      ? useAssignedArea
        ? reliefMode
          ? "Supervisor boundary selected"
          : "Supervisor polygon selected"
        : reliefMode
          ? geometryDrawMode === "point"
            ? "Use Current GPS to pin the site"
            : geometryDrawMode === "line"
              ? "Tap the map to trace the site line"
              : "Tap the map to draw the site boundary"
          : agricMode
            ? "Tap the map to draw the plot boundary"
            : "Tap the map to draw the existing-tree area"
      : isAdjustingTree && selectedTree
        ? `Adjust ${workflowLabels.entitySingular} #${selectedTree.project_tree_no || selectedTree.id}`
        : selectedTree
          ? `${workflowLabels.entitySingular} #${selectedTree.project_tree_no || selectedTree.id} selected`
          : agricMode
            ? "Use Current GPS to place the next plot"
            : "Use Current GPS to place the next tree";
  const mapOverlaySubtitle =
    !showingAddTreeTab
      ? isAdjustingTree
        ? `Drag the selected ${workflowLabels.entitySingular.toLowerCase()} marker to the correct position, then save.`
        : selectedTree
          ? `Open details below, move the ${workflowLabels.entitySingular.toLowerCase()} marker, or delete the ${workflowLabels.entitySingular.toLowerCase()}.`
          : `Tap any ${workflowLabels.entitySingular.toLowerCase()} marker to open its details. Saved photos remain available offline after they are cached on the device.`
      : existingTreeBatchCaptureActive
      ? useAssignedArea
        ? agricMode
          ? "The highlighted supervisor polygon will be saved with this plot record."
          : reliefMode
            ? "The highlighted supervisor boundary will be saved with this site record."
            : "The highlighted supervisor polygon will be saved with this existing-tree batch record."
        : reliefMode
          ? geometryDrawMode === "point"
            ? lat !== null && lng !== null
              ? `Point captured | Lat ${formatCoordinate(lat)} | Lng ${formatCoordinate(lng)}`
              : "Use Current GPS to capture the site point."
            : geometryDrawMode === "line"
              ? polygonPoints.length >= 2
                ? `Line vertices: ${polygonPoints.length}`
                : `Line vertices: ${polygonPoints.length}`
              : polygonPoints.length >= 3
                ? "Boundary polygon captured on map."
                : `Polygon vertices: ${polygonPoints.length}`
          : polygonPoints.length >= 3
            ? "Polygon captured on map."
            : `Polygon vertices: ${polygonPoints.length}`
      : isAdjustingTree
        ? agricMode
          ? "Drag the selected plot point only if the boundary needs a new anchor, then save."
          : `Drag the selected ${workflowLabels.entitySingular.toLowerCase()} marker to the correct position, then save.`
        : selectedTree
          ? agricMode
            ? "Open details below to review the mapped farm, its boundary summary, and recent field activity."
            : `Open details below, move the ${workflowLabels.entitySingular.toLowerCase()} marker, or delete the ${workflowLabels.entitySingular.toLowerCase()}.`
          : lat !== null && lng !== null
            ? `GPS captured | Lat ${formatCoordinate(lat)} | Lng ${formatCoordinate(lng)}`
            : agricMode
              ? "All mapped plots in this project stay visible on the map. Tap any farm boundary to inspect its details."
              : "Your existing trees stay visible on the map. Tap a tree marker to inspect it.";

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <ScreenHero
        title={workflowLabels.actionTitle}
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

      <SectionCard title="Current project" subtitle={undefined}>
        {!projects.length ? (
          <EmptyState title="No assigned project yet" subtitle="This mobile app only saves records inside projects already assigned to the signed-in field user." />
        ) : activeProject ? (
          <View style={styles.projectCard}>
            <View style={styles.projectHeader}>
              <View style={styles.projectText}>
                <Text style={styles.projectName}>{activeProject.name}</Text>
                <Text style={styles.projectMeta}>{activeProject.location_text || "Location text not added yet"}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <MetricTile label={workflowLabels.projectCardMetricLabel} value={myTrees.length} tone="success" helper={`${workflowLabels.entityPlural} you recorded`} />
              <MetricTile label="Waiting to send" value={workWaitingToSend} tone="warning" helper="Will send automatically" />
            </View>
            {showWorkStatus ? <SyncProgressPanel progress={syncProgress} /> : null}
            {showWorkStatus && workStatusMessage ? <Text style={styles.note}>{workStatusMessage}</Text> : null}
            {isCustodianUser && matchedCustodian ? (
              <Text style={styles.note}>
                {workflowLabels.ownerLabel} mode active for {matchedCustodian.name}. {workflowLabels.activityTitle} stay disabled; use this map to record {workflowLabels.entityPlural.toLowerCase()}.
              </Text>
            ) : null}
          </View>
        ) : null}
      </SectionCard>

      {activeCustodian || activeCustodianAllocations.length ? (
        <SectionCard title={fieldWorkflowMode ? `${workflowLabels.ownerLabel} support branch` : "Community / custodian branch"} subtitle={agricMode ? "This follows the Agric support workflow: farmers are linked to mapped plots, field capture starts in Map & Add Plot, and field visits continue from assigned tasks." : reliefMode ? "This follows the Relief workflow: beneficiaries are linked to mapped sites, site capture starts in Map & Assess Sites, and relief visits continue from assigned tasks." : "This follows the Green community workflow: custodians plant against allocations while maintenance stays disabled."}>
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
                  label={fieldWorkflowMode ? workflowLabels.activityTitle : "Supervision live"}
                  value={activeCustodianAllocations.reduce((sum, row) => sum + Number(row.supervision_live || 0), 0)}
                  helper={fieldWorkflowMode ? `Open ${workflowLabels.activityTitle.toLowerCase()}` : "Open supervision visits"}
                />
              </View>
              <View style={styles.metricRow}>
                <MetricTile
                  label={fieldWorkflowMode ? "Support units" : "Target seedlings"}
                  value={activeCustodianAllocations.reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0)}
                  helper={fieldWorkflowMode ? "Allocated units" : "Allocated quantity"}
                />
                <MetricTile
                  label="Remaining"
                  value={
                    Math.max(
                      activeCustodianAllocations.reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0) -
                        approvedPlantingTrees.filter((tree) => Number(tree.custodian_id || 0) === Number(activeCustodian?.id || 0)).length,
                      0,
                    )
                  }
                  helper={fieldWorkflowMode ? "Units still to record" : "Still to record"}
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
                  ? `This login is matched to a ${workflowLabels.ownerLabel.toLowerCase()} record. Use ${workflowLabels.entityPlural.toLowerCase()} capture only. ${workflowLabels.activityTitle} remain unavailable.`
                  : fieldWorkflowMode
                    ? reliefMode
                      ? "If you link a site to a beneficiary, it will follow the same support and allocation trail used in Work."
                      : "If you link a plot to a farmer, it will follow the same support and allocation trail used in Work."
                    : "If you link an existing-tree or planting record to a custodian, it will follow the same community allocation trail used in Green web."}
              </Text>
            </View>
          ) : (
            <Text style={styles.note}>No {workflowLabels.ownerLabel.toLowerCase()} is selected yet. {workflowLabels.entitySingular} records can still be linked from the form below.</Text>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title={workflowLabels.actionTitle} subtitle={undefined}>
        <View style={styles.summaryChipRow}>
          <StatusChip label={`Submitted: ${plantingReviewCounts.submitted}`} tone="warning" />
          <StatusChip label={`Approved: ${plantingReviewCounts.approved}`} tone="online" />
          <StatusChip label={`Remaining: ${pendingPlanting}`} tone={pendingPlanting > 0 ? "warning" : "online"} />
        </View>

        <View style={styles.fieldTabRow}>
          <Pressable
            onPress={() => setFieldViewTab("map")}
            style={[styles.fieldTabButton, fieldViewTab === "map" && styles.fieldTabButtonActive]}
          >
            <Text style={[styles.fieldTabButtonText, fieldViewTab === "map" && styles.fieldTabButtonTextActive]}>Map</Text>
          </Pressable>
          <Pressable
            onPress={() => setFieldViewTab("add_tree")}
            style={[styles.fieldTabButton, fieldViewTab === "add_tree" && styles.fieldTabButtonActive]}
          >
            <Text style={[styles.fieldTabButtonText, fieldViewTab === "add_tree" && styles.fieldTabButtonTextActive]}>{workflowLabels.addActionLabel}</Text>
          </Pressable>
        </View>

        {showingAddTreeTab && assignedPlantingAreas.length > 0 ? (
          <View style={styles.assignedAreaBanner}>
            <Text style={styles.assignedAreaTitle}>{fieldWorkflowMode ? `Assigned ${workflowLabels.entitySingular.toLowerCase()} boundary enabled` : "Assigned planting area enabled"}</Text>
            <Text style={styles.assignedAreaText}>
              {assignedPlantingAreas.length} {fieldWorkflowMode
                ? assignedPlantingAreas.length === 1
                  ? workflowLabels.entitySingular.toLowerCase()
                  : workflowLabels.entityPlural.toLowerCase()
                : assignedPlantingAreas.length === 1
                  ? "plot"
                  : "plots"} visible on map for this user.
            </Text>
          </View>
        ) : null}

        {publicSponsorshipProject ? (
          <View style={styles.sponsorQrBanner}>
            <Text style={styles.sponsorQrBannerTitle}>Sponsor QR Tags</Text>
            <Text style={styles.sponsorQrBannerText}>
              Download one printable QR sheet for all sponsor-funded trees assigned to you. Each A4 sheet is grouped
              into small tag cards so you can print once, cut them, attach them after planting, and submit the trees
              for supervisor review.
            </Text>
            {sponsorQrUnitsLoading ? (
              <Text style={styles.sponsorQrBannerMeta}>Loading reserved sponsor tags...</Text>
            ) : sponsorQrUnitsError ? (
              <View>
                <Text style={[styles.sponsorQrBannerMeta, styles.sponsorQrBannerMetaError]}>{sponsorQrUnitsError}</Text>
                <PrimaryButton label="Retry" onPress={loadSponsorQrUnits} variant="secondary" />
              </View>
            ) : sponsorQrUnits.length === 0 ? (
              <View>
                <Text style={[styles.sponsorQrBannerMeta, styles.sponsorQrBannerMetaError]}>No sponsor QR tags are currently reserved for you yet. Your supervisor must assign sponsor trees before you can plant or submit for review.</Text>
                <PrimaryButton label="Refresh" onPress={loadSponsorQrUnits} variant="secondary" />
              </View>
            ) : (
              <View style={styles.sponsorQrList}>
                <Text style={styles.sponsorQrBannerMeta}>
                  {sponsorQrUnits.length} sponsor QR tag{sponsorQrUnits.length === 1 ? "" : "s"} ready — the download below
                  will group them into A4 sheets before fieldwork.
                </Text>
                <PrimaryButton
                  label={`Download QR Sheet${sponsorQrUnits.length === 1 ? "" : ` (${sponsorQrUnits.length} tags)`}`}
                  onPress={() => {
                    if (!activeProject || !session?.user?.id) return;
                    const baseUrl = buildSponsorAgentQrSheetUrl(
                      Number(activeProject.id),
                      Number(session.user.id || 0),
                      session.user.organization_id ?? null,
                    );
                    Linking.openURL(baseUrl).catch(() => {
                      Alert.alert("Error", "Failed to open sponsor QR sheet PDF. Check your internet connection and try again.");
                    });
                  }}
                  variant="secondary"
                />
                {sponsorQrUnits.map((unit) => (
                  <View key={`sponsor-qr-${unit.unit_id}`} style={styles.sponsorQrCard}>
                    <View style={styles.sponsorQrCardHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sponsorQrCardTitle}>{unit.sponsor_name || unit.sponsor_organization_name || "Sponsor tree"}</Text>
                        <Text style={styles.sponsorQrCardMeta}>
                          {unit.unit_uid || `Unit #${unit.unit_id}`}
                          {unit.species ? ` | ${unit.species}` : ""}
                        </Text>
                      </View>
                      <StatusChip
                        label={Number(unit.qr_download_count || 0) > 0 ? `Downloaded ${Number(unit.qr_download_count || 0)}x` : "Not downloaded"}
                        tone={Number(unit.qr_download_count || 0) > 0 ? "online" : "warning"}
                      />
                    </View>
                    {unit.dedication_type || unit.dedication_name ? (
                      <Text style={styles.sponsorQrCardDedication}>
                        {`Dedication: ${toTitle(unit.dedication_type || "self")}`}
                        {unit.dedication_name ? ` | ${unit.dedication_name}` : ""}
                      </Text>
                    ) : null}
                    {unit.last_qr_downloaded_at ? (
                      <Text style={styles.sponsorQrCardMeta}>
                        Last download: {formatDate(unit.last_qr_downloaded_at)}
                        {unit.last_qr_downloaded_by ? ` | ${unit.last_qr_downloaded_by}` : ""}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <PrimaryButton label="Refresh QR Tags" onPress={loadSponsorQrUnits} variant="secondary" />
              </View>
            )}
          </View>
        ) : null}

        {pendingFieldCaptureTasks.length > 0 ? (
          <View style={styles.fieldCaptureBanner}>
            <Text style={styles.fieldCaptureBannerTitle}>{reliefMode ? "Assigned first site capture" : "Assigned first field capture"}</Text>
            <Text style={styles.fieldCaptureBannerText}>
              {reliefMode ? "These beneficiary assignments open here instead of Relief Visits. Select one, map the site boundary, and save the first site record." : "These farmer assignments open here. Select one, draw the farm boundary, add GPS and photo evidence, then save."}
            </Text>
            <View style={styles.fieldCaptureChipRow}>
              {pendingFieldCaptureTasks.map((item) => (
                <Pressable
                  key={`field-capture-${item.task.id}`}
                  onPress={() => applyFieldCaptureAssignment(item.ownerId, item.ownerName, item.task.id)}
                  style={[
                    styles.fieldCaptureChip,
                    lockedCaptureTaskId === item.task.id && styles.fieldCaptureChipActive,
                  ]}
                >
                  <Text style={styles.fieldCaptureChipLabel}>{item.ownerName}</Text>
                  <Text style={styles.fieldCaptureChipMeta}>
                    {`Task #${item.task.id}`}{item.dueDate ? ` | Due ${formatDate(item.dueDate)}` : " | Capture pending"}
                    {lockedCaptureTaskId === item.task.id ? " | Selected" : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.mapSheetWrap}>
          <GreenTreeCaptureMap
            trees={mapTrees}
            captureLocation={showingAddTreeTab && !mapUsesDraftCapture && lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null}
            selectedTreeId={selectedTreeId}
            onSelectTree={handleSelectTree}
            draggableTreeId={isAdjustingTree ? selectedTreeId : null}
            onDragTree={(treeId, coordinate) => {
              if (treeId !== selectedTreeId) return;
              setTreeDraftLocation(coordinate);
            }}
            onBackgroundPress={() => handleSelectTree(null)}
            onAddPolygonPoint={(coordinate) => setPolygonPoints((prev) => [...prev, [coordinate.longitude, coordinate.latitude]])}
            interactive={mapUsesDraftCapture ? !(existingTreeBatchCaptureActive && useAssignedArea) : true}
            mode={mapUsesDraftCapture ? geometryDrawMode : "point"}
            drawTool={geometryDrawMode}
            focusTreeId={selectedTreeId}
            showDrawControls={showingAddTreeTab && (fieldWorkflowMode || existingTreeBatchCaptureActive) && (!useAssignedArea || reliefMode)}
            onSelectDrawTool={showingAddTreeTab ? handleSelectMapDrawTool : undefined}
            onClearDraft={showingAddTreeTab ? handleClearMapDraft : undefined}
            pointToolDisabled={agricMode && showingAddTreeTab}
            lineToolDisabled={!reliefMode || (showingAddTreeTab && useAssignedArea)}
            polygonToolDisabled={showingAddTreeTab && useAssignedArea && !reliefMode}
            polygonPoints={mapUsesDraftCapture && !useAssignedArea ? polygonPoints : []}
            overlayAreas={[
              ...overlayAreas,
              ...(useAssignedArea && selectedAreaOrder?.area_geojson
                ? [{
                    id: `selected-order-${selectedAreaOrder.id}`,
                    geometry: normalizeMapGeometry(selectedAreaOrder.area_geojson),
                    strokeColor: fieldWorkflowMode ? "rgba(127,29,29,0.98)" : "rgba(35,146,82,0.92)",
                    fillColor: fieldWorkflowMode ? "rgba(185,28,28,0.10)" : "rgba(35,146,82,0.10)",
                  }]
                : []),
            ]}
            mapHeight={isAdjustingTree ? 430 : 320}
            overlayTitle={mapOverlayTitle}
            overlaySubtitle={mapOverlaySubtitle}
            fitPoints={mapFitPoints}
            workflowMode={agricMode ? "agric" : reliefMode ? "relief_recovery" : "green"}
          />

          {selectedTree && isAdjustingTree ? (
            <View style={styles.treeAdjustBar}>
              <View style={styles.treeAdjustHandle} />
              <Text style={styles.treeAdjustTitle}>Adjust {workflowLabels.entitySingular} #{selectedTree.project_tree_no || selectedTree.id}</Text>
              <Text style={styles.treeAdjustText}>
                {fieldWorkflowMode ? `Drag the ${workflowLabels.entitySingular.toLowerCase()} anchor on the map, then save the new position.` : "Drag the marker on the map, then save the new position."}
              </Text>
              <View style={styles.treeAdjustActions}>
                <PrimaryButton
                  label={treeActionBusy === "move" ? "Saving..." : "Save Position"}
                  onPress={() => void saveAdjustedTreePosition()}
                  disabled={treeActionBusy !== null}
                />
                <PrimaryButton label="Cancel" onPress={cancelAdjustTree} disabled={treeActionBusy !== null} variant="secondary" />
              </View>
            </View>
          ) : null}
        </View>

        {showingAddTreeTab && drawingPolylineGeometry && !useAssignedArea ? (
          <View style={styles.metricRow}>
            <PrimaryButton label={geometryDrawMode === "line" ? "Add GPS Vertex" : "Add GPS Vertex"} onPress={() => void useGps()} variant="secondary" />
            <PrimaryButton label={reliefMode && geometryDrawMode === "line" ? "Clear line" : fieldWorkflowMode ? "Clear boundary" : "Clear polygon"} onPress={() => setPolygonPoints([])} variant="secondary" />
          </View>
        ) : null}

        {showingAddTreeTab ? (
        <View style={styles.formSection}>
        {!existingTreeBatchCaptureActive ? (
          <>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>GPS<Text style={styles.requiredAsterisk}> *</Text></Text>
                <PrimaryButton label="Use Current GPS" onPress={() => void useGps()} variant="secondary" />
                <FieldError message={fieldErrors.gps} />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>LNG</Text>
                <TextInput
                  style={[styles.input, fieldErrors.gps && styles.inputError]}
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
                  style={[styles.input, fieldErrors.gps && styles.inputError]}
                  placeholder="Latitude"
                  placeholderTextColor={colors.textMuted}
                  value={lat === null ? "" : String(lat)}
                  onChangeText={(value) => setLat(value.trim() ? Number(value) : null)}
                  keyboardType="decimal-pad"
                  editable={false}
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>{workflowLabels.cropLabel.toUpperCase()}<Text style={styles.requiredAsterisk}> *</Text></Text>
                {treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation ? (
                  <Pressable onPress={() => setSpeciesPickerOpen(true)} style={[styles.selectField, fieldErrors.species && styles.inputError]}>
                    <Text style={[styles.selectValue, !species && styles.selectPlaceholder]}>
                      {species || "Select assigned species"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                  </Pressable>
                ) : (
                  <TextInput
                    style={[styles.input, fieldErrors.species && styles.inputError]}
                    placeholder={workflowLabels.cropLabel}
                    placeholderTextColor={colors.textMuted}
                    value={species}
                    onChangeText={(value) => {
                      setSpecies(value);
                      clearFieldError("species");
                    }}
                  />
                )}
                <FieldError message={fieldErrors.species} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{workflowLabels.cropLabel.toUpperCase()}<Text style={styles.requiredAsterisk}> *</Text></Text>
            {treeOrigin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation ? (
              <Pressable onPress={() => setSpeciesPickerOpen(true)} style={[styles.selectField, fieldErrors.species && styles.inputError]}>
                <Text style={[styles.selectValue, !species && styles.selectPlaceholder]}>
                  {species || "Select assigned species"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
              </Pressable>
            ) : (
              <TextInput
                style={[styles.input, fieldErrors.species && styles.inputError]}
                placeholder={workflowLabels.cropLabel}
                placeholderTextColor={colors.textMuted}
                value={species}
                onChangeText={(value) => {
                  setSpecies(value);
                  clearFieldError("species");
                }}
              />
            )}
            <FieldError message={fieldErrors.species} />
          </>
        )}
        {!fieldWorkflowMode ? (
          <>
            <Text style={styles.fieldLabel}>Tree Entry Type</Text>
            <Pressable onPress={() => setTreeOriginPickerOpen(true)} style={styles.selectField}>
              <Text style={styles.selectValue}>{treeOrigin === "existing_inventory" ? "Existing Tree" : "New Planting"}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
            </Pressable>
          </>
        ) : null}
        <Text style={styles.fieldLabel}>{fieldWorkflowMode ? "Observation date" : treeOrigin === "existing_inventory" ? "Reference date" : "Planting date"}<Text style={styles.requiredAsterisk}> *</Text></Text>
        <View style={fieldErrors.plantingDate ? styles.fieldBlockError : undefined}>
          <DateField
            value={plantingDate}
            onChange={(value) => {
              setPlantingDate(value);
              clearFieldError("plantingDate");
            }}
            placeholder={fieldWorkflowMode ? "Select observation date" : treeOrigin === "existing_inventory" ? "Select reference date" : "Select planting date"}
          />
        </View>
        <FieldError message={fieldErrors.plantingDate} />
        {treeOrigin === "existing_inventory" ? (
          <Text style={styles.helpText}>
            {fieldWorkflowMode
              ? `Saved as the ${workflowLabels.entitySingular.toLowerCase()} observation date and shown to supervisors in Work review.`
              : "Saved as the tree planting date/reference date and shown to supervisors in Work review."}
          </Text>
        ) : null}
        {agricMode ? (
          <>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Plot Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Optional internal code"
                  placeholderTextColor={colors.textMuted}
                  value={plotCode}
                  onChangeText={setPlotCode}
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Variety</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Optional crop variety"
                  placeholderTextColor={colors.textMuted}
                  value={plotVariety}
                  onChangeText={setPlotVariety}
                />
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Season Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Wet season"
                  placeholderTextColor={colors.textMuted}
                  value={plotSeasonName}
                  onChangeText={setPlotSeasonName}
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Season Year</Text>
                <TextInput
                  style={[styles.input, fieldErrors.plotSeasonYear && styles.inputError]}
                  placeholder="2026"
                  placeholderTextColor={colors.textMuted}
                  value={plotSeasonYear}
                  onChangeText={(value) => {
                    setPlotSeasonYear(value);
                    clearFieldError("plotSeasonYear");
                  }}
                  keyboardType="number-pad"
                />
                <FieldError message={fieldErrors.plotSeasonYear} />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Land Use</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Maize field, cassava block"
              placeholderTextColor={colors.textMuted}
              value={plotLandUse}
              onChangeText={setPlotLandUse}
            />
          </>
        ) : reliefMode ? (
          <>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Site Code</Text>
                <TextInput style={styles.input} placeholder="Optional internal code" placeholderTextColor={colors.textMuted} value={siteCode} onChangeText={setSiteCode} />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Asset Type</Text>
                <Pressable onPress={() => setSiteAssetTypePickerOpen(true)} style={styles.selectField}>
                  <Text style={[styles.selectValue, !siteAssetType && styles.selectPlaceholder]}>
                    {RELIEF_ASSET_TYPE_OPTIONS.find((option) => option.value === siteAssetType)?.label || "Select asset type"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                </Pressable>
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Damage Level</Text>
                <Pressable onPress={() => setSiteDamageLevelPickerOpen(true)} style={styles.selectField}>
                  <Text style={[styles.selectValue, !siteDamageLevel && styles.selectPlaceholder]}>
                    {RELIEF_DAMAGE_LEVEL_OPTIONS.find((option) => option.value === siteDamageLevel)?.label || "Select damage level"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                </Pressable>
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Response Path</Text>
                <Pressable onPress={() => setSiteResponsePathwayPickerOpen(true)} style={styles.selectField}>
                  <Text style={[styles.selectValue, !siteResponsePathway && styles.selectPlaceholder]}>
                    {RELIEF_RESPONSE_PATHWAY_OPTIONS.find((option) => option.value === siteResponsePathway)?.label || "Select response path"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                </Pressable>
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Occupancy Status</Text>
                <TextInput style={styles.input} placeholder="e.g. Occupied, hosted" placeholderTextColor={colors.textMuted} value={siteOccupancyStatus} onChangeText={setSiteOccupancyStatus} />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Tenure Status</Text>
                <TextInput style={styles.input} placeholder="e.g. Owner, tenant" placeholderTextColor={colors.textMuted} value={siteTenureStatus} onChangeText={setSiteTenureStatus} />
              </View>
            </View>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" && !reliefMode ? (
          <>
            <Text style={styles.fieldLabel}>{agricMode ? "Estimated age (months, optional legacy field)" : reliefMode ? "Rooms Count / legacy numeric field not used" : "Estimated age (months)"}</Text>
            <TextInput
              style={[styles.input, fieldErrors.treeAgeMonths && styles.inputError]}
              placeholder={reliefMode ? "Leave blank for relief site capture" : "Optional if exact planting date is unknown"}
              placeholderTextColor={colors.textMuted}
              value={treeAgeMonths}
              onChangeText={(value) => {
                setTreeAgeMonths(value);
                clearFieldError("treeAgeMonths");
                clearFieldError("plantingDate");
              }}
              keyboardType="number-pad"
            />
            <FieldError message={fieldErrors.treeAgeMonths} />
            <Text style={styles.helpText}>
              {agricMode
                ? "Optional. Keep blank unless this plot is used for agroforestry tree inventory too."
                : reliefMode
                  ? "Leave tree-age blank in Relief mode. Use the site fields below for site size, damage, and recovery details."
                : "Optional. Used for CO2 estimation when planting date is not available for an existing tree."}
            </Text>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" ? (
          fieldWorkflowMode ? (
            <Text style={styles.helpText}>
              {reliefMode
                ? geometryDrawMode === "point"
                  ? "This asset is captured as a mapped point. Use Current GPS to pin the site location."
                  : geometryDrawMode === "line"
                    ? "This asset is captured as a mapped line. Tap the map or add GPS vertices to trace the full asset path."
                    : "This asset is captured as a mapped boundary. Draw the boundary on the map or walk it with GPS points until the polygon is closed."
                : "Plot boundary capture is required for farm registration. Draw the boundary on the map or walk it with GPS points until the polygon is closed."}
            </Text>
          ) : (
            <>
              <Pressable onPress={() => toggleExistingBatchMode(!existingBatchMode)} style={styles.checkRow}>
                <Ionicons name={existingBatchMode ? "checkbox" : "square-outline"} size={20} color={colors.primaryDark} />
                <Text style={styles.checkText}>Capture multiple existing trees in one mapped area (polygon)</Text>
              </Pressable>
              <Text style={styles.helpText}>
                Use this when recording an existing-tree inventory area. Draw the polygon on the map and enter the number of trees.
              </Text>
            </>
          )
        ) : null}
        {treeOrigin === "existing_inventory" && existingBatchMode && reusableAreaOrders.length > 0 && geometryDrawMode === "polygon" ? (
          <>
            <Pressable onPress={() => toggleUseAssignedArea(!useAssignedArea)} style={styles.checkRow}>
              <Ionicons name={useAssignedArea ? "checkbox" : "square-outline"} size={20} color={colors.primaryDark} />
              <Text style={styles.checkText}>{fieldWorkflowMode ? `Use supervisor-assigned ${workflowLabels.entitySingular.toLowerCase()} boundary instead of drawing a new one` : "Use supervisor-assigned polygon instead of drawing a new one"}</Text>
            </Pressable>
            <Text style={styles.helpText}>
              {fieldWorkflowMode
                ? `Supervisors enabled reuse on ${reusableAreaOrders.length} mapped support area${reusableAreaOrders.length === 1 ? "" : "s"}.`
                : `Supervisors enabled reuse on ${reusableAreaOrders.length} assigned planting area${reusableAreaOrders.length === 1 ? "" : "s"}.`}
            </Text>
          </>
        ) : null}
        {treeOrigin === "existing_inventory" && existingBatchMode && useAssignedArea && reusableAreaOrders.length > 1 && geometryDrawMode === "polygon" ? (
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
            {!fieldWorkflowMode ? (
              <>
                <Text style={styles.fieldLabel}>Number of trees in area<Text style={styles.requiredAsterisk}> *</Text></Text>
                <TextInput
                  style={[styles.input, fieldErrors.inventoryTreeCount && styles.inputError]}
                  placeholder="e.g. 24"
                  placeholderTextColor={colors.textMuted}
                  value={inventoryTreeCount}
                  onChangeText={(value) => {
                    setInventoryTreeCount(value);
                    clearFieldError("inventoryTreeCount");
                  }}
                  keyboardType="number-pad"
                />
                <FieldError message={fieldErrors.inventoryTreeCount} />
              </>
            ) : null}
            <Text style={styles.fieldLabel}>
              {fieldWorkflowMode
                ? reliefMode
                  ? geometryDrawMode === "point"
                    ? `${workflowLabels.entitySingular} Location`
                    : geometryDrawMode === "line"
                      ? `${workflowLabels.entitySingular} Line`
                      : `${workflowLabels.entitySingular} Boundary`
                  : `${workflowLabels.entitySingular} Boundary`
                : "Area Polygon"}
              <Text style={styles.requiredAsterisk}> *</Text>
            </Text>
            <TextInput
              style={[styles.input, fieldErrors.areaPolygon && styles.inputError]}
              editable={false}
              value={
                useAssignedArea
                  ? selectedAreaOrder
                    ? `Using supervisor polygon: ${selectedAreaOrder.area_label?.trim() || `Assigned area #${selectedAreaOrder.id}`}`
                    : "No reusable supervisor polygon selected"
                  : reliefMode && geometryDrawMode === "point"
                    ? lat !== null && lng !== null
                      ? `Point captured at ${formatCoordinate(lat)}, ${formatCoordinate(lng)}`
                      : "No site point captured yet"
                    : reliefMode && geometryDrawMode === "line"
                      ? polygonPoints.length >= 2
                        ? "Line captured on map"
                        : "No site line drawn yet"
                      : polygonPoints.length >= 3
                        ? "Polygon captured on map"
                        : "No polygon drawn yet"
              }
            />
            <FieldError message={fieldErrors.areaPolygon} />
            {draftAreaSquareMeters > 0 ? (
              <Text style={styles.helpText}>
                Approx. area: {(draftAreaSquareMeters / 10000).toFixed(4)} ha ({Math.round(draftAreaSquareMeters)} m2)
              </Text>
            ) : null}
            <Text style={styles.helpText}>
              {useAssignedArea
                ? fieldWorkflowMode
                  ? `The selected supervisor polygon will be stored for this ${workflowLabels.entitySingular.toLowerCase()}.`
                  : "The selected supervisor polygon will be stored for this existing-tree batch record."
                : fieldWorkflowMode
                  ? reliefMode
                    ? geometryDrawMode === "point"
                      ? `Use Current GPS to save one point for this ${workflowLabels.entitySingular.toLowerCase()}.`
                      : geometryDrawMode === "line"
                        ? `Tap the map or add GPS vertices to trace one line for this ${workflowLabels.entitySingular.toLowerCase()}.`
                        : `Tap the map or add GPS points to draw one polygon for this ${workflowLabels.entitySingular.toLowerCase()}.`
                    : `Tap the map or add GPS points to draw one polygon for this ${workflowLabels.entitySingular.toLowerCase()}.`
                  : "Tap the map to draw one polygon for this existing-tree batch record."}
            </Text>
          </>
        ) : null}
          {agricMode ? (
            <>
              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Irrigation Type</Text>
                  <Pressable onPress={() => setPlotIrrigationPickerOpen(true)} style={styles.selectField}>
                    <Text style={[styles.selectValue, !plotIrrigationType && styles.selectPlaceholder]}>
                      {AGRIC_IRRIGATION_OPTIONS.find((option) => option.value === plotIrrigationType)?.label || "Select irrigation"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                  </Pressable>
                </View>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Production Stage</Text>
                  <Pressable onPress={() => setPlotProductionStagePickerOpen(true)} style={styles.selectField}>
                    <Text style={[styles.selectValue, !plotProductionStage && styles.selectPlaceholder]}>
                      {AGRIC_PRODUCTION_STAGE_OPTIONS.find((option) => option.value === plotProductionStage)?.label || "Select stage"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Estimated Yield (kg)</Text>
                  <TextInput
                    style={[styles.input, fieldErrors.plotEstimatedYieldKg && styles.inputError]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    value={plotEstimatedYieldKg}
                    onChangeText={(value) => {
                      setPlotEstimatedYieldKg(value);
                      clearFieldError("plotEstimatedYieldKg");
                    }}
                    keyboardType="decimal-pad"
                  />
                  <FieldError message={fieldErrors.plotEstimatedYieldKg} />
                </View>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <Pressable onPress={() => setStatusPickerOpen(true)} style={styles.selectField}>
                    <Text style={styles.selectValue}>{treeStatusOptions.find((option) => option.value === status)?.label || "Select status"}</Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                  </Pressable>
                </View>
              </View>
            </>
          ) : reliefMode ? (
            <>
              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Floor Area (sqm)</Text>
                  <TextInput
                    style={[styles.input, fieldErrors.siteFloorAreaSqm && styles.inputError]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    value={siteFloorAreaSqm}
                    onChangeText={(value) => {
                      setSiteFloorAreaSqm(value);
                      clearFieldError("siteFloorAreaSqm");
                    }}
                    keyboardType="decimal-pad"
                  />
                  <FieldError message={fieldErrors.siteFloorAreaSqm} />
                </View>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Rooms Count</Text>
                  <TextInput
                    style={[styles.input, fieldErrors.siteRoomsCount && styles.inputError]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    value={siteRoomsCount}
                    onChangeText={(value) => {
                      setSiteRoomsCount(value);
                      clearFieldError("siteRoomsCount");
                    }}
                    keyboardType="number-pad"
                  />
                  <FieldError message={fieldErrors.siteRoomsCount} />
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Estimated Repair Cost</Text>
                  <TextInput
                    style={[styles.input, fieldErrors.siteEstimatedRepairCost && styles.inputError]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    value={siteEstimatedRepairCost}
                    onChangeText={(value) => {
                      setSiteEstimatedRepairCost(value);
                      clearFieldError("siteEstimatedRepairCost");
                    }}
                    keyboardType="decimal-pad"
                  />
                  <FieldError message={fieldErrors.siteEstimatedRepairCost} />
                </View>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Population Served</Text>
                  <TextInput
                    style={[styles.input, fieldErrors.sitePopulationServed && styles.inputError]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    value={sitePopulationServed}
                    onChangeText={(value) => {
                      setSitePopulationServed(value);
                      clearFieldError("sitePopulationServed");
                    }}
                    keyboardType="number-pad"
                  />
                  <FieldError message={fieldErrors.sitePopulationServed} />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Support Package</Text>
              <TextInput style={styles.input} placeholder="e.g. Shelter kit, roofing sheets" placeholderTextColor={colors.textMuted} value={siteSupportPackage} onChangeText={setSiteSupportPackage} />
              <Text style={styles.fieldLabel}>Safety Risks</Text>
              <TextInput style={[styles.input, styles.textArea]} placeholder="Collapse risk, flood risk, access issues" placeholderTextColor={colors.textMuted} multiline value={siteSafetyRisks} onChangeText={setSiteSafetyRisks} />
              <Text style={styles.fieldLabel}>Reported Need</Text>
              <TextInput style={[styles.input, styles.textArea]} placeholder="Repair, rebuild, latrine, water point, roofing" placeholderTextColor={colors.textMuted} multiline value={siteReportedNeed} onChangeText={setSiteReportedNeed} />
              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <Pressable onPress={() => setStatusPickerOpen(true)} style={styles.selectField}>
                    <Text style={styles.selectValue}>{treeStatusOptions.find((option) => option.value === status)?.label || "Select status"}</Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Tree Height (m)</Text>
                <TextInput
                  style={[styles.input, fieldErrors.treeHeightM && styles.inputError]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  value={treeHeightM}
                  onChangeText={(value) => {
                    setTreeHeightM(value);
                    clearFieldError("treeHeightM");
                  }}
                  keyboardType="decimal-pad"
                />
                <FieldError message={fieldErrors.treeHeightM} />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Status</Text>
                <Pressable onPress={() => setStatusPickerOpen(true)} style={styles.selectField}>
                  <Text style={styles.selectValue}>{treeStatusOptions.find((option) => option.value === status)?.label || "Select status"}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
                </Pressable>
              </View>
            </View>
          )}

        {treeOrigin === "existing_inventory" && !isCustodianUser ? (
          <>
            <Text style={styles.fieldLabel}>{workflowLabels.ownerLabel}{fieldWorkflowMode ? <Text style={styles.requiredAsterisk}> *</Text> : null}</Text>
            {lockedCaptureFarmerName ? (
              <View style={[styles.selectField, { opacity: 0.85 }]}>
                <Text style={styles.selectValue}>{lockedCaptureFarmerName}</Text>
                <Ionicons name="lock-closed" size={14} color={colors.textSoft} />
              </View>
            ) : (
              <Pressable onPress={() => setCustodianPickerOpen(true)} style={[styles.selectField, fieldErrors.custodian && styles.inputError]}>
                <Text style={styles.selectValue}>{effectiveCustodianId ? custodians.find((custodian) => custodian.id === effectiveCustodianId)?.name || `Selected ${workflowLabels.ownerLabel.toLowerCase()}` : `No ${workflowLabels.ownerLabel.toLowerCase()}`}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
              </Pressable>
            )}
            <FieldError message={fieldErrors.custodian} />
          </>
        ) : null}
        <Text style={styles.fieldLabel}>Added By</Text>
        <View style={styles.selectField}>
          <Text style={styles.selectValue}>{session?.user.full_name || "Current user"}</Text>
        </View>

        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder={fieldWorkflowMode ? `${workflowLabels.entitySingular} notes, support needs, or field observations` : "Field notes"} placeholderTextColor={colors.textMuted} multiline value={notes} onChangeText={setNotes} />
        <Text style={styles.fieldLabel}>{existingTreeBatchCaptureActive ? `${workflowLabels.entitySingular} Photos (Multiple)` : `${workflowLabels.entitySingular} Photo`}<Text style={styles.requiredAsterisk}> *</Text></Text>
        <View style={styles.metricRow}>
          <PrimaryButton label="Camera" onPress={() => void capturePhoto()} variant="secondary" />
        </View>
        <Text style={styles.helpText}>
          {existingTreeBatchCaptureActive
            ? fieldWorkflowMode
              ? `Take one or more photos with the camera for this ${workflowLabels.entitySingular.toLowerCase()} boundary record. At least one photo is required.`
              : "Take one or more photos with the camera for this existing-tree area record. At least one photo is required."
            : fieldWorkflowMode
              ? `Take one ${workflowLabels.entitySingular.toLowerCase()} photo with the camera before saving this ${workflowLabels.entitySingular.toLowerCase()}.`
              : "Take one tree photo with the camera before adding this tree."}
        </Text>
        <FieldError message={fieldErrors.photos} />
        {photos.length ? (
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <Pressable key={photo.uri} onPress={() => setPhotos((prev) => prev.filter((item) => item.uri !== photo.uri))} style={styles.photoWrap}>
                <ExpoImage source={{ uri: photo.uri }} contentFit="cover" style={styles.photo} />
                <View style={styles.photoTag}><Text style={styles.photoTagText}>Remove</Text></View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {message && message !== sponsorAssignmentRequiredMessage ? <Text style={styles.note}>{message}</Text> : null}
        {sponsorAssignmentWarningMessage ? <Text style={styles.note}>{sponsorAssignmentWarningMessage}</Text> : null}
        {sponsorAssignmentRequiredMessage ? <Text style={styles.fieldError}>{sponsorAssignmentRequiredMessage}</Text> : null}
        <PrimaryButton
          label={
            submitting
              ? "Saving..."
              : fieldWorkflowMode
                ? existingTreeBatchCaptureActive
                  ? `Save ${workflowLabels.entitySingular} Boundary`
                  : `Save ${workflowLabels.entitySingular}`
                : treeOrigin === "existing_inventory"
                  ? "Save Existing Tree"
                  : "Add Tree"
          }
          onPress={() => void saveTree()}
          disabled={submitting || loading || syncing || !projects.length || Boolean(sponsorAssignmentRequiredMessage)}
        />
        </View>
        ) : null}
      </SectionCard>

      {showingAddTreeTab ? (
      <SectionCard title={workflowLabels.latestRecordsTitle} subtitle={workflowLabels.latestRecordsSubtitle}>
        {!myTrees.length ? (
          <EmptyState title={`No saved ${workflowLabels.entityPlural.toLowerCase()} yet`} subtitle={`Once this user captures ${workflowLabels.entityPlural.toLowerCase()} in the active project, they will appear here.`} />
        ) : (
          myTrees.slice(0, 8).map((tree) => (
            <View key={tree.id} style={styles.treeCard}>
              <View style={styles.treeHeader}>
                <View style={styles.treeText}>
                  <Text style={styles.treeTitle}>{workflowLabels.entitySingular} #{tree.project_tree_no || tree.id}</Text>
                  <Text style={styles.treeSub}>{tree.species || `Unspecified ${workflowLabels.cropLabel.toLowerCase()}`}</Text>
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
      ) : null}

      <SelectSheet
        visible={custodianPickerOpen}
        title={`Select ${workflowLabels.ownerLabel.toLowerCase()}`}
        options={[
          { label: `No ${workflowLabels.ownerLabel.toLowerCase()}`, value: "" },
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
          description: `${item.remaining} remaining after approvals (${item.total} assigned)`,
        }))}
        selectedValue={species}
        onClose={() => setSpeciesPickerOpen(false)}
        onSelect={(value) => {
          setSpeciesPickerOpen(false);
          setSpecies(value);
          clearFieldError("species");
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
      <SelectSheet
        visible={plotIrrigationPickerOpen}
        title="Irrigation Type"
        options={AGRIC_IRRIGATION_OPTIONS}
        selectedValue={plotIrrigationType}
        onClose={() => setPlotIrrigationPickerOpen(false)}
        onSelect={(value) => {
          setPlotIrrigationPickerOpen(false);
          setPlotIrrigationType(value);
        }}
      />
      <SelectSheet
        visible={plotProductionStagePickerOpen}
        title="Production Stage"
        options={AGRIC_PRODUCTION_STAGE_OPTIONS}
        selectedValue={plotProductionStage}
        onClose={() => setPlotProductionStagePickerOpen(false)}
        onSelect={(value) => {
          setPlotProductionStagePickerOpen(false);
          setPlotProductionStage(value);
        }}
      />
      <SelectSheet
        visible={siteAssetTypePickerOpen}
        title="Asset Type"
        options={RELIEF_ASSET_TYPE_OPTIONS}
        selectedValue={siteAssetType}
        onClose={() => setSiteAssetTypePickerOpen(false)}
        onSelect={(value) => {
          setSiteAssetTypePickerOpen(false);
          setSiteAssetType(value);
        }}
      />
      <SelectSheet
        visible={siteDamageLevelPickerOpen}
        title="Damage Level"
        options={RELIEF_DAMAGE_LEVEL_OPTIONS}
        selectedValue={siteDamageLevel}
        onClose={() => setSiteDamageLevelPickerOpen(false)}
        onSelect={(value) => {
          setSiteDamageLevelPickerOpen(false);
          setSiteDamageLevel(value);
        }}
      />
      <SelectSheet
        visible={siteResponsePathwayPickerOpen}
        title="Response Path"
        options={RELIEF_RESPONSE_PATHWAY_OPTIONS}
        selectedValue={siteResponsePathway}
        onClose={() => setSiteResponsePathwayPickerOpen(false)}
        onSelect={(value) => {
          setSiteResponsePathwayPickerOpen(false);
          setSiteResponsePathway(value);
        }}
      />
      <Modal
        visible={Boolean(selectedTree && !isAdjustingTree)}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => handleSelectTree(null)}
      >
        <View style={styles.inspectorModalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => handleSelectTree(null)} />
          {selectedTree ? (
            <View style={styles.inspectorSheet}>
              <View style={styles.mapTreeSheetHandle} />
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.inspectorScrollContent}>
                <View style={styles.selectedTreeHeader}>
                  <View style={styles.selectedTreeText}>
                    <Text style={styles.selectedTreeTitle}>{workflowLabels.entitySingular} #{selectedTree.project_tree_no || selectedTree.id}</Text>
                    <Text style={styles.selectedTreeSub}>{selectedTree.species || `Unspecified ${workflowLabels.cropLabel.toLowerCase()}`}</Text>
                  </View>
                  <StatusChip
                    label={toTitle(selectedTree.status || "pending")}
                    tone={
                      normalizeTaskState(selectedTree.status) === "healthy" || normalizeTaskState(selectedTree.status) === "alive"
                        ? "online"
                        : normalizeTaskState(selectedTree.status) === "dead" || normalizeTaskState(selectedTree.status) === "removed"
                          ? "offline"
                          : "warning"
                    }
                  />
                </View>

                {selectedTreePhotoLoading ? (
                  <View style={[styles.selectedTreePhoto, styles.selectedTreePhotoEmpty]}>
                    <ActivityIndicator size="small" color={colors.primaryDark} />
                  </View>
                ) : selectedTreePhotoCachedUri ? (
                  <ExpoImage
                    key={selectedTreePhotoCachedUri}
                    source={{ uri: selectedTreePhotoCachedUri }}
                    style={styles.selectedTreePhoto}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                ) : selectedTreePhotoDataUri ? (
                  <ExpoImage
                    key={`data-${selectedTreeId}`}
                    source={{ uri: selectedTreePhotoDataUri }}
                    style={styles.selectedTreePhoto}
                    contentFit="cover"
                    cachePolicy="memory"
                    transition={200}
                  />
                ) : selectedTreePhotoUrlIndex < selectedTreePhotoUrls.length ? (
                  <ExpoImage
                    key={selectedTreePhotoUrls[selectedTreePhotoUrlIndex]}
                    source={{ uri: selectedTreePhotoUrls[selectedTreePhotoUrlIndex] }}
                    style={styles.selectedTreePhoto}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    onError={() => setSelectedTreePhotoUrlIndex((prev) => prev + 1)}
                  />
                ) : (
                  <View style={[styles.selectedTreePhoto, styles.selectedTreePhotoEmpty]}>
                    <Text style={styles.selectedTreePhotoEmptyText}>No {workflowLabels.entitySingular.toLowerCase()} photo</Text>
                  </View>
                )}

                <View style={styles.selectedTreeMetaGrid}>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{fieldWorkflowMode ? "Observation date" : "Reference date"}</Text>
                    <Text style={styles.selectedTreeMetricValue}>{selectedTree.planting_date ? formatDate(selectedTree.planting_date) : "-"}</Text>
                  </View>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{fieldWorkflowMode ? workflowLabels.cropLabel : "Origin"}</Text>
                    <Text style={styles.selectedTreeMetricValue}>
                      {agricMode
                        ? String(selectedTree.record_profile_data?.commodity || selectedTree.species || "-")
                        : reliefMode
                          ? String((selectedTree.record_profile_data as Record<string, unknown> | undefined)?.asset_type || selectedTree.species || "-")
                        : toTitle(selectedTree.tree_origin || "new_planting")}
                    </Text>
                  </View>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{fieldWorkflowMode ? "Boundary" : "Height"}</Text>
                    <Text style={styles.selectedTreeMetricValue}>
                      {fieldWorkflowMode
                        ? toTitle(String(agricMode ? selectedTree.record_profile_data?.boundary_capture_method : selectedTree.record_profile_data?.relief_boundary_capture_method || (selectedTree.existing_area_sqm ? "polygon_map" : "point")).replaceAll("_", " "))
                        : selectedTree.tree_height_m != null
                          ? `${selectedTree.tree_height_m} m`
                          : "-"}
                    </Text>
                  </View>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{agricMode ? "Season" : reliefMode ? "Damage" : "Estimated age"}</Text>
                    <Text style={styles.selectedTreeMetricValue}>
                      {agricMode
                        ? [
                            selectedTree.record_profile_data?.season_name,
                            selectedTree.record_profile_data?.season_year,
                          ]
                            .filter(Boolean)
                            .join(" ")
                          || "-"
                        : reliefMode
                          ? String((selectedTree.record_profile_data as Record<string, unknown> | undefined)?.damage_level || "-")
                        : selectedTree.tree_age_months != null
                          ? `${selectedTree.tree_age_months} mo`
                          : "-"}
                    </Text>
                  </View>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{workflowLabels.ownerLabel}</Text>
                    <Text style={styles.selectedTreeMetricValue}>{selectedTree.custodian_name || "-"}</Text>
                  </View>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>Added by</Text>
                    <Text style={styles.selectedTreeMetricValue}>{selectedTree.created_by || "-"}</Text>
                  </View>
                  {agricMode ? (
                    <>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Plot code</Text>
                        <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.record_profile_data?.plot_code || "-")}</Text>
                      </View>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Area</Text>
                        <Text style={styles.selectedTreeMetricValue}>
                          {selectedTree.record_profile_data?.area_hectares != null
                            ? `${selectedTree.record_profile_data.area_hectares} ha`
                            : selectedTree.existing_area_sqm != null
                              ? `${(Number(selectedTree.existing_area_sqm) / 10000).toFixed(4)} ha`
                              : "-"}
                        </Text>
                      </View>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Irrigation</Text>
                        <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.record_profile_data?.irrigation_type || "-")}</Text>
                      </View>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Stage</Text>
                        <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.record_profile_data?.production_stage || "-")}</Text>
                      </View>
                    </>
                  ) : reliefMode ? (
                    <>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Site code</Text>
                        <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.record_profile_data?.asset_code || "-")}</Text>
                      </View>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Area</Text>
                        <Text style={styles.selectedTreeMetricValue}>
                          {selectedTree.record_profile_data?.area_hectares != null
                            ? `${selectedTree.record_profile_data.area_hectares} ha`
                            : selectedTree.existing_area_sqm != null
                              ? `${(Number(selectedTree.existing_area_sqm) / 10000).toFixed(4)} ha`
                              : "-"}
                        </Text>
                      </View>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Response</Text>
                        <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.record_profile_data?.response_pathway || "-")}</Text>
                      </View>
                      <View style={styles.selectedTreeMetric}>
                        <Text style={styles.selectedTreeMetricLabel}>Population served</Text>
                        <Text style={styles.selectedTreeMetricValue}>{selectedTree.record_profile_data?.population_served != null ? String(selectedTree.record_profile_data.population_served) : "-"}</Text>
                      </View>
                    </>
                  ) : null}
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{fieldWorkflowMode ? `Pending ${workflowLabels.activityTitle.toLowerCase()}` : "Pending maintenance"}</Text>
                    <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.maintenance_pending || 0)}</Text>
                  </View>
                  <View style={styles.selectedTreeMetric}>
                    <Text style={styles.selectedTreeMetricLabel}>{fieldWorkflowMode ? `Completed ${workflowLabels.activityTitle.toLowerCase()}` : "Completed maintenance"}</Text>
                    <Text style={styles.selectedTreeMetricValue}>{String(selectedTree.maintenance_done || 0)}</Text>
                  </View>
                </View>

                <Text style={styles.selectedTreeCoords}>
                  GPS {selectedTree.lat != null && selectedTree.lng != null ? `${formatCoordinate(selectedTree.lat)}, ${formatCoordinate(selectedTree.lng)}` : "Not set"}
                </Text>
                {selectedTree.last_maintenance_type ? (
                  <Text style={styles.selectedTreeCoords}>
                    {fieldWorkflowMode ? `Last ${workflowLabels.activityTitleSingular.toLowerCase()}` : "Last maintenance"}: {formatWorkflowTaskTypeLabel(selectedTree.last_maintenance_type, reliefMode ? "relief_recovery" : agricMode ? "agric" : "green")}
                    {selectedTree.last_maintenance_date ? ` | ${formatDate(selectedTree.last_maintenance_date)}` : ""}
                  </Text>
                ) : null}
                {(selectedTree.inventory_tree_count || 1) > 1 ? (
                  <Text style={styles.selectedTreeCoords}>
                    {fieldWorkflowMode ? "Boundary batch" : "Batch record"}: {selectedTree.inventory_tree_count} {fieldWorkflowMode ? workflowLabels.entityPlural.toLowerCase() : "trees"}
                  </Text>
                ) : null}

                <View style={styles.selectedTreeMaintenanceWrap}>
                  <Text style={styles.selectedTreeMaintenanceTitle}>{fieldWorkflowMode ? `Recent ${workflowLabels.activityTitle}` : "Recent Maintenance"}</Text>
                  {selectedTreeInspectorLoading ? (
                    <Text style={styles.selectedTreeMaintenanceHint}>
                      {fieldWorkflowMode ? `Loading latest ${workflowLabels.activityTitle.toLowerCase()}...` : "Loading latest maintenance records..."}
                    </Text>
                  ) : selectedTreeRecentTasks.length === 0 ? (
                    <Text style={styles.selectedTreeMaintenanceHint}>
                      {fieldWorkflowMode ? `No ${workflowLabels.activityTitle.toLowerCase()} records yet.` : "No maintenance records yet."}
                    </Text>
                  ) : (
                    selectedTreeRecentTasks.map((task) => (
                      <View key={task.id} style={styles.selectedTreeMaintenanceItem}>
                        <View style={styles.selectedTreeMaintenanceRow}>
                          <Text style={styles.selectedTreeMaintenanceType}>{formatWorkflowTaskTypeLabel(task.task_type, reliefMode ? "relief_recovery" : agricMode ? "agric" : "green")}</Text>
                          <StatusChip
                            label={toTitle(task.review_state || task.status || "pending")}
                            tone={
                              normalizeTaskState(task.review_state || task.status) === "approved"
                                ? "online"
                                : normalizeTaskState(task.review_state || task.status) === "submitted"
                                  ? "warning"
                                  : "neutral"
                            }
                          />
                        </View>
                        <Text style={styles.selectedTreeMaintenanceMeta}>
                          {task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}
                          {task.assignee_name ? ` | ${task.assignee_name}` : ""}
                        </Text>
                        {task.notes ? <Text style={styles.selectedTreeMaintenanceNotes}>{task.notes}</Text> : null}
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.selectedTreeActions}>
                  <PrimaryButton
                    label={agricMode ? "Adjust Plot Anchor" : "Adjust Position"}
                    onPress={beginAdjustTree}
                    disabled={treeActionBusy !== null || !selectedTreeEditable}
                    variant="secondary"
                  />
                  {publicSponsorshipProject && (
                    <PrimaryButton
                      label="Print QR Tag"
                      onPress={() => {
                        const url = appendDownloadQuery(`${API_URL}/green/trees/${selectedTree.id}/qr-tag/pdf`, qrDownloadQuery);
                        Linking.openURL(url).catch(() => {
                          Alert.alert("Error", "Failed to open QR tag PDF.");
                        });
                      }}
                      variant="ghost"
                    />
                  )}
                  <PrimaryButton
                    label="Full Record"
                    onPress={() => navigation.navigate("TreeDetail", { treeId: selectedTree.id, projectId: selectedTree.project_id })}
                    disabled={treeActionBusy !== null}
                    variant="ghost"
                  />
                </View>
                {selectedTreeEditable ? (
                  <Pressable onPress={confirmDeleteTree} disabled={treeActionBusy !== null} style={[styles.deleteTreeButton, treeActionBusy === "delete" && styles.deleteTreeButtonDisabled]}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={styles.deleteTreeButtonText}>{treeActionBusy === "delete" ? "Deleting..." : `Delete ${workflowLabels.entitySingular}`}</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={capturingGps}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
      >
        <View style={styles.plantingOverlay}>
          <View style={styles.plantingModal}>
            <View style={styles.plantingCircle}>
              <ActivityIndicator size="large" color={colors.primaryDark} />
            </View>
            <Text style={styles.plantingTitle}>Capturing GPS</Text>
            <Text style={styles.plantingMessage}>Getting your current location, please hold still...</Text>
          </View>
        </View>
      </Modal>
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
                ? agricMode
                  ? "Saving plot"
                  : treeOrigin === "existing_inventory"
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
  fieldTabRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  fieldTabButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  fieldTabButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  fieldTabButtonText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "800",
  },
  fieldTabButtonTextActive: {
    color: colors.primaryDark,
  },
  note: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  helpText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  plantingOverlay: {
    ...StyleSheet.absoluteFill,
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
  sponsorQrBanner: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#b8dcc0",
    backgroundColor: "#f4fcf6",
    padding: spacing.md,
    gap: spacing.sm,
  },
  sponsorQrBannerTitle: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "900",
  },
  sponsorQrBannerText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  sponsorQrBannerMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sponsorQrBannerMetaError: {
    color: colors.danger,
  },
  sponsorQrList: {
    gap: spacing.sm,
  },
  sponsorQrCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#d6ead8",
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sponsorQrCardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  sponsorQrCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  sponsorQrCardMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  sponsorQrCardDedication: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldCaptureBanner: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "#fff6ea",
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldCaptureBannerTitle: {
    color: "#8a4f00",
    fontSize: 13,
    fontWeight: "900",
  },
  fieldCaptureBannerText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldCaptureChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  fieldCaptureChip: {
    minWidth: 132,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#efc27d",
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  fieldCaptureChipLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  fieldCaptureChipMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  fieldCaptureChipActive: {
    borderColor: colors.primaryDark,
    backgroundColor: "#f0fdf4",
  },
  mapSheetWrap: {
    position: "relative",
  },
  inspectorModalWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(8, 20, 14, 0.34)",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  inspectorSheet: {
    maxHeight: "82%",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  inspectorScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  mapTreeSheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    marginTop: -2,
  },
  treeAdjustBar: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  treeAdjustHandle: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
  },
  treeAdjustTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  treeAdjustText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  treeAdjustActions: {
    gap: spacing.sm,
  },
  selectedTreeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  selectedTreeText: {
    flex: 1,
    gap: 2,
  },
  selectedTreeTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  selectedTreeSub: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "700",
  },
  selectedTreePhoto: {
    width: "100%",
    height: 148,
    borderRadius: radii.lg,
    backgroundColor: colors.panelSoft,
  },
  selectedTreePhotoEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedTreePhotoEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  selectedTreeMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  selectedTreeMetric: {
    width: "48%",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.sm,
    gap: 2,
  },
  selectedTreeMetricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  selectedTreeMetricValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  selectedTreeCoords: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  selectedTreeActions: {
    gap: spacing.sm,
  },
  selectedTreeMaintenanceWrap: {
    gap: spacing.sm,
  },
  selectedTreeMaintenanceTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  selectedTreeMaintenanceHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  selectedTreeMaintenanceItem: {
    gap: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.sm,
  },
  selectedTreeMaintenanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  selectedTreeMaintenanceType: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  selectedTreeMaintenanceMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  selectedTreeMaintenanceNotes: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteTreeButton: {
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.22)",
    backgroundColor: "rgba(220,38,38,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  deleteTreeButtonDisabled: {
    opacity: 0.55,
  },
  deleteTreeButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "900",
  },
  formSection: { gap: spacing.md },
  fieldLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  inputError: {
    borderColor: "rgba(220,38,38,0.38)",
    backgroundColor: "rgba(220,38,38,0.03)",
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
