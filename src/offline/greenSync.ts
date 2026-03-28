import axios from "axios";
import type {
  GreenSyncProgress,
  GreenTaskMutationInput,
  GreenTreeCreateInput,
  GreenTreeUpdateInput,
  MobileSession,
  SyncQueueRow,
  TaskSummary,
  TreeSummary,
} from "../types/domain";
import {
  createGreenTree,
  fetchDistributionAllocations,
  fetchProjectCustodians,
  fetchProjects,
  fetchTasks,
  fetchTrees,
  fetchWorkOrders,
  submitGreenTask,
  updateGreenTask,
  updateGreenTree,
  uploadGreenPhoto,
} from "../api/green";
import {
  cacheCustodians,
  cacheDistributionAllocations,
  cacheProjects,
  cacheTasks,
  cacheTrees,
  cacheWorkOrders,
  deleteQueueItem,
  enqueueSyncAction,
  patchCachedTask,
  patchCachedTree,
  readSyncQueue,
  replaceCachedTree,
  setQueueItemStatus,
  updateLastSyncedAt,
  upsertCachedTree,
} from "../storage/database";
import { deleteStoredPhoto, persistDraftPhotos } from "./fileStore";
import { normalizePhotoList, normalizeTaskSummary, normalizeTreeSummary } from "../green/normalize";

const APP_MODE = "green";
const MAX_QUEUE_RETRIES = 5;
let syncPromise: Promise<{ synced: number; failed: number; conflicts: number; pending: number }> | null = null;

const describeQueueAction = (item: SyncQueueRow) => {
  switch (item.action_type) {
    case "create_tree":
      return "Sending saved tree";
    case "update_tree":
      return "Sending tree update";
    case "update_task":
      return "Sending task update";
    case "submit_task":
      return "Sending task submission";
    case "upload_tree_photos":
      return "Sending tree photo";
    case "upload_task_photos":
      return "Sending task photo";
    default:
      return "Sending saved work";
  }
};

const buildSyncProgress = ({
  total,
  completed,
  synced,
  failed,
  conflicts,
  currentLabel,
}: {
  total: number;
  completed: number;
  synced: number;
  failed: number;
  conflicts: number;
  currentLabel?: string | null;
}): GreenSyncProgress => ({
  active: total > 0,
  total,
  completed,
  synced,
  failed,
  conflicts,
  percent: total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0,
  currentLabel: currentLabel || null,
});

const nowIso = () => new Date().toISOString();

const normalizePhotoUrls = (values?: Array<string | null | undefined>) => normalizePhotoList(values);

const makeLocalTreeId = () => -1 * (Date.now() + Math.floor(Math.random() * 1000));

export const isLikelyOfflineError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    if (!error.response) return true;
    if (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK" || error.code === "ETIMEDOUT") return true;
    const message = String(error.message || "").toLowerCase();
    if (message.includes("network") || message.includes("timeout") || message.includes("abort")) return true;
    return false;
  }
  if (error instanceof TypeError) {
    const message = String(error.message || "").toLowerCase();
    return message.includes("network") || message.includes("fetch");
  }
  if (error instanceof Error) {
    const message = String(error.message || "").toLowerCase();
    return /failed|net::err_|networkerror|offline|abort/i.test(message);
  }
  return false;
};

const ensureFinite = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const uploadStoredPhotos = async ({
  photos,
  folder,
  treeId,
  taskId,
}: {
  photos: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>;
  folder: "trees" | "tasks";
  treeId?: number | null;
  taskId?: number | null;
}) => {
  const uploaded: string[] = [];
  for (const photo of photos) {
    const url = await uploadGreenPhoto({
      photo,
      folder,
      treeId,
      taskId,
    });
    if (url) uploaded.push(url);
    await deleteStoredPhoto(photo.uri);
  }
  return uploaded;
};

const refreshGreenCachesSafely = async (session: MobileSession, projectId?: number | null) => {
  try {
    await refreshGreenCaches(session, projectId);
  } catch {
    // A completed server mutation must not be retried only because cache refresh failed.
  }
};

