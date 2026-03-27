import { api } from "./client";
import type {
  CarbonSummary,
  CustodianSummary,
  DistributionAllocationSummary,
  DraftPhoto,
  GreenTaskMutationInput,
  GreenTreeCreateInput,
  GreenTreeUpdateInput,
  ProjectSummary,
  ReviewQueueItem,
  TaskSummary,
  TreeSummary,
  WorkOrderSummary,
} from "../types/domain";
import {
  normalizeTaskSummary,
  normalizePhotoList,
  normalizeTreeSummary,
  normalizeWorkOrderSummary,
} from "../green/normalize";

export const fetchProjects = async (organizationId?: number | null, assigneeName?: string | null) => {
  const response = await api.get<ProjectSummary[]>("/green/projects", {
    params: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const fetchProjectCarbonSummary = async (projectId: number, assigneeName?: string | null) => {
  const response = await api.get<CarbonSummary>(`/green/projects/${projectId}/carbon-summary`, {
    params: {
      _ts: Date.now(),
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return response.data;
};

export const fetchTasks = async (projectId: number, assigneeName?: string | null) => {
  const response = await api.get<TaskSummary[]>("/green/tasks", {
    params: {
      _ts: Date.now(),
      project_id: projectId,
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return Array.isArray(response.data) ? response.data.map(normalizeTaskSummary) : [];
};

export const fetchTrees = async (projectId: number, assigneeName?: string | null) => {
  const response = await api.get<TreeSummary[]>(`/green/projects/${projectId}/trees`, {
    params: {
      _ts: Date.now(),
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return Array.isArray(response.data) ? response.data.map(normalizeTreeSummary) : [];
};

export const fetchProjectCustodians = async (projectId: number) => {
  const response = await api.get<CustodianSummary[]>(`/green/projects/${projectId}/custodians`, {
    params: { _ts: Date.now() },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const fetchDistributionAllocations = async (projectId: number) => {
  const response = await api.get<DistributionAllocationSummary[]>(`/green/projects/${projectId}/distribution-allocations`, {
    params: { _ts: Date.now() },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const fetchWorkOrders = async (projectId: number, assigneeName?: string | null) => {
  const response = await api.get<WorkOrderSummary[]>("/green/work-orders", {
    params: {
      _ts: Date.now(),
      project_id: projectId,
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return Array.isArray(response.data) ? response.data.map(normalizeWorkOrderSummary) : [];
};

export const fetchReviewQueue = async (projectId: number, assigneeName?: string | null) => {
  const response = await api.get<ReviewQueueItem[]>("/green/tasks/review-queue", {
    params: {
      _ts: Date.now(),
      project_id: projectId,
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return Array.isArray(response.data) ? response.data.map((item) => normalizeTaskSummary(item as TaskSummary) as ReviewQueueItem) : [];
};

export const createGreenTree = async (input: GreenTreeCreateInput & { createdBy: string }) => {
  const response = await api.post("/green/trees", {
    project_id: input.projectId,
    lng: input.lng,
    lat: input.lat,
    species: input.species,
    planting_date: input.plantingDate || null,
    status: input.status || "alive",
    notes: input.notes || "",
    created_by: input.createdBy,
    tree_origin: input.treeOrigin || "new_planting",
    attribution_scope: input.attributionScope || "full",
    count_in_planting_kpis: input.countInPlantingKpis ?? true,
    count_in_carbon_scope: input.countInCarbonScope ?? true,
    tree_height_m: input.treeHeightM ?? null,
    custodian_id: input.custodianId ?? null,
    tree_age_months: input.treeAgeMonths ?? null,
    inventory_tree_count: input.inventoryTreeCount ?? 1,
    existing_area_geojson: input.existingAreaGeojson ?? null,
  });
  return response.data as {
    id: number;
    project_tree_no?: number | null;
    review_task_id?: number | null;
    auto_first_cycle_task_ids?: number[];
    status?: string | null;
  };
};

export const updateGreenTree = async (input: GreenTreeUpdateInput) => {
  const response = await api.patch(`/green/trees/${input.treeId}`, {
    lng: input.lng ?? undefined,
    lat: input.lat ?? undefined,
    species: input.species ?? undefined,
    planting_date: input.plantingDate ?? undefined,
    status: input.status ?? undefined,
    notes: input.notes ?? undefined,
    tree_height_m: input.treeHeightM ?? undefined,
    tree_age_months: input.treeAgeMonths ?? undefined,
    custodian_id: input.custodianId ?? undefined,
    inventory_tree_count: input.inventoryTreeCount ?? undefined,
    existing_area_geojson: input.existingAreaGeojson ?? undefined,
  });
  return response.data;
};

export const updateGreenTask = async (input: GreenTaskMutationInput & { photoUrls?: string[] }) => {
  const mergedPhotoUrls = normalizePhotoList([...(input.existingPhotoUrls || []), ...(input.photoUrls || [])]);
  const mergedPhotoUrl = mergedPhotoUrls[mergedPhotoUrls.length - 1] || input.existingPhotoUrl || "";
  const response = await api.patch(`/green/tasks/${input.taskId}`, {
    status: input.status || undefined,
    notes: input.notes || "",
    tree_status: input.treeStatus || "",
    activity_lat: input.activityLat ?? null,
    activity_lng: input.activityLng ?? null,
    activity_recorded_at: input.activityRecordedAt ?? null,
    photo_url: mergedPhotoUrl,
    photo_urls: mergedPhotoUrls.length ? mergedPhotoUrls : null,
  });
  return response.data;
};

export const submitGreenTask = async (input: GreenTaskMutationInput & { photoUrls?: string[] }) => {
  const mergedPhotoUrls = normalizePhotoList([...(input.existingPhotoUrls || []), ...(input.photoUrls || [])]);
  const mergedPhotoUrl = mergedPhotoUrls[mergedPhotoUrls.length - 1] || input.existingPhotoUrl || "";
  const response = await api.post(`/green/tasks/${input.taskId}/submit`, {
    notes: input.notes || "",
    tree_status: input.treeStatus || "",
    actor_name: input.actorName || "",
    activity_lat: input.activityLat ?? null,
    activity_lng: input.activityLng ?? null,
    activity_recorded_at: input.activityRecordedAt ?? null,
    photo_url: mergedPhotoUrl,
    photo_urls: mergedPhotoUrls.length ? mergedPhotoUrls : null,
  });
  return response.data;
};

export const fetchProjectDetail = async (projectId: number, assigneeName?: string | null) => {
  const response = await api.get<ProjectSummary>(`/green/projects/${projectId}`, {
    params: {
      _ts: Date.now(),
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return response.data;
};

export const fetchUsers = async (organizationId?: number | null) => {
  const response = await api.get<Array<{ id: number; full_name: string; role?: string | null; role_name?: string | null }>>("/green/users", {
    params: organizationId ? { organization_id: organizationId } : {},
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const fetchTreeTasks = async (treeId: number) => {
  const response = await api.get<TaskSummary[]>(`/green/trees/${treeId}/tasks`);
  return Array.isArray(response.data) ? response.data.map(normalizeTaskSummary) : [];
};

export const fetchTreeTimeline = async (treeId: number) => {
  const response = await api.get(`/green/trees/${treeId}/timeline`);
  return response.data;
};

export const changeGreenPassword = async (currentPassword: string, newPassword: string) => {
  const response = await api.post("/green/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
};

export const fetchDonorReportUrl = (projectId: number, includePhotos = false, assigneeName?: string | null) => {
  const params = new URLSearchParams();
  if (includePhotos) params.set("include_photos", "1");
  if (assigneeName) params.set("assignee_name", assigneeName);
  return `${api.defaults.baseURL}/green/projects/${projectId}/donor-report/pdf${params.toString() ? `?${params.toString()}` : ""}`;
};

export const uploadGreenPhoto = async ({
  photo,
  folder,
  treeId,
  taskId,
}: {
  photo: DraftPhoto;
  folder: "trees" | "tasks";
  treeId?: number | null;
  taskId?: number | null;
}) => {
  const formData = new FormData();
  formData.append("folder", folder);
  if (treeId) formData.append("tree_id", String(treeId));
  if (taskId) formData.append("task_id", String(taskId));
  formData.append("file", {
    uri: photo.uri,
    type: photo.mimeType || "image/jpeg",
    name: photo.fileName || `green-mobile-${Date.now()}.jpg`,
  } as never);
  const response = await api.post<{ url?: string }>("/green/uploads/photo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 45000,
  });
  return String(response.data?.url || "");
};
