import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getErrorMessage } from "../api/client";
import {
  deleteGreenTree,
  fetchDistributionAllocations,
  fetchProjectCustodians,
  fetchProjectsForFieldUser,
  fetchTasks,
  fetchTrees,
  fetchUsers,
  fetchWorkOrders,
} from "../api/green";
import { useAuth } from "./AuthContext";
import {
  cacheCustodians,
  cacheDistributionAllocations,
  cacheProjects,
  cacheProjectDetail,
  cacheTasks,
  cacheTrees,
  cacheUsers,
  cacheWorkOrders,
  getOfflineStats,
  patchCachedTask,
  readCachedProjectDetail,
  readCachedCustodians,
  readCachedDistributionAllocations,
  readCachedProjects,
  readCachedTasks,
  readCachedTrees,
  readCachedUsers,
  readCachedWorkOrders,
} from "../storage/database";
import type {
  CustodianSummary,
  DistributionAllocationSummary,
  GreenSyncProgress,
  GreenTaskMutationInput,
  GreenTreeCreateInput,
  GreenTreeUpdateInput,
  OfflineStats,
  ProjectSummary,
  TaskSummary,
  TreeSummary,
  WorkOrderSummary,
} from "../types/domain";
import {
  isLikelyOfflineError,
  queueTaskSubmit,
  queueTaskUpdate,
  queueTreeCreation,
  queueTreeUpdate,
  refreshGreenCaches,
  runTaskMutation,
  runTreeCreation,
  runTreeUpdate,
  syncPendingGreenActions,
} from "../offline/greenSync";
import { hydrateTreePhotosForOffline } from "../offline/treePhotoCache";
import { warmGreenProjectOfflineSurfaces } from "../offline/greenWorkspaceCache";
import { pushGreenNotification, requestGreenNotificationPermission } from "../notifications/greenNotifications";
import { readStoredGreenSelectedProjectId, writeStoredGreenSelectedProjectId } from "../storage/greenSelection";
import { isAgricProject } from "../green/projectProfile";

type UserSummary = { id: number; full_name: string; role?: string | null; role_name?: string | null };

type TaskNotificationSnapshot = {
  id: number;
  status: string;
  reviewState: string;
  dueDate: string;
  priority: string;
};

type WorkOrderNotificationSnapshot = {
  id: number;
  workType: string;
  status: string;
  targetTrees: number;
  dueDate: string;
  maintenanceSchedule: string;
  areaEnabled: boolean;
  areaLabel: string;
};

type MutationResult = {
  queued: boolean;
  message: string;
};

type TreeCreateProgressState = {
  current: number;
  total: number;
  message: string;
};

type GreenSyncContextValue = {
  projects: ProjectSummary[];
  tasks: TaskSummary[];
  trees: TreeSummary[];
  users: UserSummary[];
  custodians: CustodianSummary[];
  workOrders: WorkOrderSummary[];
  distributionAllocations: DistributionAllocationSummary[];
  selectedProjectId: number | null;
  selectedProject: ProjectSummary | null;
  matchedCustodian: CustodianSummary | null;
  loading: boolean;
  refreshing: boolean;
  syncing: boolean;
  isOnline: boolean;
  isCustodianUser: boolean;
  isOrgPaused: boolean;
  offlineStats: OfflineStats;
  error: string;
  syncNotice: string;
  syncProgress: GreenSyncProgress;
  selectProject: (projectId: number) => Promise<void>;
  refreshAll: () => Promise<void>;
  syncNow: () => Promise<void>;
  createTree: (input: GreenTreeCreateInput, options?: { onProgress?: (progress: TreeCreateProgressState) => void }) => Promise<MutationResult>;
  updateTree: (input: GreenTreeUpdateInput) => Promise<MutationResult>;
  deleteTree: (input: { projectId: number; treeId: number }) => Promise<MutationResult>;
  saveTaskUpdate: (input: GreenTaskMutationInput) => Promise<MutationResult>;
  submitTask: (input: GreenTaskMutationInput) => Promise<MutationResult>;
  clearError: () => void;
};

const emptyStats: OfflineStats = {
  queued: 0,
  failed: 0,
  cachedProjects: 0,
  cachedTasks: 0,
  cachedTrees: 0,
  lastSyncedAt: null,
};

const emptySyncProgress: GreenSyncProgress = {
  active: false,
  total: 0,
  completed: 0,
  synced: 0,
  failed: 0,
  conflicts: 0,
  percent: 0,
  currentLabel: null,
};

const GreenSyncContext = createContext<GreenSyncContextValue | null>(null);

const normalizeName = (value?: string | null) => String(value || "").trim().toLowerCase();
const normalizeStateKey = (value?: string | null) => String(value || "").trim().toLowerCase();

const createTaskNotificationSnapshot = (task: TaskSummary): TaskNotificationSnapshot => ({
  id: Number(task.id || 0),
  status: normalizeStateKey(task.status),
  reviewState: normalizeStateKey(task.review_state),
  dueDate: String(task.due_date || "").trim(),
  priority: normalizeStateKey(task.priority),
});

const createTaskSnapshotMap = (rows: TaskSummary[]) =>
  new Map<number, TaskNotificationSnapshot>(
    rows
      .map(createTaskNotificationSnapshot)
      .filter((row) => row.id > 0)
      .map((row) => [row.id, row]),
  );