const enqueueDeferredPhotoUpload = async ({
  projectId,
  folder,
  treeId,
  taskId,
  photos,
}: {
  projectId: number;
  folder: "trees" | "tasks";
  treeId?: number | null;
  taskId?: number | null;
  photos: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>;
}) => {
  if (!photos.length) return;
  await enqueueSyncAction({
    actionType: folder === "trees" ? "upload_tree_photos" : "upload_task_photos",
    projectId,
    treeId: treeId ?? null,
    taskId: taskId ?? null,
    payload: {
      projectId,
      treeId: treeId ?? null,
      taskId: taskId ?? null,
      photos,
    },
  });
};

export const refreshGreenCaches = async (session: MobileSession, projectId?: number | null) => {
  const actorName = String(session.user.full_name || "").trim();
  const [projects] = await Promise.all([fetchProjects(session.user.organization_id, actorName)]);
  await cacheProjects(APP_MODE, projects);

  if (projectId && projectId > 0) {
    const [tasks, trees, custodians, allocations, workOrders] = await Promise.all([
      fetchTasks(projectId, actorName),
      fetchTrees(projectId, actorName),
      fetchProjectCustodians(projectId),
      fetchDistributionAllocations(projectId),
      fetchWorkOrders(projectId, actorName),
    ]);
    await Promise.all([
      cacheTasks(APP_MODE, projectId, tasks),
      cacheTrees(APP_MODE, projectId, trees),
      cacheCustodians(APP_MODE, projectId, custodians),
      cacheDistributionAllocations(APP_MODE, projectId, allocations),
      cacheWorkOrders(APP_MODE, projectId, workOrders),
    ]);
  }
  await updateLastSyncedAt(APP_MODE, nowIso());
};

const optimisticTreeStatus = (input: GreenTreeCreateInput) =>
  input.treeOrigin === "existing_inventory" ? input.status || "healthy" : "pending_planting";

export const queueTreeCreation = async (session: MobileSession, input: GreenTreeCreateInput) => {
  const localTreeId = makeLocalTreeId();
  const storedPhotos = await persistDraftPhotos(input.photos || []);
  const optimisticTree = normalizeTreeSummary({
    id: localTreeId,
    project_id: input.projectId,
    species: input.species,
    planting_date: input.plantingDate || null,
    status: optimisticTreeStatus(input),
    notes: input.notes || "",
    created_by: session.user.full_name,
    tree_origin: input.treeOrigin || "new_planting",
    custodian_id: input.custodianId ?? null,
    tree_height_m: input.treeHeightM ?? null,
    tree_age_months: input.treeAgeMonths ?? null,
    inventory_tree_count: input.inventoryTreeCount ?? 1,
    existing_area_geojson: input.existingAreaGeojson ?? null,
    lng: input.lng,
    lat: input.lat,
    photo_urls: storedPhotos.map((photo) => photo.uri),
    photo_url: storedPhotos[0]?.uri || null,
    sync_state: "pending",
  });
  await upsertCachedTree(APP_MODE, input.projectId, optimisticTree);
  await enqueueSyncAction({
    actionType: "create_tree",
    projectId: input.projectId,
    treeId: localTreeId,
    payload: {
      ...input,
      localTreeId,
      createdBy: session.user.full_name,
      photos: storedPhotos,
    },
  });
  return optimisticTree;
};

export const queueTreeUpdate = async (input: GreenTreeUpdateInput) => {
  await patchCachedTree(APP_MODE, input.projectId, input.treeId, (tree) => ({
    ...tree,
    species: input.species ?? tree.species,
    planting_date: input.plantingDate ?? tree.planting_date,
    status: input.status ?? tree.status,
    notes: input.notes ?? tree.notes,
    lng: input.lng ?? tree.lng ?? null,
    lat: input.lat ?? tree.lat ?? null,
    tree_height_m: input.treeHeightM ?? tree.tree_height_m ?? null,
    tree_age_months: input.treeAgeMonths ?? tree.tree_age_months ?? null,
    custodian_id: input.custodianId ?? tree.custodian_id ?? null,
    inventory_tree_count: input.inventoryTreeCount ?? tree.inventory_tree_count ?? 1,
    existing_area_geojson: input.existingAreaGeojson ?? tree.existing_area_geojson ?? null,
    sync_state: "pending",
  }));
  await enqueueSyncAction({
    actionType: "update_tree",
    projectId: input.projectId,
    treeId: input.treeId,
    payload: input,
  });
};

