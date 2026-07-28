import {
  fetchDistributionAllocations,
  fetchProjectCustodians,
  fetchProjectDetail,
  fetchProjectsForFieldUser,
  fetchTasks,
  fetchTrees,
  fetchTreeTimeline,
  fetchUsers,
  fetchWorkOrders,
} from "../api/green";
import { normalizeTaskSummary } from "../green/normalize";
import { downloadOfflinePack, projectOfflinePackName } from "../maps/offlineRegions";
import {
  cacheCustodians,
  cacheDistributionAllocations,
  cacheProjectDetail,
  cacheProjects,
  cacheTasks,
  cacheTreeTasks,
  cacheTreeTimeline,
  cacheTrees,
  cacheUsers,
  cacheWorkOrders,
  updateLastSyncedAt,
} from "../storage/database";
import type {
  MobileSession,
  ProjectDetailSummary,
  ProjectSummary,
  TaskSummary,
  TreeSummary,
  WorkOrderSummary,
} from "../types/domain";
import { coordinateSummaryFromGeometry, boundsFromPoints, type LngLat } from "../utils/geo";
import { hydrateTreePhotosForOffline } from "./treePhotoCache";

const APP_MODE = "green";

const actorNameFromSession = (session: MobileSession) => String(session.user.full_name || "").trim();

const parseTreeGeometry = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
};

export const buildProjectBoundsFromTrees = (trees: TreeSummary[]) => {
  const pointCoords: LngLat[] = [];
  const geoCoords: LngLat[] = [];
  for (const tree of trees) {
    if (Number.isFinite(Number(tree.lng)) && Number.isFinite(Number(tree.lat))) {
      pointCoords.push([Number(tree.lng), Number(tree.lat)]);
    }
    const geometry = parseTreeGeometry(tree.existing_area_geojson);
    const summary = coordinateSummaryFromGeometry(geometry);
    if (summary.points.length) {
      geoCoords.push(...summary.points);
    }
  }
  return boundsFromPoints([...pointCoords, ...geoCoords]);
};

export const warmGreenProjectOfflineSurfaces = async (
  session: MobileSession,
  projectId: number,
  trees: TreeSummary[],
  options?: {
    actorName?: string;
    includeProjectDetail?: boolean;
    includeTreeTimelines?: boolean;
    includeMapPack?: boolean;
  },
) => {
  const actorName = String(options?.actorName || actorNameFromSession(session)).trim();

  if (options?.includeProjectDetail !== false) {
    try {
      const detail = await fetchProjectDetail(projectId, actorName || undefined);
      await cacheProjectDetail(APP_MODE, projectId, detail);
    } catch {
      // Keep existing cached detail if live fetch fails.
    }
  }

  if (options?.includeTreeTimelines !== false && trees.length) {
    for (const tree of trees) {
      if (!tree?.id || tree.id <= 0) continue;
      try {
        const payload = await fetchTreeTimeline(tree.id);
        const timelineTasks = Array.isArray((payload as { tasks?: unknown[] } | null | undefined)?.tasks)
          ? ((payload as { tasks?: unknown[] }).tasks || []).map((row) => normalizeTaskSummary(row as TaskSummary))
          : [];
        await Promise.all([
          cacheTreeTimeline(APP_MODE, tree.id, payload),
          cacheTreeTasks(APP_MODE, tree.id, timelineTasks),
        ]);
      } catch {
        // Tree-detail cache is best-effort.
      }
    }
  }

  if (options?.includeMapPack !== false) {
    const bounds = buildProjectBoundsFromTrees(trees);
    if (bounds) {
      try {
        await downloadOfflinePack({
          packName: projectOfflinePackName(projectId),
          bounds,
        });
      } catch {
        // The project remains usable even if map tiles cannot be warmed.
      }
    }
  }
};

