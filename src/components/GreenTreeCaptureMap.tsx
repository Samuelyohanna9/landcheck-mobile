import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "./EmptyState";
import { ensureMapboxConfigured, hasMapboxToken, isMapboxNativeAvailable, Mapbox } from "../maps/mapbox";
import { colors, radii, spacing } from "../theme/tokens";
import type { TreeSummary } from "../types/domain";
import { formatCoordinate, toTitle } from "../utils/format";
import { polygonGeoJsonFromPoints, type LngLat } from "../utils/geo";

type MapCoordinate = [number, number];
type DrawTool = "point" | "line" | "polygon";

type GreenTreeCaptureMapProps = {
  trees: TreeSummary[];
  captureLocation: { latitude: number; longitude: number } | null;
  onPickLocation?: (next: { latitude: number; longitude: number }) => void;
  focusTreeId?: number | null;
  selectedTreeId?: number | null;
  onSelectTree?: (treeId: number | null) => void;
  draggableTreeId?: number | null;
  onDragTree?: (treeId: number, next: { latitude: number; longitude: number }) => void;
  onBackgroundPress?: () => void;
  mapHeight?: number;
  overlayTitle?: string;
  overlaySubtitle?: string;
  interactive?: boolean;
  mode?: DrawTool;
  polygonPoints?: LngLat[];
  onAddPolygonPoint?: (next: { latitude: number; longitude: number }) => void;
  overlayAreas?: Array<{
    id: string;
    geometry: Record<string, unknown> | null | undefined;
    strokeColor?: string;
    fillColor?: string;
    label?: string;
    recordId?: number | null;
  }>;
  fitPoints?: LngLat[] | null;
  drawTool?: DrawTool;
  showDrawControls?: boolean;
  onSelectDrawTool?: (tool: DrawTool) => void;
  onClearDraft?: () => void;
  pointToolDisabled?: boolean;
  lineToolDisabled?: boolean;
  polygonToolDisabled?: boolean;
  workflowMode?: "green" | "agric" | "relief_recovery" | "csr";
  showUserLocation?: boolean;
};

ensureMapboxConfigured();

const DEFAULT_CENTER: MapCoordinate = [8.6753, 9.082];
const DEFAULT_ZOOM = 5.5;
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const treeToCoordinate = (tree: TreeSummary): MapCoordinate | null => {
  if (!Number.isFinite(tree.lng) || !Number.isFinite(tree.lat)) return null;
  return [Number(tree.lng), Number(tree.lat)];
};

const boundsFromCoordinates = (coordinates: MapCoordinate[]) => {
  if (!coordinates.length) return null;
  const lngs = coordinates.map((point) => point[0]);
  const lats = coordinates.map((point) => point[1]);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as MapCoordinate,
    sw: [Math.min(...lngs), Math.min(...lats)] as MapCoordinate,
  };
};

const captureToCoordinate = (captureLocation: { latitude: number; longitude: number } | null): MapCoordinate | null =>
  captureLocation ? [captureLocation.longitude, captureLocation.latitude] : null;

const eventToCoordinate = (event: { geometry?: { coordinates?: unknown } } | null | undefined): MapCoordinate | null => {
  const coordinates = event?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
};

const toFeature = (
  id: string,
  geometry: Record<string, unknown> | null | undefined,
  label?: string,
  recordId?: number | null,
) => {
  if (!geometry || typeof geometry !== "object") return null;
  const row = geometry as Record<string, unknown>;
  if (row.type === "Feature" && row.geometry && typeof row.geometry === "object") {
    const nextProperties =
      row.properties && typeof row.properties === "object" ? { ...(row.properties as Record<string, unknown>) } : {};
    nextProperties.id = id;
    if (label) nextProperties.label = label;
    if (Number.isFinite(Number(recordId)) && Number(recordId) > 0) nextProperties.recordId = Number(recordId);
    return {
      ...row,
      properties: nextProperties,
    };
  }
  if (typeof row.type === "string" && row.coordinates !== undefined) {
    return {
      type: "Feature",
      properties: {
        id,
        ...(label ? { label } : {}),
        ...(Number.isFinite(Number(recordId)) && Number(recordId) > 0 ? { recordId: Number(recordId) } : {}),
      },
      geometry: row,
    };
  }
  return null;
};