const patchTaskForOffline = async ({
  input,
  reviewState,
  storedPhotos,
}: {
  input: GreenTaskMutationInput;
  reviewState?: string;
  storedPhotos: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>;
}) => {
  await patchCachedTask(APP_MODE, input.projectId, input.taskId, (task) => {
    const mergedPhotoUrls = normalizePhotoUrls([
      ...normalizePhotoList(task.photo_urls),
      ...storedPhotos.map((photo) => photo.uri),
    ]);
    const next = normalizeTaskSummary({
      ...task,
      status: input.status ?? (reviewState === "submitted" ? "done" : task.status),
      notes: input.notes ?? task.notes,
      reported_tree_status: input.treeStatus ?? task.reported_tree_status,
      tree_status: input.treeStatus ?? task.tree_status,
      activity_lat: input.activityLat ?? task.activity_lat ?? null,
      activity_lng: input.activityLng ?? task.activity_lng ?? null,
      activity_recorded_at: input.activityRecordedAt ?? task.activity_recorded_at ?? null,
      photo_urls: mergedPhotoUrls,
      photo_url: mergedPhotoUrls[0] || task.photo_url || null,
      review_state: reviewState ?? task.review_state,
      sync_state: "pending",
    });
    return next;
  });
};

export const queueTaskUpdate = async (input: GreenTaskMutationInput) => {
  const storedPhotos = await persistDraftPhotos(input.photos || []);
  await patchTaskForOffline({ input, storedPhotos });
  await enqueueSyncAction({
    actionType: "update_task",
    projectId: input.projectId,
    taskId: input.taskId,
    treeId: input.treeId,
    payload: {
      ...input,
      photos: storedPhotos,
    },
  });
};

export const queueTaskSubmit = async (input: GreenTaskMutationInput) => {
  const storedPhotos = await persistDraftPhotos(input.photos || []);
  await patchTaskForOffline({ input, reviewState: "submitted", storedPhotos });
  await enqueueSyncAction({
    actionType: "submit_task",
    projectId: input.projectId,
    taskId: input.taskId,
    treeId: input.treeId,
    payload: {
      ...input,
      photos: storedPhotos,
    },
  });
};

type CreateTreeQueuePayload = GreenTreeCreateInput & {
  createdBy: string;
  localTreeId: number;
  photos?: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>;
};

type TaskQueuePayload = GreenTaskMutationInput & {
  photos?: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>;
};

type DeferredPhotoUploadPayload = {
  projectId: number;
  treeId?: number | null;
  taskId?: number | null;
  photos?: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>;
};

