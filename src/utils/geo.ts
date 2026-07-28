export type LngLat = [number, number];

const isFinitePair = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(Number(value[0])) &&
  Number.isFinite(Number(value[1]));

export const closeRing = (points: LngLat[]) => {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
};

export const polygonGeoJsonFromPoints = (points: LngLat[]) => ({
  type: "Polygon",
  coordinates: [closeRing(points)],
});

export const polygonCentroid = (points: LngLat[]) => {
  const ring = closeRing(points);
  if (ring.length < 4) {
    if (!points.length) return null;
    const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return { lng, lat };
  }

  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const factor = x1 * y2 - x2 * y1;
    area += factor;
    cx += (x1 + x2) * factor;
    cy += (y1 + y2) * factor;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-12) {
    const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return { lng, lat };
  }
  return {
    lng: cx / (6 * area),
    lat: cy / (6 * area),
  };
};

export const polygonAreaSquareMeters = (points: LngLat[]) => {
  const ring = closeRing(points);
  if (ring.length < 4) return 0;
  const averageLatRadians =
    (ring.reduce((sum, point) => sum + Number(point[1]), 0) / ring.length) * (Math.PI / 180);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(averageLatRadians);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    const x1 = Number(lng1) * metersPerDegreeLng;
    const y1 = Number(lat1) * metersPerDegreeLat;
    const x2 = Number(lng2) * metersPerDegreeLng;
    const y2 = Number(lat2) * metersPerDegreeLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) * 0.5;
};

export const extractAllCoordinates = (geometry: unknown): LngLat[] => {
  if (!geometry || typeof geometry !== "object") return [];
  const payload = geometry as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[] };

  if (payload.type === "Feature") return extractAllCoordinates(payload.geometry);
  if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return payload.features.flatMap((feature) => extractAllCoordinates(feature));
  }

  if (!payload.type || payload.coordinates === undefined) return [];
  const coordinates = payload.coordinates;

  switch (payload.type) {
    case "Point":
      return isFinitePair(coordinates) ? [[Number(coordinates[0]), Number(coordinates[1])]] : [];
    case "LineString":
    case "MultiPoint":
      return Array.isArray(coordinates)
        ? (coordinates.filter(isFinitePair).map((pair) => [Number(pair[0]), Number(pair[1])] as LngLat) as LngLat[])
        : [];
    case "Polygon":
    case "MultiLineString":
      return Array.isArray(coordinates)
        ? coordinates.flatMap((item) =>
            Array.isArray(item) ? item.filter(isFinitePair).map((pair) => [Number(pair[0]), Number(pair[1])] as LngLat) : [],
          )
        : [];
    case "MultiPolygon":
      return Array.isArray(coordinates)
        ? coordinates.flatMap((polygon) =>
            Array.isArray(polygon)
              ? polygon.flatMap((ring) =>
                  Array.isArray(ring) ? ring.filter(isFinitePair).map((pair) => [Number(pair[0]), Number(pair[1])] as LngLat) : [],
                )
              : [],
          )
        : [];
    default:
      return [];
  }
};

export const boundsFromPoints = (points: LngLat[]) => {
  if (!points.length) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as LngLat,
    sw: [Math.min(...lngs), Math.min(...lats)] as LngLat,
  };
};

export const coordinateSummaryFromGeometry = (geometry: unknown) => {
  const points = extractAllCoordinates(geometry);
  return {
    points,
    bounds: boundsFromPoints(points),
  };
};