export const syncGreenProjectCacheBundle = async (
  session: MobileSession,
  projectId: number,
  options?: {
    actorName?: string;
    includeProjectDetail?: boolean;
    includeTreeTimelines?: boolean;
    includeMapPack?: boolean;
  },
) => {
  const actorName = String(options?.actorName || actorNameFromSession(session)).trim();
  const [tasksResult, treesResult, custodiansResult, allocationsResult, workOrdersResult] = await Promise.allSettled([
    fetchTasks(projectId, actorName || undefined),
    fetchTrees(projectId, actorName || undefined),
    fetchProjectCustodians(projectId),
    fetchDistributionAllocations(projectId),
    fetchWorkOrders(projectId, actorName || undefined),
  ]);

  const trees =
    treesResult.status === "fulfilled"
      ? await hydrateTreePhotosForOffline(treesResult.value)
      : ([] as TreeSummary[]);

  await Promise.all([
    tasksResult.status === "fulfilled" ? cacheTasks(APP_MODE, projectId, tasksResult.value) : Promise.resolve(),
    treesResult.status === "fulfilled" ? cacheTrees(APP_MODE, projectId, trees) : Promise.resolve(),
    custodiansResult.status === "fulfilled" ? cacheCustodians(APP_MODE, projectId, custodiansResult.value) : Promise.resolve(),
    allocationsResult.status === "fulfilled"
      ? cacheDistributionAllocations(APP_MODE, projectId, allocationsResult.value)
      : Promise.resolve(),
    workOrdersResult.status === "fulfilled" ? cacheWorkOrders(APP_MODE, projectId, workOrdersResult.value) : Promise.resolve(),
  ]);

  if (treesResult.status === "fulfilled") {
    await warmGreenProjectOfflineSurfaces(session, projectId, trees, {
      actorName,
      includeProjectDetail: options?.includeProjectDetail,
      includeTreeTimelines: options?.includeTreeTimelines,
      includeMapPack: options?.includeMapPack,
    });
  } else if (options?.includeProjectDetail !== false) {
    try {
      const detail = await fetchProjectDetail(projectId, actorName || undefined);
      await cacheProjectDetail(APP_MODE, projectId, detail);
    } catch {
      // Keep existing cached detail if live fetch fails.
    }
  }

  const successful =
    Number(tasksResult.status === "fulfilled") +
    Number(treesResult.status === "fulfilled") +
    Number(custodiansResult.status === "fulfilled") +
    Number(allocationsResult.status === "fulfilled") +
    Number(workOrdersResult.status === "fulfilled");
  if (successful <= 0) {
    throw tasksResult.status === "rejected"
      ? tasksResult.reason
      : treesResult.status === "rejected"
        ? treesResult.reason
        : custodiansResult.status === "rejected"
          ? custodiansResult.reason
          : allocationsResult.status === "rejected"
            ? allocationsResult.reason
            : workOrdersResult.status === "rejected"
              ? workOrdersResult.reason
              : new Error("Failed to sync project cache.");
  }

  await updateLastSyncedAt(APP_MODE, new Date().toISOString());

  return {
    tasks: tasksResult.status === "fulfilled" ? tasksResult.value : ([] as TaskSummary[]),
    trees,
    workOrders: workOrdersResult.status === "fulfilled" ? workOrdersResult.value : ([] as WorkOrderSummary[]),
  };
};

export const cacheGreenWorkspaceIndex = async (
  session: MobileSession,
  options?: { includeUsers?: boolean },
) => {
  const actorName = actorNameFromSession(session);
  const [projects, users] = await Promise.all([
    fetchProjectsForFieldUser(session.user),
    options?.includeUsers === false ? Promise.resolve([] as Array<{ id: number; full_name: string; role?: string | null; role_name?: string | null }>) : fetchUsers(session.user.organization_id),
  ]);
  await Promise.all([
    cacheProjects(APP_MODE, projects),
    options?.includeUsers === false ? Promise.resolve() : cacheUsers(APP_MODE, users),
  ]);
  await updateLastSyncedAt(APP_MODE, new Date().toISOString());
  return { projects, users };
};

export const orderProjectsForSync = (
  projects: ProjectSummary[],
  priorityProjectId?: number | null,
  preferredProjectId?: number | null,
) => {
  const projectIds = projects.map((project) => Number(project.id)).filter((id) => Number.isFinite(id) && id > 0);
  const ordered: number[] = [];
  for (const candidate of [priorityProjectId, preferredProjectId]) {
    const next = Number(candidate || 0);
    if (next > 0 && projectIds.includes(next) && !ordered.includes(next)) {
      ordered.push(next);
    }
  }
  for (const projectId of projectIds) {
    if (!ordered.includes(projectId)) {
      ordered.push(projectId);
    }
  }
  return ordered;
};