const processQueueRow = async (session: MobileSession, item: SyncQueueRow) => {
  const payload = JSON.parse(item.payload || "{}") as Record<string, unknown>;

  if (item.action_type === "create_tree") {
    const body = payload as unknown as CreateTreeQueuePayload;
    const created = await createGreenTree({
      ...body,
      createdBy: body.createdBy,
    });
    if (body.photos?.length) {
      try {
        if (created.review_task_id) {
          await uploadStoredPhotos({
            photos: body.photos,
            folder: "tasks",
            taskId: Number(created.review_task_id),
          });
        } else if (created.id) {
          await uploadStoredPhotos({
            photos: body.photos,
            folder: "trees",
            treeId: Number(created.id),
          });
        }
      } catch (error) {
        if (!isLikelyOfflineError(error)) throw error;
        await enqueueDeferredPhotoUpload({
          projectId: body.projectId,
          folder: created.review_task_id ? "tasks" : "trees",
          taskId: created.review_task_id ? Number(created.review_task_id) : null,
          treeId: created.review_task_id ? null : Number(created.id || 0),
          photos: body.photos,
        });
      }
    }
    await replaceCachedTree(APP_MODE, body.projectId, body.localTreeId, {
      id: ensureFinite(created.id),
      project_id: body.projectId,
      project_tree_no: Number.isFinite(Number(created.project_tree_no)) ? Number(created.project_tree_no) : null,
      species: body.species,
      planting_date: body.plantingDate || null,
      status: String(created.status || optimisticTreeStatus(body)),
      notes: body.notes || "",
      created_by: session.user.full_name,
      tree_origin: body.treeOrigin || "new_planting",
      custodian_id: body.custodianId ?? null,
      tree_height_m: body.treeHeightM ?? null,
      tree_age_months: body.treeAgeMonths ?? null,
      inventory_tree_count: body.inventoryTreeCount ?? 1,
      existing_area_geojson: body.existingAreaGeojson ?? null,
      lng: body.lng,
      lat: body.lat,
      sync_state: "live",
    });
    await refreshGreenCachesSafely(session, body.projectId);
    return;
  }

  if (item.action_type === "update_tree") {
    const body = payload as unknown as GreenTreeUpdateInput;
    await updateGreenTree(body);
    await refreshGreenCachesSafely(session, body.projectId);
    return;
  }

  if (item.action_type === "update_task") {
    const body = payload as unknown as TaskQueuePayload;
    const uploadedPhotoUrls = body.photos?.length
      ? await uploadStoredPhotos({
          photos: body.photos,
          folder: "tasks",
          taskId: body.taskId,
        })
      : [];
    await updateGreenTask({
      ...body,
      photoUrls: uploadedPhotoUrls,
    });
    await refreshGreenCachesSafely(session, body.projectId);
    return;
  }

  if (item.action_type === "submit_task") {
    const body = payload as unknown as TaskQueuePayload;
    const uploadedPhotoUrls = body.photos?.length
      ? await uploadStoredPhotos({
          photos: body.photos,
          folder: "tasks",
          taskId: body.taskId,
        })
      : [];
    await submitGreenTask({
      ...body,
      photoUrls: uploadedPhotoUrls,
    });
    await refreshGreenCachesSafely(session, body.projectId);
    return;
  }

  if (item.action_type === "upload_tree_photos") {
    const body = payload as unknown as DeferredPhotoUploadPayload;
    if (body.photos?.length && body.treeId) {
      await uploadStoredPhotos({
        photos: body.photos,
        folder: "trees",
        treeId: body.treeId,
      });
    }
    await refreshGreenCachesSafely(session, body.projectId);
    return;
  }

  if (item.action_type === "upload_task_photos") {
    const body = payload as unknown as DeferredPhotoUploadPayload;
    if (body.photos?.length && body.taskId) {
      await uploadStoredPhotos({
        photos: body.photos,
        folder: "tasks",
        taskId: body.taskId,
      });
    }
    await refreshGreenCachesSafely(session, body.projectId);
  }
};