const collectGeometryCoordinates = (geometry: unknown): MapCoordinate[] => {
  const rows: MapCoordinate[] = [];
  const pushPair = (point: unknown) => {
    if (!Array.isArray(point) || point.length < 2) return;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    rows.push([lng, lat]);
  };
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && !Array.isArray(value[0])) {
      pushPair(value);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry);
  return rows;
};

const statusColor = (tree: TreeSummary) => {
  if (tree.sync_state === "pending") return colors.warning;
  const status = String(tree.status || "").toLowerCase();
  if (status === "healthy" || status === "alive") return colors.success;
  if (status === "attention" || status === "damaged") return colors.warning;
  if (status === "removed" || status === "dead") return colors.danger;
  return colors.primary;
};

const formatPlotLabel = (tree: TreeSummary) => {
  const plotCode = String(tree.record_profile_data?.plot_code || "").trim();
  if (plotCode) return plotCode;
  const plotName = String(tree.record_profile_data?.plot_name || "").trim();
  if (plotName) return plotName;
  return `Plot #${tree.project_tree_no || tree.id}`;
};

const formatPlotAreaLabel = (tree: TreeSummary) => {
  const hectares = Number(tree.record_profile_data?.area_hectares);
  if (Number.isFinite(hectares) && hectares > 0) return `${hectares.toFixed(4)} ha`;
  const squareMeters = Number(tree.existing_area_sqm || 0);
  if (!Number.isFinite(squareMeters) || squareMeters <= 0) return "";
  return `${(squareMeters / 10000).toFixed(4)} ha`;
};

const formatRecordMapTitle = (tree: TreeSummary, workflowMode: "green" | "agric" | "relief_recovery" | "csr") => {
  if (workflowMode === "agric") {
    const plotLabel = formatPlotLabel(tree);
    const cropLabel = String(tree.record_profile_data?.commodity || tree.species || "").trim() || "Crop not set";
    return `${plotLabel} | ${cropLabel}`;
  }
  if (workflowMode === "relief_recovery") {
    const siteCode = String((tree.record_profile_data as Record<string, unknown> | undefined)?.asset_code || "").trim();
    const siteName = String((tree.record_profile_data as Record<string, unknown> | undefined)?.asset_name || tree.species || "").trim() || `Site #${tree.project_tree_no || tree.id}`;
    const assetType = String((tree.record_profile_data as Record<string, unknown> | undefined)?.asset_type || "").trim() || "Asset";
    return `${siteCode || siteName} | ${assetType}`;
  }
  return `#${tree.project_tree_no || tree.id} | ${tree.species || "Unspecified"}`;
};

const formatRecordMapSnippet = (tree: TreeSummary, coordinate: MapCoordinate, workflowMode: "green" | "agric" | "relief_recovery" | "csr") => {
  if (workflowMode === "agric") {
    return [
      String(tree.custodian_name || "").trim() || "Farmer not linked",
      formatPlotAreaLabel(tree),
      `${formatCoordinate(coordinate[1])}, ${formatCoordinate(coordinate[0])}`,
    ]
      .filter(Boolean)
      .join(" | ");
  }
  if (workflowMode === "relief_recovery") {
    const assetType = String((tree.record_profile_data as Record<string, unknown> | undefined)?.asset_type || "").trim();
    return [
      String(tree.custodian_name || "").trim() || "Beneficiary not linked",
      assetType || "Site type not set",
      formatPlotAreaLabel(tree),
      `${formatCoordinate(coordinate[1])}, ${formatCoordinate(coordinate[0])}`,
    ]
      .filter(Boolean)
      .join(" | ");
  }
  return `${toTitle(tree.status)} | ${formatCoordinate(coordinate[1])}, ${formatCoordinate(coordinate[0])}`;
};

