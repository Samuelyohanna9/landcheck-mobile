import * as BackgroundTask from "expo-background-task";
import * as Network from "expo-network";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { syncPendingGreenActions } from "../offline/greenSync";
import { cacheGreenWorkspaceIndex, orderProjectsForSync, syncGreenProjectCacheBundle } from "../offline/greenWorkspaceCache";
import { supportsNativeNotifications } from "../notifications/greenNotifications";
import { bootstrapLocalDatabase } from "../storage/database";
import { readStoredGreenSelectedProjectId } from "../storage/greenSelection";
import { loadSession } from "../storage/session";
import type { MobileSession } from "../types/domain";

const GREEN_BACKGROUND_NOTIFICATION_TASK = "green-background-notification-sync";
const GREEN_PERIODIC_BACKGROUND_TASK = "green-periodic-sync";
const GREEN_BACKGROUND_MIN_INTERVAL_MINUTES = 15;

let backgroundSyncPromise: Promise<boolean> | null = null;

const isAndroid = Platform.OS === "android";

type GreenNotificationPayload = {
  type?: string;
  project_id?: number | string | null;
  background_sync?: boolean | string | number | null;
  sync_scope?: string | null;
};

const allowedBackgroundSyncTypes = new Set([
  "task_assigned",
  "task_review_approved",
  "task_review_returned",
  "work_order_assigned",
  "work_order_target_increase",
]);

const parseNotificationProjectId = (value: unknown) => {
  const next = Number(value || 0);
  return Number.isFinite(next) && next > 0 ? next : null;
};

const parseNotificationFlag = (value: unknown) => {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
};

const decodeNotificationPayload = (payload: Notifications.NotificationTaskPayload) => {
  if ("actionIdentifier" in payload) {
    return null;
  }

  const base = (payload.data || {}) as Record<string, unknown>;
  const parsed = (() => {
    const raw = String(base.dataString || "").trim();
    if (!raw) return {} as Record<string, unknown>;
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      return value && typeof value === "object" ? value : ({} as Record<string, unknown>);
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const merged = {
    ...parsed,
    ...base,
  } as GreenNotificationPayload;
  const type = String(merged.type || "").trim().toLowerCase();
  return {
    type,
    projectId: parseNotificationProjectId(merged.project_id),
    backgroundSync: parseNotificationFlag(merged.background_sync) || allowedBackgroundSyncTypes.has(type),
  };
};

const withOnlineSession = async () => {
  if (!isAndroid) return null;
  const network = await Network.getNetworkStateAsync();
  const online = Boolean(network.isConnected && network.isInternetReachable !== false);
  if (!online) return null;
  const session = await loadSession();
  if (!session) return null;
  await bootstrapLocalDatabase();
  return session;
};

const runGreenBackgroundSync = async ({
  priorityProjectId,
}: {
  priorityProjectId?: number | null;
}) => {
  if (!isAndroid) return false;
  if (backgroundSyncPromise) return backgroundSyncPromise;

  backgroundSyncPromise = (async () => {
    const session = await withOnlineSession();
    if (!session) return false;

    await syncPendingGreenActions(session).catch(() => {});

    const preferredProjectId = await readStoredGreenSelectedProjectId(session.user.id);
    const { projects } = await cacheGreenWorkspaceIndex(session, { includeUsers: true });
    const orderedProjectIds = orderProjectsForSync(projects, priorityProjectId, preferredProjectId);
    for (const projectId of orderedProjectIds) {
      try {
        await syncGreenProjectCacheBundle(session, projectId, {
          includeProjectDetail: true,
          includeTreeTimelines: true,
          includeMapPack: true,
        });
      } catch {
        // Keep syncing the remaining projects.
      }
    }
    return true;
  })().finally(() => {
    backgroundSyncPromise = null;
  });

  return backgroundSyncPromise;
};

TaskManager.defineTask<Notifications.NotificationTaskPayload>(GREEN_BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
  const payload = decodeNotificationPayload(data);
  if (!payload?.backgroundSync) {
    return Notifications.BackgroundNotificationTaskResult.NoData;
  }
  const synced = await runGreenBackgroundSync({ priorityProjectId: payload.projectId });
  return synced
    ? Notifications.BackgroundNotificationTaskResult.NewData
    : Notifications.BackgroundNotificationTaskResult.NoData;
});

TaskManager.defineTask(GREEN_PERIODIC_BACKGROUND_TASK, async () => {
  const synced = await runGreenBackgroundSync({});
  return synced ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
});

export const ensureGreenBackgroundTasksRegistered = async (session: MobileSession | null) => {
  if (!isAndroid || !session) return;
  if (!supportsNativeNotifications()) return;
  try {
    await Notifications.registerTaskAsync(GREEN_BACKGROUND_NOTIFICATION_TASK);
  } catch {
    // Task registration is idempotent; keep going when already registered.
  }
  try {
    await BackgroundTask.registerTaskAsync(GREEN_PERIODIC_BACKGROUND_TASK, {
      minimumInterval: GREEN_BACKGROUND_MIN_INTERVAL_MINUTES,
    });
  } catch {
    // Task registration is idempotent; keep going when already registered.
  }
};

export const unregisterGreenBackgroundTasks = async () => {
  if (!isAndroid) return;
  if (!supportsNativeNotifications()) return;
  try {
    await Notifications.unregisterTaskAsync(GREEN_BACKGROUND_NOTIFICATION_TASK);
  } catch {
    // Ignore cleanup failures during sign-out.
  }
  try {
    await BackgroundTask.unregisterTaskAsync(GREEN_PERIODIC_BACKGROUND_TASK);
  } catch {
    // Ignore cleanup failures during sign-out.
  }
};

export const triggerGreenBackgroundSync = async (priorityProjectId?: number | null) =>
  runGreenBackgroundSync({ priorityProjectId });