export const syncPendingGreenActions = async (
  session: MobileSession,
  onProgress?: (progress: GreenSyncProgress) => void,
) => {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const queue = await readSyncQueue(["pending", "failed"]);
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    let completed = 0;

    if (queue.length > 0) {
      onProgress?.(
        buildSyncProgress({
          total: queue.length,
          completed: 0,
          synced: 0,
          failed: 0,
          conflicts: 0,
          currentLabel: describeQueueAction(queue[0]),
        }),
      );
    }

    for (const item of queue) {
      onProgress?.(
        buildSyncProgress({
          total: queue.length,
          completed,
          synced,
          failed,
          conflicts,
          currentLabel: describeQueueAction(item),
        }),
      );
      try {
        await setQueueItemStatus(item.id, "syncing");
        await processQueueRow(session, item);
        await deleteQueueItem(item.id);
        synced += 1;
        completed += 1;
        onProgress?.(
          buildSyncProgress({
            total: queue.length,
            completed,
            synced,
            failed,
            conflicts,
            currentLabel: describeQueueAction(item),
          }),
        );
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          await setQueueItemStatus(item.id, item.status === "failed" ? "failed" : "pending", {
            lastError: axios.isAxiosError(error) ? error.message : "Offline",
            retryCount: Number(item.retry_count || 0),
          });
          onProgress?.(
            buildSyncProgress({
              total: queue.length,
              completed,
              synced,
              failed,
              conflicts,
              currentLabel: "Waiting for network",
            }),
          );
          break;
        }

        const statusCode = axios.isAxiosError(error) ? Number(error.response?.status || 0) : 0;
        const isConflict = statusCode === 409 || statusCode === 412;
        const detailText = axios.isAxiosError(error)
          ? String(error.response?.data?.detail || error.message || "Request failed")
          : error instanceof Error
            ? error.message
            : "Sync failed";

        if (isConflict) {
          await deleteQueueItem(item.id);
          conflicts += 1;
          completed += 1;
          onProgress?.(
            buildSyncProgress({
              total: queue.length,
              completed,
              synced,
              failed,
              conflicts,
              currentLabel: "Skipped an outdated item",
            }),
          );
          continue;
        }

        const nextRetries = Number(item.retry_count || 0) + 1;
        if (nextRetries >= MAX_QUEUE_RETRIES) {
          await deleteQueueItem(item.id);
          conflicts += 1;
          completed += 1;
        } else {
          failed += 1;
          await setQueueItemStatus(item.id, "failed", {
            lastError: detailText.slice(0, 500),
            retryCount: nextRetries,
          });
          completed += 1;
        }
        onProgress?.(
          buildSyncProgress({
            total: queue.length,
            completed,
            synced,
            failed,
            conflicts,
            currentLabel: "A saved item needs another try",
          }),
        );
      }
    }

    const pending = (await readSyncQueue(["pending", "failed", "syncing"])).length;
    return { synced, failed, conflicts, pending };
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
};

export const runTaskMutation = async (
  session: MobileSession,
  input: GreenTaskMutationInput,
  mode: "update" | "submit",
) => {
  const storedPhotos = await persistDraftPhotos(input.photos || []);
  const uploadedPhotoUrls = storedPhotos.length
    ? await uploadStoredPhotos({
        photos: storedPhotos,
        folder: "tasks",
        taskId: input.taskId,
      })
    : [];

  if (mode === "submit") {
    await submitGreenTask({
      ...input,
      photoUrls: uploadedPhotoUrls,
    });
  } else {
    await updateGreenTask({
      ...input,
      photoUrls: uploadedPhotoUrls,
    });
  }

  await refreshGreenCachesSafely(session, input.projectId);
};

export const runTreeCreation = async (session: MobileSession, input: GreenTreeCreateInput) => {
  const created = await createGreenTree({
    ...input,
    createdBy: session.user.full_name,
  });
  const storedPhotos = await persistDraftPhotos(input.photos || []);
  let photoLinked = true;
  if (storedPhotos.length) {
    try {
      if (created.review_task_id) {
        await uploadStoredPhotos({
          photos: storedPhotos,
          folder: "tasks",
          taskId: Number(created.review_task_id),
        });
      } else if (created.id) {
        await uploadStoredPhotos({
          photos: storedPhotos,
          folder: "trees",
          treeId: Number(created.id),
        });
      }
    } catch (error) {
      photoLinked = false;
      if (isLikelyOfflineError(error)) {
        await enqueueDeferredPhotoUpload({
          projectId: input.projectId,
          folder: created.review_task_id ? "tasks" : "trees",
          taskId: created.review_task_id ? Number(created.review_task_id) : null,
          treeId: created.review_task_id ? null : Number(created.id || 0),
          photos: storedPhotos,
        });
      }
    }
  }
  await refreshGreenCachesSafely(session, input.projectId);
  return { created, photoLinked };
};

export const runTreeUpdate = async (session: MobileSession, input: GreenTreeUpdateInput) => {
  await updateGreenTree(input);
  await refreshGreenCachesSafely(session, input.projectId);
};
