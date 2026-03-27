import type { SpeciesAllocation, TaskSummary, TreeSummary, WorkOrderSummary } from "../types/domain";

const parseJsonMaybe = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const normalizePhotoList = (value: unknown): string[] => {
  const source = typeof value === "string" ? parseJsonMaybe(value) ?? value : value;
  const rows = Array.isArray(source) ? source : typeof source === "string" && source.trim() ? [source] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  rows.forEach((item) => {
    const next = String(item || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    output.push(next);
  });
  return output;
};

export const normalizeSpeciesAllocations = (value: unknown): SpeciesAllocation[] => {
  const source = typeof value === "string" ? parseJsonMaybe(value) ?? value : value;
  if (!Array.isArray(source)) return [];
  const merged = new Map<string, SpeciesAllocation>();
  source.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as Record<string, unknown>;
    const species = String(row.species || "").trim();
    const count = Number(row.count || 0);
    if (!species || !Number.isFinite(count) || count <= 0) return;
    const key = species.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.count += Math.round(count);
      return;
    }
    merged.set(key, {
      species,
      count: Math.round(count),
    });
  });
  return Array.from(merged.values());
};

export const normalizeMapGeometry = <T = Record<string, unknown>>(value: unknown): T | null => {
  if (!value) return null;
  const source = typeof value === "string" ? parseJsonMaybe(value) : value;
  if (!source || typeof source !== "object") return null;
  const row = source as Record<string, unknown>;
  if (row.type === "Feature" && row.geometry && typeof row.geometry === "object") {
    return row as T;
  }
  if (typeof row.type === "string" && row.coordinates !== undefined) {
    return row as T;
  }
  return null;
};

export const normalizeTaskSummary = (task: TaskSummary): TaskSummary => {
  const photoUrls = normalizePhotoList(task.photo_urls);
  const photoUrl = String(task.photo_url || "").trim();
  if (photoUrl && !photoUrls.includes(photoUrl)) photoUrls.push(photoUrl);
  return {
    ...task,
    photo_url: photoUrl || null,
    photo_urls: photoUrls,
  };
};

export const normalizeTreeSummary = (tree: TreeSummary): TreeSummary => {
  const photoUrls = normalizePhotoList(tree.photo_urls);
  const photoUrl = String(tree.photo_url || "").trim();
  if (photoUrl && !photoUrls.includes(photoUrl)) photoUrls.push(photoUrl);
  return {
    ...tree,
    photo_url: photoUrl || null,
    photo_urls: photoUrls,
    existing_area_geojson: normalizeMapGeometry(tree.existing_area_geojson),
  };
};

export const normalizeWorkOrderSummary = (order: WorkOrderSummary): WorkOrderSummary => ({
  ...order,
  species_allocations: normalizeSpeciesAllocations(order.species_allocations),
  area_geojson: normalizeMapGeometry(order.area_geojson),
});