const createWorkOrderNotificationSnapshot = (row: WorkOrderSummary): WorkOrderNotificationSnapshot => ({
  id: Number(row.id || 0),
  workType: normalizeStateKey(row.work_type),
  status: normalizeStateKey(row.status || "assigned"),
  targetTrees: Math.max(0, Number(row.target_trees || 0)),
  dueDate: String(row.due_date || "").trim(),
  maintenanceSchedule: String(row.maintenance_schedule || "").trim(),
  areaEnabled: Boolean(row.area_enabled),
  areaLabel: String(row.area_label || "").trim(),
});

const createWorkOrderSnapshotMap = (rows: WorkOrderSummary[]) =>
  new Map<number, WorkOrderNotificationSnapshot>(
    rows
      .map(createWorkOrderNotificationSnapshot)
      .filter((row) => row.id > 0)
      .map((row) => [row.id, row]),
  );

const isReturnedReviewState = (reviewState: string) => reviewState === "rejected" || reviewState === "metadata_edit";
const isClosedWorkOrderStatus = (status: string) => ["done", "completed", "closed", "cancelled"].includes(status);

export const GreenSyncProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const sponsorSession = Boolean(session && (session.auth_mode === "sponsor_user" || session.appMode === "green_sponsor"));
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [custodians, setCustodians] = useState<CustodianSummary[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderSummary[]>([]);
  const [distributionAllocations, setDistributionAllocations] = useState<DistributionAllocationSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [offlineStats, setOfflineStats] = useState<OfflineStats>(emptyStats);
  const [error, setError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [syncProgress, setSyncProgress] = useState<GreenSyncProgress>(emptySyncProgress);
  const projectsRef = useRef<ProjectSummary[]>([]);
  const taskSnapshotRef = useRef<Map<number, TaskNotificationSnapshot>>(new Map());
  const orderSnapshotRef = useRef<Map<number, WorkOrderNotificationSnapshot>>(new Map());
  const suppressedTaskNotificationIdsRef = useRef<Set<number>>(new Set());
  const taskNotifyPrimedRef = useRef(false);
  const orderNotifyPrimedRef = useRef(false);
  const initialAutoSyncRef = useRef(false);
  const backgroundPrefetchKeyRef = useRef("");
  const backgroundPrefetchRunningRef = useRef(false);
  const refreshAllInFlightRef = useRef(false);
  const liveProjectRefreshInFlightRef = useRef(false);
  const wasOnlineRef = useRef<boolean | null>(null);

  const refreshStats = useCallback(async () => {
    const stats = await getOfflineStats("green");
    setOfflineStats(stats);
    return stats;
  }, []);

  const loadCachedProjectLists = useCallback(async () => {
    const cachedProjects = await readCachedProjects("green");
    projectsRef.current = cachedProjects;
    setProjects(cachedProjects);
    return cachedProjects;
  }, []);

  const loadCachedProjectData = useCallback(async (projectId: number) => {
    const [cachedTasks, cachedTrees, cachedCustodians, cachedAllocations, cachedWorkOrders] = await Promise.all([
      readCachedTasks("green", projectId),
      readCachedTrees("green", projectId),
      readCachedCustodians("green", projectId),
      readCachedDistributionAllocations("green", projectId),
      readCachedWorkOrders("green", projectId),
    ]);
    setTasks(cachedTasks);
    setTrees(cachedTrees);
    setCustodians(cachedCustodians);
    setDistributionAllocations(cachedAllocations);
    setWorkOrders(cachedWorkOrders);
  }, []);

  const loadLiveProjectData = useCallback(
    async (projectId: number) => {
      if (!session) return;
      const actorName = String(session.user.full_name || "").trim();
      const syncingProject = projectsRef.current.find((project) => Number(project.id) === Number(projectId)) || null;
      const agricMode = isAgricProject(syncingProject);
      const [cachedTasks, cachedTrees, cachedCustodians, cachedAllocations, cachedWorkOrders] = await Promise.all([
        readCachedTasks("green", projectId),
        readCachedTrees("green", projectId),
        readCachedCustodians("green", projectId),
        readCachedDistributionAllocations("green", projectId),
        readCachedWorkOrders("green", projectId),
      ]);

      const [tasksResult, treesResult, custodiansResult, allocationsResult, workOrdersResult] = await Promise.allSettled([
        fetchTasks(projectId, actorName),
        fetchTrees(projectId, actorName),
        fetchProjectCustodians(projectId),
        fetchDistributionAllocations(projectId),
        fetchWorkOrders(projectId, actorName),
      ]);

      const [nextTasks, nextTreesRaw, nextCustodians, nextAllocations, nextWorkOrders] = await Promise.all([
        tasksResult.status === "fulfilled" ? Promise.resolve(tasksResult.value) : Promise.resolve(cachedTasks),
        treesResult.status === "fulfilled" ? Promise.resolve(treesResult.value) : Promise.resolve(cachedTrees),
        custodiansResult.status === "fulfilled" ? Promise.resolve(custodiansResult.value) : Promise.resolve(cachedCustodians),
        allocationsResult.status === "fulfilled" ? Promise.resolve(allocationsResult.value) : Promise.resolve(cachedAllocations),
        workOrdersResult.status === "fulfilled" ? Promise.resolve(workOrdersResult.value) : Promise.resolve(cachedWorkOrders),
      ]);
      const nextTrees = await hydrateTreePhotosForOffline(nextTreesRaw);

      if (tasksResult.status === "fulfilled") {
        const previousTaskSnapshots = taskNotifyPrimedRef.current ? taskSnapshotRef.current : createTaskSnapshotMap(cachedTasks);
        const nextTaskSnapshots = createTaskSnapshotMap(nextTasks);
        if (taskNotifyPrimedRef.current || previousTaskSnapshots.size > 0) {
          let newTaskCount = 0;
          let approvedTaskCount = 0;
          let returnedTaskCount = 0;
          let updatedTaskCount = 0;

          nextTaskSnapshots.forEach((nextTask, id) => {
            const previousTask = previousTaskSnapshots.get(id);
            if (!previousTask) {
              // A task can be brand new to this snapshot yet already submitted/approved -
              // e.g. a field agent's "quick capture" flow creates the task row and submits it
              // in the same action, so the very first time the client sees that task id it
              // already has review_state 'submitted'. Only a still-untouched ('none') task is
              // a genuine fresh assignment worth notifying about; otherwise the agent's own
              // submission was firing a false "assigned to you" notification back at them.
              if (nextTask.reviewState === "none") {
                newTaskCount += 1;
              }
              return;
            }
            if (suppressedTaskNotificationIdsRef.current.has(id)) {
              suppressedTaskNotificationIdsRef.current.delete(id);
              return;
            }
            if (previousTask.reviewState !== nextTask.reviewState) {
              if (nextTask.reviewState === "approved") {
                approvedTaskCount += 1;
                return;
              }
              if (isReturnedReviewState(nextTask.reviewState)) {
                returnedTaskCount += 1;
                return;
              }
            }
            if (
              previousTask.status !== nextTask.status ||
              previousTask.dueDate !== nextTask.dueDate ||
              previousTask.priority !== nextTask.priority
            ) {
              updatedTaskCount += 1;
            }
          });

          if (newTaskCount > 0) {
            void pushGreenNotification(
              "Task assigned",
              `${newTaskCount} new task${newTaskCount === 1 ? "" : "s"} assigned to you.`,
            );
          }
          if (approvedTaskCount > 0) {
            void pushGreenNotification(
              "Task approved",
              `${approvedTaskCount} submitted task${approvedTaskCount === 1 ? "" : "s"} approved by your supervisor.`,
            );
          }
          if (returnedTaskCount > 0) {
            void pushGreenNotification(
              "Task returned",
              `${returnedTaskCount} task${returnedTaskCount === 1 ? "" : "s"} returned for changes or metadata update.`,
            );
          }
          if (updatedTaskCount > 0) {
            void pushGreenNotification(
              "Task updated",
              `${updatedTaskCount} assigned task${updatedTaskCount === 1 ? "" : "s"} updated.`,
            );
          }
        }
        taskSnapshotRef.current = nextTaskSnapshots;
        taskNotifyPrimedRef.current = true;
      }

      if (workOrdersResult.status === "fulfilled") {
        const previousOrderSnapshots = orderNotifyPrimedRef.current ? orderSnapshotRef.current : createWorkOrderSnapshotMap(cachedWorkOrders);
        const nextOrderSnapshots = createWorkOrderSnapshotMap(nextWorkOrders);
        if (orderNotifyPrimedRef.current || previousOrderSnapshots.size > 0) {
          let newPlantingOrderCount = 0;
          let newMaintenanceOrderCount = 0;
          let plantingTargetIncrease = 0;
          let updatedOrderCount = 0;

          nextOrderSnapshots.forEach((nextOrder, id) => {
            const previousOrder = previousOrderSnapshots.get(id);
            if (!previousOrder) {
              // Same reasoning as the task snapshot above: a work order can appear for the
              // first time already closed out, so only notify "assigned" when it's still open.
              if (!isClosedWorkOrderStatus(nextOrder.status)) {
                if (nextOrder.workType === "planting") {
                  newPlantingOrderCount += 1;
                } else {
                  newMaintenanceOrderCount += 1;
                }
              }
              return;
            }

            const targetDelta = nextOrder.targetTrees - previousOrder.targetTrees;
            if (
              nextOrder.workType === "planting" &&
              targetDelta > 0 &&
              !isClosedWorkOrderStatus(nextOrder.status)
            ) {
              plantingTargetIncrease += targetDelta;
            }

            if (
              previousOrder.status !== nextOrder.status ||
              previousOrder.dueDate !== nextOrder.dueDate ||
              previousOrder.maintenanceSchedule !== nextOrder.maintenanceSchedule ||
              previousOrder.areaEnabled !== nextOrder.areaEnabled ||
              previousOrder.areaLabel !== nextOrder.areaLabel
            ) {
              updatedOrderCount += 1;
            }
          });

          if (newPlantingOrderCount > 0) {
            void pushGreenNotification(
              "Planting order assigned",
              `${newPlantingOrderCount} new planting order${newPlantingOrderCount === 1 ? "" : "s"} assigned to you.`,
            );
          }
          if (plantingTargetIncrease > 0) {
            void pushGreenNotification(
              "Planting target increased",
              `Your assigned planting target increased by ${plantingTargetIncrease} tree${plantingTargetIncrease === 1 ? "" : "s"}.`,
            );
          }
          if (newMaintenanceOrderCount > 0) {
            void pushGreenNotification(
              agricMode ? "Field visit assigned" : "Maintenance order assigned",
              agricMode
                ? `${newMaintenanceOrderCount} new field visit${newMaintenanceOrderCount === 1 ? "" : "s"} assigned to you.`
                : `${newMaintenanceOrderCount} new maintenance order${newMaintenanceOrderCount === 1 ? "" : "s"} assigned to you.`,
            );
          }
          if (updatedOrderCount > 0) {
            void pushGreenNotification(
              "Work order updated",
              `${updatedOrderCount} assigned work order${updatedOrderCount === 1 ? "" : "s"} updated.`,
            );
          }
        }
        orderSnapshotRef.current = nextOrderSnapshots;
        orderNotifyPrimedRef.current = true;
      }

      await Promise.all([
        tasksResult.status === "fulfilled" ? cacheTasks("green", projectId, nextTasks) : Promise.resolve(),
        treesResult.status === "fulfilled" ? cacheTrees("green", projectId, nextTrees) : Promise.resolve(),
        custodiansResult.status === "fulfilled" ? cacheCustodians("green", projectId, nextCustodians) : Promise.resolve(),
        allocationsResult.status === "fulfilled" ? cacheDistributionAllocations("green", projectId, nextAllocations) : Promise.resolve(),
        workOrdersResult.status === "fulfilled" ? cacheWorkOrders("green", projectId, nextWorkOrders) : Promise.resolve(),
      ]);

      setTasks(nextTasks);
      setTrees(nextTrees);
      setCustodians(nextCustodians);
      setDistributionAllocations(nextAllocations);
      setWorkOrders(nextWorkOrders);
      void warmGreenProjectOfflineSurfaces(session, projectId, nextTrees, {
        actorName,
        includeProjectDetail: true,
        includeTreeTimelines: true,
        includeMapPack: true,
      }).catch(() => {});

      if (
        tasksResult.status === "rejected" &&
        treesResult.status === "rejected" &&
        custodiansResult.status === "rejected" &&
        allocationsResult.status === "rejected" &&
        workOrdersResult.status === "rejected"
      ) {
        throw tasksResult.reason ?? treesResult.reason ?? custodiansResult.reason ?? allocationsResult.reason ?? workOrdersResult.reason ?? new Error("Failed to load project data.");
      }
    },
    [session],
  );

  const prefetchProjectsInBackground = useCallback(
    async (projectItems: ProjectSummary[], currentProjectId?: number | null) => {
      if (!session || !isOnline || backgroundPrefetchRunningRef.current) return;
      const projectIds = projectItems
        .map((item) => Number(item.id))
        .filter((id) => Number.isFinite(id) && id > 0 && id !== Number(currentProjectId || 0));
      if (!projectIds.length) return;

      const prefetchKey = projectIds.join(",");
      if (backgroundPrefetchKeyRef.current === prefetchKey) return;

      backgroundPrefetchRunningRef.current = true;
      backgroundPrefetchKeyRef.current = prefetchKey;
      try {
        const actorName = String(session.user.full_name || "").trim();
        for (const projectId of projectIds) {
          if (!isOnline) break;
          const [tasks, treesRaw, custodians, allocations, workOrders] = await Promise.all([
            fetchTasks(projectId, actorName),
            fetchTrees(projectId, actorName),
            fetchProjectCustodians(projectId),
            fetchDistributionAllocations(projectId),
            fetchWorkOrders(projectId, actorName),
          ]);
          const trees = await hydrateTreePhotosForOffline(treesRaw);
          await Promise.all([
            cacheTasks("green", projectId, tasks),
            cacheTrees("green", projectId, trees),
            cacheCustodians("green", projectId, custodians),
            cacheDistributionAllocations("green", projectId, allocations),
            cacheWorkOrders("green", projectId, workOrders),
          ]);
          await warmGreenProjectOfflineSurfaces(session, projectId, trees, {
            actorName,
            includeProjectDetail: true,
            includeTreeTimelines: true,
            includeMapPack: true,
          });
        }
      } catch {
        // Keep the current project usable even if background prefetch fails.
      } finally {
        backgroundPrefetchRunningRef.current = false;
        void refreshStats().catch(() => {});
      }
    },
    [isOnline, refreshStats, session],
  );

  const pickProjectId = useCallback(
    (items: ProjectSummary[], preferred?: number | null) => {
      if (preferred && items.some((item) => item.id === preferred)) return preferred;
      if (selectedProjectId && items.some((item) => item.id === selectedProjectId)) return selectedProjectId;
      return items[0]?.id ?? null;
    },
    [selectedProjectId],
  );

  const refreshAll = useCallback(async () => {
    // Guards against overlapping reloads: an unstable connection can fire the network-state
    // listener many times in quick succession, and without this a second refresh could start
    // before the first resolves, race it, and clobber fresh state with stale results.
    if (refreshAllInFlightRef.current) return;
    refreshAllInFlightRef.current = true;
    try {
      if (sponsorSession) {
        projectsRef.current = [];
        setProjects([]);
        setTasks([]);
        setTrees([]);
        setUsers([]);
        setCustodians([]);
        setDistributionAllocations([]);
        setWorkOrders([]);
        setSelectedProjectId(null);
        setOfflineStats(emptyStats);
        setSyncNotice("");
        setError("");
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!session) {
        setLoading(false);
        return;
      }
      setRefreshing(true);
      setLoading(true);
      setError("");
      try {
        const network = await Network.getNetworkStateAsync();
        const online = Boolean(network.isConnected && network.isInternetReachable !== false);
        setIsOnline(online);
        const storedProjectId = await readStoredGreenSelectedProjectId(session.user.id);

        const [cachedProjects, cachedUsers] = await Promise.all([loadCachedProjectLists(), readCachedUsers("green")]);
        setUsers(cachedUsers as UserSummary[]);
        const fallbackProjectId = pickProjectId(cachedProjects, storedProjectId);
        if (fallbackProjectId) {
          setSelectedProjectId(fallbackProjectId);
          await writeStoredGreenSelectedProjectId(session.user.id, fallbackProjectId);
          await loadCachedProjectData(fallbackProjectId);
        }

        if (!online) {
          setSyncNotice("Offline mode: showing cached projects, trees, tasks, and field setup.");
          await refreshStats();
          return;
        }

        const actorName = String(session.user.full_name || "").trim();
        const [liveProjects, liveUsers] = await Promise.all([
          fetchProjectsForFieldUser(session.user),
          fetchUsers(session.user.organization_id),
        ]);
        await Promise.all([cacheProjects("green", liveProjects), cacheUsers("green", liveUsers)]);
        projectsRef.current = liveProjects;
        setProjects(liveProjects);
        setUsers(liveUsers);

        const nextProjectId = pickProjectId(liveProjects, storedProjectId ?? fallbackProjectId);
        setSelectedProjectId(nextProjectId);
        if (nextProjectId) {
          await writeStoredGreenSelectedProjectId(session.user.id, nextProjectId);
          await loadLiveProjectData(nextProjectId);
          void prefetchProjectsInBackground(liveProjects, nextProjectId);
        } else {
          setTasks([]);
          setTrees([]);
          setCustodians([]);
          setDistributionAllocations([]);
          setWorkOrders([]);
          void prefetchProjectsInBackground(liveProjects, null);
        }
        await refreshStats();
        setSyncNotice("");
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load Green mobile data."));
        await refreshStats();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    } finally {
      refreshAllInFlightRef.current = false;
    }
  }, [loadCachedProjectData, loadCachedProjectLists, loadLiveProjectData, pickProjectId, prefetchProjectsInBackground, refreshStats, session, sponsorSession]);

  const selectProject = useCallback(
    async (projectId: number) => {
      if (sponsorSession) return;
      setSelectedProjectId(projectId);
      if (session) {
        await writeStoredGreenSelectedProjectId(session.user.id, projectId);
      }
      await loadCachedProjectData(projectId);
      if (!session || !isOnline) return;
      try {
        await loadLiveProjectData(projectId);
        await refreshStats();
      } catch {
        // Keep cached state when live refresh fails.
      }
    },
    [isOnline, loadCachedProjectData, loadLiveProjectData, refreshStats, session, sponsorSession],
  );

  const syncNow = useCallback(async () => {
    if (sponsorSession || !session || !isOnline || syncing) return;
    setSyncing(true);
    setError("");
    setSyncProgress(emptySyncProgress);
    try {
      const result = await syncPendingGreenActions(session, (progress) => {
        setSyncProgress(progress);
        if (progress.total > 0) {
          setSyncNotice(`Sending saved work: ${Math.min(progress.completed, progress.total)} of ${progress.total}.`);
        }
      });
      await refreshGreenCaches(session, selectedProjectId);
      const refreshedProjects = await loadCachedProjectLists();
      if (selectedProjectId) {
        await loadCachedProjectData(selectedProjectId);
      } else {
        const nextProjectId = pickProjectId(refreshedProjects);
        if (nextProjectId) {
          setSelectedProjectId(nextProjectId);
          await loadCachedProjectData(nextProjectId);
        }
      }
      if (selectedProjectId) {
        try {
          await loadLiveProjectData(selectedProjectId);
          void prefetchProjectsInBackground(refreshedProjects, selectedProjectId);
        } catch {
          // Keep cached state if live refresh fails.
        }
      } else {
        const nextProjectId = pickProjectId(refreshedProjects);
        if (nextProjectId) {
          try {
            await loadLiveProjectData(nextProjectId);
            void prefetchProjectsInBackground(refreshedProjects, nextProjectId);
          } catch {
            // Keep cached state if live refresh fails.
          }
        }
      }
      await refreshStats();
      const parts: string[] = [];
      if (result.synced > 0) parts.push(`Sent ${result.synced} item${result.synced === 1 ? "" : "s"}`);
      if (result.conflicts > 0) parts.push(`${result.conflicts} older item${result.conflicts === 1 ? "" : "s"} skipped`);
      if (result.pending > 0) parts.push(`${result.pending} still waiting to send`);
      setSyncNotice(
        parts.length > 0
          ? parts.join(". ") + "."
          : "Everything you recorded has been sent.",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to sync offline queue."));
    } finally {
      setSyncing(false);
      setSyncProgress(emptySyncProgress);
    }
  }, [
    isOnline,
    loadCachedProjectData,
    loadCachedProjectLists,
    loadLiveProjectData,
    pickProjectId,
    prefetchProjectsInBackground,
    refreshStats,
    selectedProjectId,
    session,
    sponsorSession,
    syncing,
  ]);

  const isOrgPaused = useMemo(() => {
    if (!session || sponsorSession || session.auth_mode === "env_admin") return false;
    const status = String(session.user.organization_status || "").toLowerCase();
    return status === "paused" || status === "read_only";
  }, [session, sponsorSession]);

  const refreshProjectAfterMutation = useCallback(
    async (projectId: number, mode: "live" | "cached") => {
      try {
        if (selectedProjectId === projectId) {
          if (mode === "live") {
            await loadLiveProjectData(projectId);
          } else {
            await loadCachedProjectData(projectId);
          }
        }
      } catch {
        // Do not treat cache refresh as a failed mutation.
      }

      try {
        await refreshStats();
      } catch {
        // Stats refresh is non-critical.
      }
    },
    [loadCachedProjectData, loadLiveProjectData, refreshStats, selectedProjectId],
  );

  const refreshSelectedProjectLive = useCallback(async () => {
    if (!session || !isOnline || !selectedProjectId) return;
    if (liveProjectRefreshInFlightRef.current) return;
    liveProjectRefreshInFlightRef.current = true;
    try {
      await loadLiveProjectData(selectedProjectId);
      await refreshStats();
    } catch {
      // Keep current state when background refresh fails.
    } finally {
      liveProjectRefreshInFlightRef.current = false;
    }
  }, [isOnline, loadLiveProjectData, refreshStats, selectedProjectId, session]);

  const applyTaskLocalPatch = useCallback(
    async (
      projectId: number,
      taskId: number,
      patcher: (task: TaskSummary) => TaskSummary,
    ) => {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? patcher(task) : task)));
      try {
        await patchCachedTask("green", projectId, taskId, patcher);
      } catch {
        // Cached patch is best-effort; live refresh still follows.
      }
    },
    [],
  );

  const createTree = useCallback(
    async (
      input: GreenTreeCreateInput,
      options?: { onProgress?: (progress: TreeCreateProgressState) => void },
    ): Promise<MutationResult> => {
      if (!session || sponsorSession) throw new Error("Field session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      try {
        if (!isOnline) throw new Error("offline");
        const { created, photoLinked } = await runTreeCreation(session, input, options);
        await refreshProjectAfterMutation(input.projectId, "live");
        const hasReviewTask = Number(created.review_task_id || 0) > 0;
        const hasPhotos = Array.isArray(input.photos) && input.photos.length > 0;
        const isAgricRecord = Boolean(input.recordProfileData && Object.keys(input.recordProfileData).length);
        const message =
          isAgricRecord
            ? hasReviewTask
              ? photoLinked
                ? hasPhotos
                  ? "Plot submitted for supervisor review with photos attached."
                  : "Plot submitted for supervisor review."
                : "Plot submitted for supervisor review. Photo upload failed."
              : photoLinked
                ? hasPhotos
                  ? "Plot saved live with photos attached."
                  : "Plot saved live."
                : "Plot saved live. Photo upload failed."
            : input.treeOrigin === "existing_inventory"
            ? hasReviewTask
              ? photoLinked
                ? hasPhotos
                  ? "Existing tree submitted for supervisor review with photos attached."
                  : "Existing tree submitted for supervisor review."
                : "Existing tree submitted for supervisor review. Photo upload failed."
              : photoLinked
                ? hasPhotos
                  ? "Existing tree saved with photos attached."
                  : "Existing tree saved."
                : "Existing tree saved. Photo upload failed."
            : hasReviewTask
              ? photoLinked
                ? hasPhotos
                  ? "Tree submitted for supervisor review with photos attached."
                  : "Tree submitted for supervisor review."
                : "Tree submitted for supervisor review. Photo upload failed."
              : photoLinked
                ? hasPhotos
                  ? "Tree saved live with photos attached."
                  : "Tree saved live."
                : "Tree saved live. Photo upload failed.";
        setSyncNotice(message);
        return { queued: false, message };
      } catch (err) {
        if (!isLikelyOfflineError(err) && !(err instanceof Error && err.message === "offline")) {
          throw err;
        }
        const optimisticTree = await queueTreeCreation(session, input);
        if (selectedProjectId === input.projectId) {
          setTrees((prev) => [optimisticTree, ...prev.filter((item) => item.id !== optimisticTree.id)]);
        }
        await refreshProjectAfterMutation(input.projectId, "cached");
        if (input.recordProfileData && Object.keys(input.recordProfileData).length) {
          setSyncNotice("Plot capture queued offline and will sync with photos automatically when the network is stable.");
          return { queued: true, message: "Plot queued offline with photos." };
        }
        setSyncNotice("Tree capture queued offline and will sync with photos automatically when the network is stable.");
        return { queued: true, message: "Tree queued offline with photos." };
      }
    },
    [isOnline, isOrgPaused, refreshProjectAfterMutation, selectedProjectId, session, sponsorSession],
  );

  const updateTree = useCallback(
    async (input: GreenTreeUpdateInput): Promise<MutationResult> => {
      if (!session || sponsorSession) throw new Error("Field session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      try {
        if (!isOnline) throw new Error("offline");
        await runTreeUpdate(session, input);
        await refreshProjectAfterMutation(input.projectId, "live");
        setSyncNotice("Tree record updated live.");
        return { queued: false, message: "Tree record updated live." };
      } catch (err) {
        if (!isLikelyOfflineError(err) && !(err instanceof Error && err.message === "offline")) {
          throw err;
        }
        await queueTreeUpdate(input);
        await refreshProjectAfterMutation(input.projectId, "cached");
        setSyncNotice("Tree record queued offline.");
        return { queued: true, message: "Tree record queued offline." };
      }
    },
    [isOnline, isOrgPaused, refreshProjectAfterMutation, session, sponsorSession],
  );

  const deleteTree = useCallback(
    async (input: { projectId: number; treeId: number }): Promise<MutationResult> => {
      if (!session || sponsorSession) throw new Error("Field session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      if (!isOnline) {
        throw new Error("Tree deletion needs network.");
      }
      await deleteGreenTree({
        treeId: input.treeId,
        projectId: input.projectId,
        actorName: session.user.full_name,
      });
      await refreshProjectAfterMutation(input.projectId, "live");
      setSyncNotice("Tree deleted live.");
      return { queued: false, message: "Tree deleted live." };
    },
    [isOnline, isOrgPaused, refreshProjectAfterMutation, session, sponsorSession],
  );

  const saveTaskUpdate = useCallback(
    async (input: GreenTaskMutationInput): Promise<MutationResult> => {
      if (!session || sponsorSession) throw new Error("Field session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      const payload = { ...input, actorName: session.user.full_name };
      try {
        if (!isOnline) throw new Error("offline");
        await runTaskMutation(session, payload, "update");
        suppressedTaskNotificationIdsRef.current.add(Number(payload.taskId));
        await applyTaskLocalPatch(payload.projectId, payload.taskId, (task) => ({
          ...task,
          status: payload.status ?? task.status,
          notes: payload.notes ?? task.notes,
          reported_tree_status: payload.treeStatus ?? task.reported_tree_status,
          tree_status: payload.treeStatus ?? task.tree_status,
          activity_lat: payload.activityLat ?? task.activity_lat ?? null,
          activity_lng: payload.activityLng ?? task.activity_lng ?? null,
          activity_recorded_at: payload.activityRecordedAt ?? task.activity_recorded_at ?? null,
          sync_state: "live",
        }));
        await refreshProjectAfterMutation(payload.projectId, "live");
        setSyncNotice("Task update saved live.");
        return { queued: false, message: "Task update saved live." };
      } catch (err) {
        if (!isLikelyOfflineError(err) && !(err instanceof Error && err.message === "offline")) {
          throw err;
        }
        await queueTaskUpdate(payload);
        await refreshProjectAfterMutation(payload.projectId, "cached");
        setSyncNotice("Task update queued offline.");
        return { queued: true, message: "Task update queued offline." };
      }
    },
    [applyTaskLocalPatch, isOnline, isOrgPaused, refreshProjectAfterMutation, session, sponsorSession],
  );

  const submitTask = useCallback(
    async (input: GreenTaskMutationInput): Promise<MutationResult> => {
      if (!session || sponsorSession) throw new Error("Field session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      const payload = { ...input, actorName: session.user.full_name };
      try {
        if (!isOnline) throw new Error("offline");
        await runTaskMutation(session, payload, "submit");
        suppressedTaskNotificationIdsRef.current.add(Number(payload.taskId));
        await applyTaskLocalPatch(payload.projectId, payload.taskId, (task) => ({
          ...task,
          status: "done",
          notes: payload.notes ?? task.notes,
          reported_tree_status: payload.treeStatus ?? task.reported_tree_status,
          tree_status: payload.treeStatus ?? task.tree_status,
          activity_lat: payload.activityLat ?? task.activity_lat ?? null,
          activity_lng: payload.activityLng ?? task.activity_lng ?? null,
          activity_recorded_at: payload.activityRecordedAt ?? task.activity_recorded_at ?? null,
          review_state: "submitted",
          sync_state: "live",
        }));
        await refreshProjectAfterMutation(payload.projectId, "live");
        setSyncNotice("Task submitted live for supervisor review.");
        return { queued: false, message: "Task submitted live." };
      } catch (err) {
        if (!isLikelyOfflineError(err) && !(err instanceof Error && err.message === "offline")) {
          throw err;
        }
        await queueTaskSubmit(payload);
        await refreshProjectAfterMutation(payload.projectId, "cached");
        setSyncNotice("Task submission queued offline.");
        return { queued: true, message: "Task submission queued offline." };
      }
    },
    [applyTaskLocalPatch, isOnline, isOrgPaused, refreshProjectAfterMutation, session, sponsorSession],
  );

  const refreshAllRef = useRef(refreshAll);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    if (!session || sponsorSession) {
      projectsRef.current = [];
      setProjects([]);
      setTasks([]);
      setTrees([]);
      setUsers([]);
      setCustodians([]);
      setWorkOrders([]);
      setDistributionAllocations([]);
      setSelectedProjectId(null);
      setOfflineStats(emptyStats);
      setLoading(false);
      return;
    }
    void requestGreenNotificationPermission().catch(() => {});
    void refreshAllRef.current();
    // Intentionally keyed on session identity + sponsor flag only - NOT on `refreshAll` itself.
    // `refreshAll`'s identity shifts whenever `isOnline` flips (via its dependency chain), and an
    // unstable connection can flip that many times a minute; including it here previously caused
    // a full reload (and, via re-entrant overlapping fetches, occasional stale-data races) on every
    // single network flap instead of once per login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sponsorSession]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    taskSnapshotRef.current = new Map();
    orderSnapshotRef.current = new Map();
    suppressedTaskNotificationIdsRef.current = new Set();
    taskNotifyPrimedRef.current = false;
    orderNotifyPrimedRef.current = false;
    initialAutoSyncRef.current = false;
    backgroundPrefetchKeyRef.current = "";
    backgroundPrefetchRunningRef.current = false;
  }, [selectedProjectId, session?.user.full_name]);

  useEffect(() => {
    if (sponsorSession) return;
    let mounted = true;
    const onNetworkChange = (state: Network.NetworkState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (!mounted) return;
      setIsOnline(online);
      // Only fire on a genuine offline -> online edge. A flaky/unstable connection can flap
      // between connected and disconnected many times a minute, and this listener used to
      // kick off a sync on every single "online" reading (even while already online) - on a
      // shaky signal that meant a near-continuous stream of sync attempts, which is what made
      // the app feel like it kept reloading. wasOnlineRef starts at null (unknown) so the very
      // first reading never counts as a "reconnect".
      const previouslyOnline = wasOnlineRef.current;
      wasOnlineRef.current = online;
      if (online && previouslyOnline === false) {
        void syncNow();
      }
    };
    const subscription = Network.addNetworkStateListener(onNetworkChange);
    const appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void (async () => {
        const network = await Network.getNetworkStateAsync();
        const online = Boolean(network.isConnected && network.isInternetReachable !== false);
        if (!mounted) return;
        setIsOnline(online);
        wasOnlineRef.current = online;
        if (online) {
          await syncNow();
        } else {
          await refreshStats();
        }
      })();
    });
    return () => {
      mounted = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [refreshStats, sponsorSession, syncNow]);

  useEffect(() => {
    if (sponsorSession || !session || !isOnline || !selectedProjectId) return;
    const timer = setInterval(() => {
      void refreshSelectedProjectLive();
    }, 45000);
    return () => clearInterval(timer);
  }, [isOnline, refreshSelectedProjectLive, selectedProjectId, session, sponsorSession]);

  useEffect(() => {
    if (sponsorSession || !session || !isOnline || syncing || initialAutoSyncRef.current) return;
    if (offlineStats.queued <= 0) return;
    initialAutoSyncRef.current = true;
    void syncNow();
  }, [isOnline, offlineStats.queued, session, sponsorSession, syncNow, syncing]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );

  const matchedCustodian = useMemo(() => {
    if (!session) return null;
    const currentName = normalizeName(session.user.full_name);
    return custodians.find((custodian) => normalizeName(custodian.name) === currentName) || null;
  }, [custodians, session]);

  const isCustodianUser = useMemo(
    () => Boolean(session?.user.role && String(session.user.role).toLowerCase().startsWith("custodian_")),
    [session?.user.role],
  );


  const value = useMemo<GreenSyncContextValue>(
    () => ({
      projects,
      tasks,
      trees,
      users,
      custodians,
      workOrders,
      distributionAllocations,
      selectedProjectId,
      selectedProject,
      matchedCustodian,
      loading,
      refreshing,
      syncing,
      isOnline,
      isCustodianUser,
      isOrgPaused,
      offlineStats,
      error,
      syncNotice,
      syncProgress,
      selectProject,
      refreshAll,
      syncNow,
      createTree,
      updateTree,
      deleteTree,
      saveTaskUpdate,
      submitTask,
      clearError: () => setError(""),
    }),
    [
      createTree,
      deleteTree,
      custodians,
      distributionAllocations,
      error,
      isCustodianUser,
      isOrgPaused,
      isOnline,
      loading,
      matchedCustodian,
      offlineStats,
      projects,
      refreshAll,
      refreshing,
      saveTaskUpdate,
      selectProject,
      selectedProject,
      selectedProjectId,
      submitTask,
      syncNotice,
      syncProgress,
      syncNow,
      syncing,
      tasks,
      trees,
      updateTree,
      users,
      workOrders,
    ],
  );

  return <GreenSyncContext.Provider value={value}>{children}</GreenSyncContext.Provider>;
};

export const useGreenSync = () => {
  const context = useContext(GreenSyncContext);
  if (!context) {
    throw new Error("useGreenSync must be used within GreenSyncProvider");
  }
  return context;
};