export const GreenTreeCaptureMap = ({
  trees,
  captureLocation,
  onPickLocation,
  focusTreeId,
  selectedTreeId = null,
  onSelectTree,
  draggableTreeId = null,
  onDragTree,
  onBackgroundPress,
  mapHeight = 320,
  overlayTitle,
  overlaySubtitle,
  interactive = true,
  mode = "point",
  polygonPoints = [],
  onAddPolygonPoint,
  overlayAreas = [],
  fitPoints = null,
  drawTool = mode,
  showDrawControls = false,
  onSelectDrawTool,
  onClearDraft,
  pointToolDisabled = false,
  lineToolDisabled = false,
  polygonToolDisabled = false,
  workflowMode = "green",
  showUserLocation = true,
}: GreenTreeCaptureMapProps) => {
  const [mapReady, setMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const cameraRef = useRef<any>(null);
  const lastCaptureSignatureRef = useRef("");
  const resolvedOverlayTitle =
    overlayTitle ??
    (workflowMode === "agric"
      ? "Tap the map to set the plot anchor"
      : workflowMode === "relief_recovery"
        ? "Tap the map to set the site anchor"
        : "Tap the map to place the new tree");
  const resolvedOverlaySubtitle =
    overlaySubtitle ??
    (workflowMode === "agric"
      ? "Existing mapped plots remain visible for context. The green marker is the plot anchor you are about to save."
      : workflowMode === "relief_recovery"
        ? "Existing mapped sites remain visible for context. The green marker is the site anchor you are about to save."
      : "Existing trees remain visible for context. The green marker is the tree you are about to save.");

  const treeMarkers = useMemo(
    () =>
      trees
        .map((tree) => ({
          tree,
          coordinate: treeToCoordinate(tree),
        }))
        .filter((item): item is { tree: TreeSummary; coordinate: MapCoordinate } => Boolean(item.coordinate)),
    [trees],
  );

  const captureCoordinate = useMemo(() => captureToCoordinate(captureLocation), [captureLocation]);
  const polygonFeature = useMemo(() => {
    if (polygonPoints.length < 3) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: polygonGeoJsonFromPoints(polygonPoints),
    };
  }, [polygonPoints]);
  const polygonLineFeature = useMemo(() => {
    if (polygonPoints.length < 2) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: polygonPoints,
      },
    };
  }, [polygonPoints]);
  const overlayFeatures = useMemo(
    () =>
      overlayAreas
        .map((area) => ({
          ...area,
          feature: toFeature(area.id, area.geometry, area.label, area.recordId),
        }))
        .filter(
          (
            area,
          ): area is typeof area & {
            feature: Record<string, unknown>;
          } => Boolean(area.feature),
        ),
    [overlayAreas],
  );
  const isFieldWorkflowMode = workflowMode === "agric" || workflowMode === "relief_recovery";
  const showTreeMarkers = !isFieldWorkflowMode;
  const isPolylineMode = mode === "line" || mode === "polygon";

  const focusCoordinates = useMemo(() => {
    if (mode === "point" && captureCoordinate) return [captureCoordinate];
    if (polygonPoints.length > 0) return polygonPoints;
    if (fitPoints && fitPoints.length) return fitPoints;
    const next = treeMarkers.map((item) => item.coordinate);
    if (captureCoordinate) next.push(captureCoordinate);
    if (polygonPoints.length) next.push(...polygonPoints);
    overlayFeatures.forEach((area) => {
      const feature = area.feature as { type?: string; geometry?: { coordinates?: unknown } };
      next.push(...collectGeometryCoordinates(feature.geometry?.coordinates));
    });
    return next;
  }, [captureCoordinate, fitPoints, overlayFeatures, polygonPoints, treeMarkers]);

  const fitCamera = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera || !mapReady || !hasMapboxToken) return;

    if (!focusCoordinates.length) {
      setCurrentZoom(DEFAULT_ZOOM);
      camera.setCamera({
        centerCoordinate: DEFAULT_CENTER,
        zoomLevel: DEFAULT_ZOOM,
        animationDuration: 0,
      });
      return;
    }

    if (focusCoordinates.length === 1) {
      setCurrentZoom(15);
      camera.setCamera({
        centerCoordinate: focusCoordinates[0],
        zoomLevel: 15,
        animationDuration: 350,
      });
      return;
    }

    const bounds = boundsFromCoordinates(focusCoordinates);
    if (!bounds) return;
    camera.fitBounds(bounds.ne, bounds.sw, [80, 80, 80, 80], 350);
  }, [focusCoordinates, mapReady]);

  useEffect(() => {
    fitCamera();
  }, [fitCamera]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera || !mapReady || !captureCoordinate || mode !== "point") return;
    const signature = `${captureCoordinate[0].toFixed(6)}:${captureCoordinate[1].toFixed(6)}`;
    if (lastCaptureSignatureRef.current === signature) return;
    lastCaptureSignatureRef.current = signature;
    const zoomLevel = Math.max(currentZoom, 15);
    setCurrentZoom(zoomLevel);
    camera.setCamera({
      centerCoordinate: captureCoordinate,
      zoomLevel,
      animationDuration: 350,
    });
  }, [captureCoordinate, currentZoom, mapReady, mode]);

  const changeZoom = useCallback(
    (delta: number) => {
      const camera = cameraRef.current;
      if (!camera) return;
      const nextZoom = clampZoom(currentZoom + delta);
      setCurrentZoom(nextZoom);
      if (typeof camera.zoomTo === "function") {
        camera.zoomTo(nextZoom, 180);
        return;
      }
      camera.setCamera({
        zoomLevel: nextZoom,
        animationDuration: 180,
      });
    },
    [currentZoom],
  );

  if (!hasMapboxToken) {
    return (
      <View style={styles.missingWrap}>
        <EmptyState
          title="Mapbox token missing"
          subtitle="Add EXPO_PUBLIC_MAPBOX_TOKEN to landcheck-mobile/.env so the native field map can load."
        />
      </View>
    );
  }

  if (!isMapboxNativeAvailable || !Mapbox) {
    return (
      <View style={styles.missingWrap}>
        <EmptyState
          title="Native map module not installed in this app build"
          subtitle="Rebuild and reinstall the Android/iOS app after the Mapbox integration. The current binary was launched without the native field map module."
        />
      </View>
    );
  }

  const MapboxNative = Mapbox;

  return (
    <View style={styles.wrap}>
      <MapboxNative.MapView
        style={[styles.map, { height: mapHeight }]}
        styleURL={MapboxNative.StyleURL.SatelliteStreet}
        logoEnabled
        attributionEnabled
        scaleBarEnabled={false}
        compassEnabled
        rotateEnabled={false}
        requestDisallowInterceptTouchEvent
        onDidFinishLoadingMap={() => setMapReady(true)}
        onCameraChanged={(event: any) => {
          const zoomLevel = Number(event?.properties?.zoomLevel);
          if (Number.isFinite(zoomLevel)) {
            setCurrentZoom(zoomLevel);
          }
        }}
        onPress={
          interactive && mode === "point" && onPickLocation
            ? (feature) => {
                const coordinate = eventToCoordinate(feature);
                if (!coordinate) return;
                onPickLocation({ longitude: coordinate[0], latitude: coordinate[1] });
              }
            : interactive && mode === "point" && onBackgroundPress
              ? () => {
                  onBackgroundPress();
                }
            : interactive && isPolylineMode && onAddPolygonPoint
              ? (feature) => {
                  const coordinate = eventToCoordinate(feature);
                  if (!coordinate) return;
                  onAddPolygonPoint({ longitude: coordinate[0], latitude: coordinate[1] });
                }
            : undefined
        }
      >
        <MapboxNative.Camera ref={cameraRef} defaultSettings={{ centerCoordinate: DEFAULT_CENTER, zoomLevel: DEFAULT_ZOOM }} />
        {showUserLocation ? (
          <MapboxNative.LocationPuck
            visible
            puckBearing="heading"
            puckBearingEnabled
            pulsing={{ isEnabled: true, color: colors.primary, radius: "accuracy" }}
          />
        ) : null}

        {showTreeMarkers
          ? treeMarkers.map(({ tree, coordinate }) => (
              <MapboxNative.PointAnnotation
                key={`tree-${tree.id}`}
                id={`tree-${tree.id}`}
                coordinate={coordinate}
                draggable={interactive && draggableTreeId === tree.id}
                title={formatRecordMapTitle(tree, workflowMode)}
                snippet={formatRecordMapSnippet(tree, coordinate, workflowMode)}
                onSelected={onSelectTree ? () => onSelectTree(tree.id) : undefined}
                onDeselected={onSelectTree ? () => onSelectTree(null) : undefined}
                onDragEnd={
                  interactive && draggableTreeId === tree.id && onDragTree
                    ? (feature) => {
                        const next = eventToCoordinate(feature);
                        if (!next) return;
                        onDragTree(tree.id, { longitude: next[0], latitude: next[1] });
                      }
                    : undefined
                }
              >
                <View
                  style={[
                    styles.treeMarker,
                    (tree.id === focusTreeId || tree.id === selectedTreeId) && styles.focusTreeMarker,
                    draggableTreeId === tree.id && styles.draggingTreeMarker,
                    { backgroundColor: statusColor(tree) },
                  ]}
                />
              </MapboxNative.PointAnnotation>
            ))
          : null}

        {overlayFeatures.map((area) =>
          area.feature ? (
            <MapboxNative.ShapeSource
              key={`overlay-${area.id}`}
              id={`overlay-${area.id}`}
              shape={area.feature as never}
              onPress={
                onSelectTree && !isPolylineMode
                  ? (event: any) => {
                      const pressedFeatures = Array.isArray(event?.features) ? event.features : [];
                      const rawRecordId = pressedFeatures[0]?.properties?.recordId;
                      const recordId = Number(rawRecordId || 0);
                      if (recordId > 0) onSelectTree(recordId);
                    }
                  : undefined
              }
            >
              <MapboxNative.FillLayer
                id={`overlay-fill-${area.id}`}
                style={{
                  fillColor:
                    area.fillColor ||
                    (!isFieldWorkflowMode ? "rgba(35,146,82,0.12)" : "rgba(220,38,38,0.09)"),
                  fillOutlineColor:
                    area.strokeColor ||
                    (!isFieldWorkflowMode ? "rgba(35,146,82,0.84)" : "rgba(185,28,28,0.92)"),
                }}
              />
              <MapboxNative.LineLayer
                id={`overlay-line-${area.id}`}
                style={{
                  lineColor:
                    area.strokeColor ||
                    (!isFieldWorkflowMode ? "rgba(35,146,82,0.9)" : "rgba(185,28,28,0.96)"),
                  lineWidth: !isFieldWorkflowMode ? 2 : 2.6,
                }}
              />
              <MapboxNative.CircleLayer
                id={`overlay-point-${area.id}`}
                style={{
                  circleColor:
                    area.strokeColor ||
                    (!isFieldWorkflowMode ? "rgba(35,146,82,0.95)" : "rgba(185,28,28,0.96)"),
                  circleRadius: !isFieldWorkflowMode ? 4.5 : 5.5,
                  circleStrokeColor: "#fff8f8",
                  circleStrokeWidth: !isFieldWorkflowMode ? 1 : 1.2,
                }}
              />
              <MapboxNative.SymbolLayer
                id={`overlay-label-${area.id}`}
                style={
                  {
                    textField: ["get", "label"],
                    textSize: 11,
                    textColor: !isFieldWorkflowMode ? "#124c32" : "#7f1d1d",
                    textHaloColor: !isFieldWorkflowMode ? "#eefaf1" : "#fff7f7",
                    textHaloWidth: 1.2,
                    textAllowOverlap: false,
                    textIgnorePlacement: false,
                    textMaxWidth: 14,
                    textAnchor: "center",
                    textJustify: "center",
                    textPitchAlignment: "map",
                    textOptional: true,
                    symbolPlacement: "point",
                    textOffset: [0, 0],
                    textFont: ["Open Sans Semibold"],
                    textLineHeight: 1.1,
                  } as any
                }
              />
            </MapboxNative.ShapeSource>
          ) : null,
        )}

        {polygonLineFeature ? (
          <MapboxNative.ShapeSource id="draft-polygon-line-source" shape={polygonLineFeature as never}>
            <MapboxNative.LineLayer
              id="draft-polygon-line-preview"
              style={{
                lineColor: "rgba(22,103,58,0.95)",
                lineWidth: 2.5,
              }}
            />
          </MapboxNative.ShapeSource>
        ) : null}

        {polygonFeature ? (
          <MapboxNative.ShapeSource id="draft-polygon" shape={polygonFeature as never}>
            <MapboxNative.FillLayer
              id="draft-polygon-fill"
              style={{
                fillColor: "rgba(35,146,82,0.16)",
                fillOutlineColor: "rgba(35,146,82,0.95)",
              }}
            />
            <MapboxNative.LineLayer
              id="draft-polygon-line"
              style={{
                lineColor: "rgba(22,103,58,0.95)",
                lineWidth: 2.5,
              }}
            />
          </MapboxNative.ShapeSource>
        ) : null}

        {isPolylineMode
          ? polygonPoints.map((point, index) => (
              <MapboxNative.PointAnnotation
                key={`polygon-vertex-${index}`}
                id={`polygon-vertex-${index}`}
                coordinate={point}
                title={`Vertex ${index + 1}`}
              >
                <View style={styles.vertexMarker} />
              </MapboxNative.PointAnnotation>
            ))
          : null}

        {captureCoordinate && mode === "point" ? (
          <MapboxNative.PointAnnotation
            id="capture-point"
            coordinate={captureCoordinate}
            draggable={Boolean(interactive && onPickLocation)}
            title="Captured position"
            snippet={interactive && onPickLocation ? "Drag to refine the position." : "Recorded activity position."}
            onDragEnd={
              interactive && onPickLocation
                ? (feature) => {
                    const coordinate = eventToCoordinate(feature);
                    if (!coordinate) return;
                    onPickLocation({ longitude: coordinate[0], latitude: coordinate[1] });
                  }
                : undefined
            }
          >
            <View style={styles.captureMarkerOuter}>
              <View style={styles.captureMarkerInner} />
            </View>
          </MapboxNative.PointAnnotation>
        ) : null}
      </MapboxNative.MapView>

      <View style={styles.zoomControls}>
        <Pressable onPress={() => changeZoom(1)} style={styles.zoomButton}>
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable onPress={() => changeZoom(-1)} style={styles.zoomButton}>
          <Text style={styles.zoomButtonText}>-</Text>
        </Pressable>
      </View>

      {showDrawControls ? (
        <View style={styles.drawControls}>
          <Pressable
            onPress={() => onSelectDrawTool?.("point")}
            disabled={pointToolDisabled}
            style={[styles.drawButton, drawTool === "point" && styles.drawButtonActive, pointToolDisabled && styles.drawButtonDisabled]}
          >
            <Ionicons name="location-sharp" size={18} color={drawTool === "point" ? colors.panel : colors.panel} />
          </Pressable>
          <Pressable
            onPress={() => onSelectDrawTool?.("line")}
            disabled={lineToolDisabled}
            style={[styles.drawButton, drawTool === "line" && styles.drawButtonActive, lineToolDisabled && styles.drawButtonDisabled]}
          >
            <MaterialCommunityIcons name="vector-line" size={18} color={colors.panel} />
          </Pressable>
          <Pressable
            onPress={() => onSelectDrawTool?.("polygon")}
            disabled={polygonToolDisabled}
            style={[styles.drawButton, drawTool === "polygon" && styles.drawButtonActive, polygonToolDisabled && styles.drawButtonDisabled]}
          >
            <MaterialCommunityIcons name="shape-polygon-plus" size={18} color={colors.panel} />
          </Pressable>
          <Pressable onPress={() => onClearDraft?.()} style={styles.drawButton}>
            <Ionicons name="trash" size={17} color={colors.panel} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>{resolvedOverlayTitle}</Text>
        <Text style={styles.overlayText}>{resolvedOverlaySubtitle}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  missingWrap: {
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  map: {
    width: "100%",
    height: 320,
  },
  zoomControls: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  drawControls: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: "rgba(231,76,60,0.96)",
    borderWidth: 1,
    borderColor: "rgba(168,33,33,0.48)",
  },
  drawButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(231,76,60,0.96)",
  },
  drawButtonActive: {
    backgroundColor: "rgba(185,28,28,0.98)",
  },
  drawButtonDisabled: {
    opacity: 0.42,
  },
  zoomButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButtonText: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
  },
  zoomDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  overlay: {
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  overlayTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  overlayText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  treeMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  focusTreeMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  draggingTreeMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.warning,
  },
  vertexMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primaryDark,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  captureMarkerOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(35, 146, 82, 0.18)",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
});
