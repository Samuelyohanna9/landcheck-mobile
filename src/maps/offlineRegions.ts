import { Mapbox, hasMapboxToken, isMapboxNativeAvailable } from "./mapbox";
import type { LngLat } from "../utils/geo";

export type OfflinePackSummary = {
  name: string;
  percentage: number;
  completedResourceCount: number;
  requiredResourceCount: number;
};

export const projectOfflinePackName = (projectId: number) => `green-project-${projectId}`;

const MAX_OFFLINE_TILES = 250;
const STYLE_RESOURCE_MULTIPLIER = 3;
const MAX_OFFLINE_RADIUS_KM = 2.2;
const skippedPackNames = new Set<string>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lngToTile = (lng: number, zoom: number) => ((lng + 180) / 360) * 2 ** zoom;

const latToTile = (lat: number, zoom: number) => {
  const clipped = clamp(lat, -85.05112878, 85.05112878);
  const radians = (clipped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom;
};

const estimateTileCount = (bounds: { ne: LngLat; sw: LngLat }, minZoom: number, maxZoom: number) => {
  let total = 0;
  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const west = Math.min(bounds.sw[0], bounds.ne[0]);
    const east = Math.max(bounds.sw[0], bounds.ne[0]);
    const south = Math.min(bounds.sw[1], bounds.ne[1]);
    const north = Math.max(bounds.sw[1], bounds.ne[1]);
    const x1 = Math.floor(lngToTile(west, zoom));
    const x2 = Math.floor(lngToTile(east, zoom));
    const y1 = Math.floor(latToTile(north, zoom));
    const y2 = Math.floor(latToTile(south, zoom));
    total += (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1);
  }
  return total * STYLE_RESOURCE_MULTIPLIER;
};

const pickOfflineZoomRange = (bounds: { ne: LngLat; sw: LngLat }) => {
  const minZoom = 8;
  for (let maxZoom = 14; maxZoom >= 10; maxZoom -= 1) {
    if (estimateTileCount(bounds, minZoom, maxZoom) <= MAX_OFFLINE_TILES) {
      return { minZoom, maxZoom };
    }
  }
  return null;
};

const shrinkBoundsForOffline = (bounds: { ne: LngLat; sw: LngLat }) => {
  const centerLng = (bounds.ne[0] + bounds.sw[0]) / 2;
  const centerLat = (bounds.ne[1] + bounds.sw[1]) / 2;
  const latHalfSpan = MAX_OFFLINE_RADIUS_KM / 111;
  const cosLat = Math.max(0.25, Math.cos((centerLat * Math.PI) / 180));
  const lngHalfSpan = MAX_OFFLINE_RADIUS_KM / (111 * cosLat);

  return {
    ne: [
      Math.min(bounds.ne[0], centerLng + lngHalfSpan),
      Math.min(bounds.ne[1], centerLat + latHalfSpan),
    ] as LngLat,
    sw: [
      Math.max(bounds.sw[0], centerLng - lngHalfSpan),
      Math.max(bounds.sw[1], centerLat - latHalfSpan),
    ] as LngLat,
  };
};

export const listOfflinePacks = async () => {
  if (!Mapbox || !isMapboxNativeAvailable || !hasMapboxToken) return [] as OfflinePackSummary[];
  const packs = await Mapbox.offlineManager.getPacks();
  const statuses = await Promise.all(
    packs.map(async (pack) => {
      const status = await pack.status();
      return {
        name: pack.name,
        percentage: Number(status?.percentage || 0),
        completedResourceCount: Number(status?.completedResourceCount || 0),
        requiredResourceCount: Number(status?.requiredResourceCount || 0),
      };
    }),
  );
  return statuses;
};

export const downloadOfflinePack = async ({
  packName,
  bounds,
}: {
  packName: string;
  bounds: { ne: LngLat; sw: LngLat };
}) => {
  if (!Mapbox || !isMapboxNativeAvailable || !hasMapboxToken) {
    throw new Error("Mapbox offline packs are not available in this build.");
  }
  if (skippedPackNames.has(packName)) return;
  const existing = (await Mapbox.offlineManager.getPacks()).find((pack) => pack.name === packName);
  if (existing) {
    await existing.resume();
    return;
  }
  const narrowedBounds = shrinkBoundsForOffline(bounds);
  const zoomRange = pickOfflineZoomRange(narrowedBounds);
  if (!zoomRange) {
    skippedPackNames.add(packName);
    return;
  }
  await Mapbox.offlineManager.createPack(
    {
      name: packName,
      styleURL: Mapbox.StyleURL.SatelliteStreet,
      minZoom: zoomRange.minZoom,
      maxZoom: zoomRange.maxZoom,
      bounds: [narrowedBounds.ne, narrowedBounds.sw],
      metadata: { name: packName },
    },
    () => undefined,
    (_pack, error) => {
      const message = String((error as { message?: string } | null | undefined)?.message || "");
      if (message.toLowerCase().includes("beyond the maximum allowed")) {
        skippedPackNames.add(packName);
        return;
      }
    },
  );
};

export const removeOfflinePack = async (packName: string) => {
  if (!Mapbox || !isMapboxNativeAvailable || !hasMapboxToken) return;
  await Mapbox.offlineManager.deletePack(packName);
};
