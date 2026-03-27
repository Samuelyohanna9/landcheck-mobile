import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import type {
  AppMode,
  CustodianSummary,
  DistributionAllocationSummary,
  OfflineStats,
  ProjectSummary,
  QueueActionType,
  ReviewQueueItem,
  SyncQueueRow,
  TaskSummary,
  TreeSummary,
  WorkOrderSummary,
} from "../types/domain";
import {
  normalizeTaskSummary,
  normalizeTreeSummary,
  normalizeWorkOrderSummary,
} from "../green/normalize";

let dbPromise: Promise<SQLiteDatabase> | null = null;
let dbWriteQueue: Promise<unknown> = Promise.resolve();

const getDatabase = async () => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("landcheck-mobile.db");
  }
  return dbPromise;
};

const parsePayload = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const runSerializedWrite = async <T>(work: (db: SQLiteDatabase) => Promise<T>): Promise<T> => {
  const next = dbWriteQueue.then(async () => {
    const db = await getDatabase();
    return work(db);
  });
  dbWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const setMeta = async (key: string, value: string) =>
  runSerializedWrite(async (db) => {
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [key, value]);
  });

const alterIfNeeded = async (db: SQLiteDatabase, statement: string) => {
  try {
    await db.execAsync(statement);
  } catch {
    // Existing installs may already have the migrated schema.
  }
};

const runSerializedTransaction = async <T>(work: (db: SQLiteDatabase) => Promise<T>): Promise<T> =>
  runSerializedWrite(async (db) => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await work(db);
    });
    return result;
  });

