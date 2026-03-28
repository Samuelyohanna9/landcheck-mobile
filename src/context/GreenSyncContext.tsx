import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getErrorMessage } from "../api/client";
import {
  fetchDistributionAllocations,
  fetchProjectCustodians,
  fetchProjects,
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
  cacheTasks,
  cacheTrees,
  cacheUsers,
  cacheWorkOrders,
  getOfflineStats,
  patchCachedTask,
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
import { pushGreenNotification, requestGreenNotificationPermission } from "../notifications/greenNotifications";

type UserSummary = { id: number; full_name: string; role?: string | null; role_name?: string | null };

type MutationResult = {
  queued: boolean;
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
  createTree: (input: GreenTreeCreateInput) => Promise<MutationResult>;
  updateTree: (input: GreenTreeUpdateInput) => Promise<MutationResult>;
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

export const GreenSyncProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
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
  const seenTaskIdsRef = useRef<Set<number>>(new Set());
  const seenOrderIdsRef = useRef<Set<number>>(new Set());
  const taskNotifyPrimedRef = useRef(false);
  const orderNotifyPrimedRef = useRef(false);
  const initialAutoSyncRef = useRef(false);

  const refreshStats = useCallback(async () => {
    const stats = await getOfflineStats("green");
    setOfflineStats(stats);
    return stats;
  }, []);

  const loadCachedProjectLists = useCallback(async () => {
    const cachedProjects = await readCachedProjects("green");
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
      const [tasksResult, treesResult, custodiansResult, allocationsResult, workOrdersResult] = await Promise.allSettled([
        fetchTasks(projectId, actorName),
        fetchTrees(projectId, actorName),
        fetchProjectCustodians(projectId),
        fetchDistributionAllocations(projectId),
        fetchWorkOrders(projectId, actorName),
      ]);

      const [nextTasks, nextTrees, nextCustodians, nextAllocations, nextWorkOrders] = await Promise.all([
        tasksResult.status === "fulfilled" ? Promise.resolve(tasksResult.value) : readCachedTasks("green", projectId),
        treesResult.status === "fulfilled" ? Promise.resolve(treesResult.value) : readCachedTrees("green", projectId),
        custodiansResult.status === "fulfilled" ? Promise.resolve(custodiansResult.value) : readCachedCustodians("green", projectId),
        allocationsResult.status === "fulfilled" ? Promise.resolve(allocationsResult.value) : readCachedDistributionAllocations("green", projectId),
        workOrdersResult.status === "fulfilled" ? Promise.resolve(workOrdersResult.value) : readCachedWorkOrders("green", projectId),
      ]);

      if (tasksResult.status === "fulfilled") {
        const nextTaskIds = new Set(nextTasks.map((task) => Number(task.id || 0)).filter((id) => id > 0));
        if (taskNotifyPrimedRef.current) {
          const newTasks = nextTasks.filter((task) => {
            const id = Number(task.id || 0);
            return id > 0 && !seenTaskIdsRef.current.has(id);
          });
          if (newTasks.length > 0) {
            void pushGreenNotification(
              "New Task",
              `${newTasks.length} new task${newTasks.length === 1 ? "" : "s"} assigned to you.`,
            );
          }
        }
        seenTaskIdsRef.current = nextTaskIds;
        taskNotifyPrimedRef.current = true;
      }

      if (workOrdersResult.status === "fulfilled") {
        const nextOrderIds = new Set(nextWorkOrders.map((row) => Number(row.id || 0)).filter((id) => id > 0));
        if (orderNotifyPrimedRef.current) {
          const newOrders = nextWorkOrders.filter((row) => {
            const id = Number(row.id || 0);
            return id > 0 && !seenOrderIdsRef.current.has(id);
          });
          if (newOrders.length > 0) {
            const newPlantingCount = newOrders.filter((row) => String(row.work_type || "").toLowerCase() === "planting").length;
            const newMaintenanceOrderCount = Math.max(newOrders.length - newPlantingCount, 0);
            if (newPlantingCount > 0) {
              void pushGreenNotification(
                "New Planting Order",
                `${newPlantingCount} new planting order${newPlantingCount === 1 ? "" : "s"} assigned to you.`,
              );
            }
            if (newMaintenanceOrderCount > 0) {
              void pushGreenNotification(
                "New Work Order",
                `${newMaintenanceOrderCount} new work order${newMaintenanceOrderCount === 1 ? "" : "s"} assigned to you.`,
              );
            }
          }
        }
        seenOrderIdsRef.current = nextOrderIds;
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

  const pickProjectId = useCallback(
    (items: ProjectSummary[], preferred?: number | null) => {
      if (preferred && items.some((item) => item.id === preferred)) return preferred;
      if (selectedProjectId && items.some((item) => item.id === selectedProjectId)) return selectedProjectId;
      return items[0]?.id ?? null;
    },
    [selectedProjectId],
  );

  const refreshAll = useCallback(async () => {
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

      const [cachedProjects, cachedUsers] = await Promise.all([loadCachedProjectLists(), readCachedUsers("green")]);
      setUsers(cachedUsers as UserSummary[]);
      const fallbackProjectId = pickProjectId(cachedProjects);
      if (fallbackProjectId) {
        setSelectedProjectId(fallbackProjectId);
        await loadCachedProjectData(fallbackProjectId);
      }

      if (!online) {
        setSyncNotice("Offline mode: showing cached projects, trees, tasks, and field setup.");
        await refreshStats();
        return;
      }

      const actorName = String(session.user.full_name || "").trim();
      const [liveProjects, liveUsers] = await Promise.all([
        fetchProjects(session.user.organization_id, actorName),
        fetchUsers(session.user.organization_id),
      ]);
      await Promise.all([cacheProjects("green", liveProjects), cacheUsers("green", liveUsers)]);
      setProjects(liveProjects);
      setUsers(liveUsers);

      const nextProjectId = pickProjectId(liveProjects, fallbackProjectId);
      setSelectedProjectId(nextProjectId);
      if (nextProjectId) {
        await loadLiveProjectData(nextProjectId);
      } else {
        setTasks([]);
        setTrees([]);
        setCustodians([]);
        setDistributionAllocations([]);
        setWorkOrders([]);
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
  }, [loadCachedProjectData, loadCachedProjectLists, loadLiveProjectData, pickProjectId, refreshStats, session]);

  const selectProject = useCallback(
    async (projectId: number) => {
      setSelectedProjectId(projectId);
      await loadCachedProjectData(projectId);
      if (!session || !isOnline) return;
      try {
        await loadLiveProjectData(projectId);
        await refreshStats();
      } catch {
        // Keep cached state when live refresh fails.
      }
    },
    [isOnline, loadCachedProjectData, loadLiveProjectData, refreshStats, session],
  );

  const syncNow = useCallback(async () => {
    if (!session || !isOnline || syncing) return;
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
        } catch {
          // Keep cached state if live refresh fails.
        }
      } else {
        const nextProjectId = pickProjectId(refreshedProjects);
        if (nextProjectId) {
          try {
            await loadLiveProjectData(nextProjectId);
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
    refreshStats,
    selectedProjectId,
    session,
    syncing,
  ]);

  const isOrgPaused = useMemo(() => {
    if (!session || session.auth_mode === "env_admin") return false;
    const status = String(session.user.organization_status || "").toLowerCase();
    return status === "paused" || status === "read_only";
  }, [session]);

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
    try {
      await loadLiveProjectData(selectedProjectId);
      await refreshStats();
    } catch {
      // Keep current state when background refresh fails.
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
    async (input: GreenTreeCreateInput): Promise<MutationResult> => {
      if (!session) throw new Error("Session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      try {
        if (!isOnline) throw new Error("offline");
        const { created, photoLinked } = await runTreeCreation(session, input);
        await refreshProjectAfterMutation(input.projectId, "live");
        const hasReviewTask = Number(created.review_task_id || 0) > 0;
        const message =
          input.treeOrigin === "existing_inventory"
            ? hasReviewTask
              ? photoLinked
                ? "Existing tree submitted for supervisor review."
                : "Existing tree submitted for supervisor review. Photo upload failed."
              : photoLinked
                ? "Existing tree saved."
                : "Existing tree saved. Photo upload failed."
            : hasReviewTask
              ? photoLinked
                ? "Tree submitted for supervisor review."
                : "Tree submitted for supervisor review. Photo upload failed."
              : photoLinked
                ? "Tree saved live."
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
        setSyncNotice("Tree capture queued offline and will sync automatically.");
        return { queued: true, message: "Tree queued offline." };
      }
    },
    [isOnline, isOrgPaused, refreshProjectAfterMutation, selectedProjectId, session],
  );

  const updateTree = useCallback(
    async (input: GreenTreeUpdateInput): Promise<MutationResult> => {
      if (!session) throw new Error("Session not available.");
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
    [isOnline, isOrgPaused, refreshProjectAfterMutation, session],
  );

  const saveTaskUpdate = useCallback(
    async (input: GreenTaskMutationInput): Promise<MutationResult> => {
      if (!session) throw new Error("Session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      const payload = { ...input, actorName: session.user.full_name };
      try {
        if (!isOnline) throw new Error("offline");
        await runTaskMutation(session, payload, "update");
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
    [applyTaskLocalPatch, isOnline, isOrgPaused, refreshProjectAfterMutation, session],
  );

  const submitTask = useCallback(
    async (input: GreenTaskMutationInput): Promise<MutationResult> => {
      if (!session) throw new Error("Session not available.");
      if (isOrgPaused) throw new Error("Organization is paused. Write operations are disabled.");
      const payload = { ...input, actorName: session.user.full_name };
      try {
        if (!isOnline) throw new Error("offline");
        await runTaskMutation(session, payload, "submit");
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
    [applyTaskLocalPatch, isOnline, isOrgPaused, refreshProjectAfterMutation, session],
  );

  useEffect(() => {
    if (!session) {
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
    void refreshAll();
  }, [refreshAll, session]);

  useEffect(() => {
    seenTaskIdsRef.current = new Set();
    seenOrderIdsRef.current = new Set();
    taskNotifyPrimedRef.current = false;
    orderNotifyPrimedRef.current = false;
    initialAutoSyncRef.current = false;
  }, [selectedProjectId, session?.user.full_name]);

  useEffect(() => {
    let mounted = true;
    const onNetworkChange = (state: Network.NetworkState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (!mounted) return;
      setIsOnline(online);
      if (online) {
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
  }, [refreshStats, syncNow]);

  useEffect(() => {
    if (!session || !isOnline || !selectedProjectId) return;
    const timer = setInterval(() => {
      void refreshSelectedProjectLive();
    }, 45000);
    return () => clearInterval(timer);
  }, [isOnline, refreshSelectedProjectLive, selectedProjectId, session]);

  useEffect(() => {
    if (!session || !isOnline || syncing || initialAutoSyncRef.current) return;
    if (offlineStats.queued <= 0) return;
    initialAutoSyncRef.current = true;
    void syncNow();
  }, [isOnline, offlineStats.queued, session, syncNow, syncing]);

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
      saveTaskUpdate,
      submitTask,
      clearError: () => setError(""),
    }),
    [
      createTree,
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