export const bootstrapLocalDatabase = async () => {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cached_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, project_id)
    );
    CREATE TABLE IF NOT EXISTS cached_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, task_id)
    );
    CREATE TABLE IF NOT EXISTS cached_trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      tree_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, tree_id)
    );
    CREATE TABLE IF NOT EXISTS cached_custodians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      custodian_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, custodian_id)
    );
    CREATE TABLE IF NOT EXISTS cached_work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      work_order_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, work_order_id)
    );
    CREATE TABLE IF NOT EXISTS cached_distribution_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      allocation_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, allocation_id)
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      project_id INTEGER,
      task_id INTEGER,
      tree_id INTEGER,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS mobile_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cached_tasks_project ON cached_tasks (app_mode, project_id);
    CREATE INDEX IF NOT EXISTS idx_cached_trees_project ON cached_trees (app_mode, project_id);
    CREATE INDEX IF NOT EXISTS idx_cached_custodians_project ON cached_custodians (app_mode, project_id);
    CREATE INDEX IF NOT EXISTS idx_cached_work_orders_project ON cached_work_orders (app_mode, project_id);
    CREATE INDEX IF NOT EXISTS idx_cached_allocations_project ON cached_distribution_allocations (app_mode, project_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status, created_at);
    CREATE TABLE IF NOT EXISTS cached_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, user_id)
    );
    CREATE TABLE IF NOT EXISTS cached_tree_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, tree_id)
    );
    CREATE TABLE IF NOT EXISTS cached_tree_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_mode TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(app_mode, tree_id)
    );
  `);

  await alterIfNeeded(db, "ALTER TABLE sync_queue ADD COLUMN project_id INTEGER");
  await alterIfNeeded(db, "ALTER TABLE sync_queue ADD COLUMN task_id INTEGER");
  await alterIfNeeded(db, "ALTER TABLE sync_queue ADD COLUMN tree_id INTEGER");
  await alterIfNeeded(db, "ALTER TABLE sync_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
  await alterIfNeeded(db, "ALTER TABLE sync_queue ADD COLUMN last_error TEXT");
  await alterIfNeeded(db, "ALTER TABLE sync_queue ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
};

export const cacheProjects = async (appMode: AppMode, projects: ProjectSummary[]) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_projects WHERE app_mode = ?", [appMode]);
    for (const project of projects) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_projects (app_mode, project_id, payload, synced_at) VALUES (?, ?, ?, ?)",
        [appMode, project.id, JSON.stringify(project), syncedAt],
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [`last_sync:${appMode}`, syncedAt]);
  });
};

export const readCachedProjects = async (appMode: AppMode) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_projects WHERE app_mode = ? ORDER BY project_id DESC",
    [appMode],
  );
  return rows
    .map((row) => parsePayload<ProjectSummary>(row.payload))
    .filter((item): item is ProjectSummary => Boolean(item));
};

const normalizeTaskPayload = (task: TaskSummary | ReviewQueueItem) => JSON.stringify(normalizeTaskSummary(task as TaskSummary));

export const cacheTasks = async (appMode: AppMode, projectId: number, tasks: Array<TaskSummary | ReviewQueueItem>) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_tasks WHERE app_mode = ? AND project_id = ?", [appMode, projectId]);
    for (const task of tasks) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_tasks (app_mode, project_id, task_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
        [appMode, projectId, task.id, normalizeTaskPayload(task), syncedAt],
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [`last_sync:${appMode}`, syncedAt]);
  });
};

export const readCachedTasks = async (appMode: AppMode, projectId: number) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_tasks WHERE app_mode = ? AND project_id = ? ORDER BY task_id DESC",
    [appMode, projectId],
  );
  return rows
    .map((row) => parsePayload<TaskSummary>(row.payload))
    .map((item) => (item ? normalizeTaskSummary(item) : null))
    .filter((item): item is TaskSummary => Boolean(item));
};

export const upsertCachedTask = async (appMode: AppMode, projectId: number, task: TaskSummary) => {
  await runSerializedWrite(async (db) => {
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_tasks (app_mode, project_id, task_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
      [appMode, projectId, task.id, JSON.stringify(normalizeTaskSummary(task)), new Date().toISOString()],
    );
  });
};

export const patchCachedTask = async (
  appMode: AppMode,
  projectId: number,
  taskId: number,
  patcher: (task: TaskSummary) => TaskSummary,
) => {
  return runSerializedWrite(async (db) => {
    const current = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM cached_tasks WHERE app_mode = ? AND project_id = ? AND task_id = ?",
      [appMode, projectId, taskId],
    );
    const parsed = current ? parsePayload<TaskSummary>(current.payload) : null;
    if (!parsed) return null;
    const next = patcher(parsed);
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_tasks (app_mode, project_id, task_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
      [appMode, projectId, next.id, JSON.stringify(normalizeTaskSummary(next)), new Date().toISOString()],
    );
    return next;
  });
};

export const cacheTrees = async (appMode: AppMode, projectId: number, trees: TreeSummary[]) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_trees WHERE app_mode = ? AND project_id = ?", [appMode, projectId]);
    for (const tree of trees) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_trees (app_mode, project_id, tree_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
        [appMode, projectId, tree.id, JSON.stringify(normalizeTreeSummary(tree)), syncedAt],
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [`last_sync:${appMode}`, syncedAt]);
  });
};

export const cacheCustodians = async (appMode: AppMode, projectId: number, custodians: CustodianSummary[]) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_custodians WHERE app_mode = ? AND project_id = ?", [appMode, projectId]);
    for (const custodian of custodians) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_custodians (app_mode, project_id, custodian_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
        [appMode, projectId, custodian.id, JSON.stringify(custodian), syncedAt],
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [`last_sync:${appMode}`, syncedAt]);
  });
};

export const readCachedCustodians = async (appMode: AppMode, projectId: number) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_custodians WHERE app_mode = ? AND project_id = ? ORDER BY custodian_id DESC",
    [appMode, projectId],
  );
  return rows
    .map((row) => parsePayload<CustodianSummary>(row.payload))
    .filter((item): item is CustodianSummary => Boolean(item));
};

export const cacheWorkOrders = async (appMode: AppMode, projectId: number, workOrders: WorkOrderSummary[]) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_work_orders WHERE app_mode = ? AND project_id = ?", [appMode, projectId]);
    for (const workOrder of workOrders) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_work_orders (app_mode, project_id, work_order_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
        [appMode, projectId, workOrder.id, JSON.stringify(normalizeWorkOrderSummary(workOrder)), syncedAt],
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [`last_sync:${appMode}`, syncedAt]);
  });
};

export const readCachedWorkOrders = async (appMode: AppMode, projectId: number) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_work_orders WHERE app_mode = ? AND project_id = ? ORDER BY work_order_id DESC",
    [appMode, projectId],
  );
  return rows
    .map((row) => parsePayload<WorkOrderSummary>(row.payload))
    .map((item) => (item ? normalizeWorkOrderSummary(item) : null))
    .filter((item): item is WorkOrderSummary => Boolean(item));
};

export const cacheDistributionAllocations = async (
  appMode: AppMode,
  projectId: number,
  allocations: DistributionAllocationSummary[],
) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_distribution_allocations WHERE app_mode = ? AND project_id = ?", [appMode, projectId]);
    for (const allocation of allocations) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_distribution_allocations (app_mode, project_id, allocation_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
        [appMode, projectId, allocation.id, JSON.stringify(allocation), syncedAt],
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO mobile_meta (key, value) VALUES (?, ?)", [`last_sync:${appMode}`, syncedAt]);
  });
};

export const readCachedDistributionAllocations = async (appMode: AppMode, projectId: number) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_distribution_allocations WHERE app_mode = ? AND project_id = ? ORDER BY allocation_id DESC",
    [appMode, projectId],
  );
  return rows
    .map((row) => parsePayload<DistributionAllocationSummary>(row.payload))
    .filter((item): item is DistributionAllocationSummary => Boolean(item));
};

export const readCachedTrees = async (appMode: AppMode, projectId: number) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_trees WHERE app_mode = ? AND project_id = ? ORDER BY tree_id DESC",
    [appMode, projectId],
  );
  return rows
    .map((row) => parsePayload<TreeSummary>(row.payload))
    .map((item) => (item ? normalizeTreeSummary(item) : null))
    .filter((item): item is TreeSummary => Boolean(item));
};

export const upsertCachedTree = async (appMode: AppMode, projectId: number, tree: TreeSummary) => {
  await runSerializedWrite(async (db) => {
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_trees (app_mode, project_id, tree_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
      [appMode, projectId, tree.id, JSON.stringify(normalizeTreeSummary(tree)), new Date().toISOString()],
    );
  });
};

export const replaceCachedTree = async (
  appMode: AppMode,
  projectId: number,
  previousTreeId: number,
  tree: TreeSummary,
) => {
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_trees WHERE app_mode = ? AND project_id = ? AND tree_id = ?", [
      appMode,
      projectId,
      previousTreeId,
    ]);
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_trees (app_mode, project_id, tree_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
      [appMode, projectId, tree.id, JSON.stringify(normalizeTreeSummary(tree)), new Date().toISOString()],
    );
  });
};

export const patchCachedTree = async (
  appMode: AppMode,
  projectId: number,
  treeId: number,
  patcher: (tree: TreeSummary) => TreeSummary,
) => {
  return runSerializedWrite(async (db) => {
    const current = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM cached_trees WHERE app_mode = ? AND project_id = ? AND tree_id = ?",
      [appMode, projectId, treeId],
    );
    const parsed = current ? parsePayload<TreeSummary>(current.payload) : null;
    if (!parsed) return null;
    const next = patcher(parsed);
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_trees (app_mode, project_id, tree_id, payload, synced_at) VALUES (?, ?, ?, ?, ?)",
      [appMode, projectId, next.id, JSON.stringify(normalizeTreeSummary(next)), new Date().toISOString()],
    );
    return next;
  });
};

export const enqueueSyncAction = async ({
  actionType,
  projectId,
  taskId,
  treeId,
  payload,
}: {
  actionType: QueueActionType;
  projectId?: number | null;
  taskId?: number | null;
  treeId?: number | null;
  payload: Record<string, unknown>;
}) => {
  return runSerializedWrite(async (db) => {
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `
        INSERT INTO sync_queue (
          action_type, entity_type, entity_id, project_id, task_id, tree_id, payload, status, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
      `,
      [
        actionType,
        actionType.includes("tree") ? "tree" : "task",
        String(taskId || treeId || ""),
        projectId ?? null,
        taskId ?? null,
        treeId ?? null,
        JSON.stringify(payload),
        now,
        now,
      ],
    );
    return Number(result.lastInsertRowId || 0);
  });
};

const mapQueueRow = (row: SyncQueueRow) => ({
  ...row,
  retry_count: Number(row.retry_count || 0),
  project_id: row.project_id === null || row.project_id === undefined ? null : Number(row.project_id),
  task_id: row.task_id === null || row.task_id === undefined ? null : Number(row.task_id),
  tree_id: row.tree_id === null || row.tree_id === undefined ? null : Number(row.tree_id),
});

export const readSyncQueue = async (statuses: Array<SyncQueueRow["status"]> = ["pending", "failed"]) => {
  const db = await getDatabase();
  const placeholders = statuses.map(() => "?").join(", ");
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue WHERE status IN (${placeholders}) ORDER BY created_at ASC, id ASC`,
    statuses,
  );
  return rows.map(mapQueueRow);
};

export const setQueueItemStatus = async (
  id: number,
  status: SyncQueueRow["status"],
  options?: { lastError?: string | null; syncedAt?: string | null; retryCount?: number | null },
) => {
  await runSerializedWrite(async (db) => {
    await db.runAsync(
      `
        UPDATE sync_queue
        SET status = ?, last_error = ?, synced_at = ?, retry_count = COALESCE(?, retry_count), updated_at = ?
        WHERE id = ?
      `,
      [
        status,
        options?.lastError ?? null,
        options?.syncedAt ?? null,
        options?.retryCount ?? null,
        new Date().toISOString(),
        id,
      ],
    );
  });
};

export const deleteQueueItem = async (id: number) => {
  await runSerializedWrite(async (db) => {
    await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [id]);
  });
};

export const getOfflineStats = async (appMode: AppMode): Promise<OfflineStats> => {
  const db = await getDatabase();
  const counts = await db.getFirstAsync<{
    queued: number;
    failed: number;
    cachedProjects: number;
    cachedTasks: number;
    cachedTrees: number;
  }>(
    `
      SELECT
        (SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending', 'syncing', 'failed')) AS queued,
        (SELECT COUNT(*) FROM sync_queue WHERE status = 'failed') AS failed,
        (SELECT COUNT(*) FROM cached_projects WHERE app_mode = ?) AS cachedProjects,
        (SELECT COUNT(*) FROM cached_tasks WHERE app_mode = ?) AS cachedTasks,
        (SELECT COUNT(*) FROM cached_trees WHERE app_mode = ?) AS cachedTrees
    `,
    [appMode, appMode, appMode],
  );
  const meta = await db.getFirstAsync<{ value: string }>("SELECT value FROM mobile_meta WHERE key = ?", [`last_sync:${appMode}`]);
  return {
    queued: Number(counts?.queued || 0),
    failed: Number(counts?.failed || 0),
    cachedProjects: Number(counts?.cachedProjects || 0),
    cachedTasks: Number(counts?.cachedTasks || 0),
    cachedTrees: Number(counts?.cachedTrees || 0),
    lastSyncedAt: meta?.value || null,
  };
};

export const updateLastSyncedAt = async (appMode: AppMode, value: string) => {
  await setMeta(`last_sync:${appMode}`, value);
};

// ── Users cache ────────────────────────────────────────────────

type CachedUser = { id: number; full_name: string; role?: string | null; role_name?: string | null };

export const cacheUsers = async (appMode: AppMode, users: CachedUser[]) => {
  const syncedAt = new Date().toISOString();
  await runSerializedTransaction(async (db) => {
    await db.runAsync("DELETE FROM cached_users WHERE app_mode = ?", [appMode]);
    for (const user of users) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cached_users (app_mode, user_id, payload, synced_at) VALUES (?, ?, ?, ?)",
        [appMode, user.id, JSON.stringify(user), syncedAt],
      );
    }
  });
};

export const readCachedUsers = async (appMode: AppMode) => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM cached_users WHERE app_mode = ? ORDER BY user_id ASC",
    [appMode],
  );
  return rows
    .map((row) => parsePayload<CachedUser>(row.payload))
    .filter((item): item is CachedUser => Boolean(item));
};

// ── Tree timeline cache ────────────────────────────────────────

export const cacheTreeTimeline = async (appMode: AppMode, treeId: number, timeline: unknown) => {
  await runSerializedWrite(async (db) => {
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_tree_timeline (app_mode, tree_id, payload, synced_at) VALUES (?, ?, ?, ?)",
      [appMode, treeId, JSON.stringify(timeline), new Date().toISOString()],
    );
  });
};

export const readCachedTreeTimeline = async (appMode: AppMode, treeId: number) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM cached_tree_timeline WHERE app_mode = ? AND tree_id = ?",
    [appMode, treeId],
  );
  return row ? parsePayload<unknown>(row.payload) : null;
};

// ── Tree tasks cache ───────────────────────────────────────────

export const cacheTreeTasks = async (appMode: AppMode, treeId: number, tasks: TaskSummary[]) => {
  await runSerializedWrite(async (db) => {
    await db.runAsync(
      "INSERT OR REPLACE INTO cached_tree_tasks (app_mode, tree_id, payload, synced_at) VALUES (?, ?, ?, ?)",
      [appMode, treeId, JSON.stringify(tasks.map(normalizeTaskSummary)), new Date().toISOString()],
    );
  });
};

export const readCachedTreeTasks = async (appMode: AppMode, treeId: number) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM cached_tree_tasks WHERE app_mode = ? AND tree_id = ?",
    [appMode, treeId],
  );
  if (!row) return [];
  const parsed = parsePayload<TaskSummary[]>(row.payload);
  return Array.isArray(parsed) ? parsed.map(normalizeTaskSummary) : [];
};
