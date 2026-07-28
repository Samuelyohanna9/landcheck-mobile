import { api } from "./client";
import type {
  CarbonSummary,
  CustodianSummary,
  DistributionAllocationSummary,
  DraftPhoto,
  GreenTaskMutationInput,
  ProjectDetailSummary,
  GreenTreeCreateInput,
  GreenTreeUpdateInput,
  ProjectSummary,
  ReviewQueueItem,
  SponsorAgentQrUnitSummary,
  SponsorAgentBankAccount,
  SponsorAgentBankOption,
  SponsorAgentPayoutDashboard,
  SponsorAgentPayoutRequest,
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
import type { MobileSession } from "../types/domain";
import { API_URL } from "../config/env";

export const fetchProjects = async (organizationId?: number | null, assigneeName?: string | null) => {
  const response = await api.get<ProjectSummary[]>("/green/projects", {
    params: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return Array.isArray(response.data) ? response.data : [];
};

const normalizeLookupValue = (value?: string | null) => String(value || "").trim();

const appendProjectLookup = (
  requests: Array<{ organizationId?: number | null; assigneeName: string }>,
  seen: Set<string>,
  organizationId: number | null | undefined,
  assigneeName?: string | null,
) => {
  const normalizedAssignee = normalizeLookupValue(assigneeName);
  if (!normalizedAssignee) return;
  const organizationKey = organizationId && organizationId > 0 ? String(organizationId) : "all";
  const requestKey = `${organizationKey}::${normalizedAssignee.toLowerCase()}`;
  if (seen.has(requestKey)) return;
  seen.add(requestKey);
  requests.push({ organizationId, assigneeName: normalizedAssignee });
};

const dedupeProjectsById = (rows: ProjectSummary[]) => {
  const items: ProjectSummary[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const projectId = Number(row?.id || 0);
    if (projectId <= 0 || seen.has(projectId)) continue;
    seen.add(projectId);
    items.push(row);
  }
  return items;
};

export const fetchProjectsForFieldUser = async (user: MobileSession["user"]) => {
  const requests: Array<{ organizationId?: number | null; assigneeName: string }> = [];
  const seen = new Set<string>();
  const organizationId = user.organization_id ?? null;

  appendProjectLookup(requests, seen, organizationId, user.full_name);
  appendProjectLookup(requests, seen, organizationId, user.work_username);
  appendProjectLookup(requests, seen, organizationId, user.user_uid);
  appendProjectLookup(requests, seen, organizationId, user.email);

  // Global public sponsor projects can be selected for an agent even when they are not tied to an organization.
  appendProjectLookup(requests, seen, null, user.user_uid);
  appendProjectLookup(requests, seen, null, user.work_username);

  if (!requests.length) return [] as ProjectSummary[];
  const results = await Promise.all(requests.map((request) => fetchProjects(request.organizationId, request.assigneeName)));
  return dedupeProjectsById(results.flat());
};

export const fetchOrganizationBranding = async (organizationId: number) => {
  const response = await api.get<{
    id: number;
    name?: string | null;
    slug?: string | null;
    status?: string | null;
    is_active?: boolean;
    logo_url?: string | null;
  }>(`/green/organizations/${organizationId}/branding`, {
    params: { _ts: Date.now() },
  });
  return response.data;
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

export const fetchSponsorAgentQrUnits = async (
  projectId: number,
  userId: number,
  organizationId?: number | null,
) => {
  const response = await api.get<SponsorAgentQrUnitSummary[]>("/green/agent/sponsor-qr-tags", {
    params: {
      _ts: Date.now(),
      sync: 1,
      project_id: projectId,
      user_id: userId,
      ...(organizationId ? { organization_id: organizationId } : {}),
    },
  });
  if (!Array.isArray(response.data)) return [] as SponsorAgentQrUnitSummary[];
  return response.data
    .map((row) => ({
      ...row,
      unit_id: Number(row?.unit_id || 0),
      project_id: Number(row?.project_id || projectId),
      tree_id: row?.tree_id === null || row?.tree_id === undefined ? null : Number(row.tree_id || 0),
      tree_project_no: row?.tree_project_no === null || row?.tree_project_no === undefined ? null : Number(row.tree_project_no || 0),
      assigned_work_order_id:
        row?.assigned_work_order_id === null || row?.assigned_work_order_id === undefined
          ? null
          : Number(row.assigned_work_order_id || 0),
      sponsor_account_id: row?.sponsor_account_id === null || row?.sponsor_account_id === undefined ? null : Number(row.sponsor_account_id || 0),
      qr_download_count:
        row?.qr_download_count === null || row?.qr_download_count === undefined ? 0 : Number(row.qr_download_count || 0),
    }))
    .filter((row) => row.unit_id > 0);
};

export const buildSponsorAgentQrSheetUrl = (
  projectId: number,
  userId: number,
  organizationId?: number | null,
) => {
  const params = new URLSearchParams({
    project_id: String(projectId),
    user_id: String(userId),
    sync: "1",
    _ts: String(Date.now()),
  });
  if (organizationId) {
    params.set("organization_id", String(organizationId));
  }
  return `${API_URL}/green/agent/sponsor-qr-tags/pdf?${params.toString()}`;
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

export const createGreenTree = async (
  input: GreenTreeCreateInput & {
    createdBy: string;
    photoUrl?: string | null;
    photoUrls?: string[] | null;
  },
) => {
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
    record_profile_data: input.recordProfileData ?? null,
    created_by_user_id: input.createdByUserId ?? null,
    created_by_organization_id: input.createdByOrganizationId ?? null,
    photo_url: input.photoUrl || null,
    photo_urls: input.photoUrls?.length ? input.photoUrls : null,
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
    record_profile_data: input.recordProfileData ?? undefined,
  });
  return response.data;
};

export const deleteGreenTree = async ({
  treeId,
  projectId,
  actorName,
}: {
  treeId: number;
  projectId?: number | null;
  actorName?: string | null;
}) => {
  const response = await api.delete(`/green/trees/${treeId}`, {
    params: {
      confirm_tree_id: treeId,
      ...(projectId ? { project_id: projectId } : {}),
      ...(actorName ? { actor_name: actorName } : {}),
    },
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
  const response = await api.get<ProjectDetailSummary>(`/green/projects/${projectId}`, {
    params: {
      _ts: Date.now(),
      ...(assigneeName ? { assignee_name: assigneeName } : {}),
    },
  });
  return response.data;
};

export const fetchSponsorAgentPayoutDashboard = async (userId: number, organizationId?: number | null, projectId?: number | null) => {
  const response = await api.get<SponsorAgentPayoutDashboard>("/green/agent-payouts/me", {
    params: {
      user_id: userId,
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(projectId ? { project_id: projectId } : {}),
      _ts: Date.now(),
    },
  });
  return response.data;
};

export const fetchSponsorAgentBankOptions = async (country = "NG") => {
  const response = await api.get<{ banks?: SponsorAgentBankOption[] }>("/green/agent-payouts/banks", {
    params: { country, _ts: Date.now() },
  });
  return Array.isArray(response.data?.banks) ? response.data.banks : [];
};

export const resolveSponsorAgentBankAccount = async (input: { bankCode: string; accountNumber: string }) => {
  const response = await api.post<{ ok?: boolean; account_name?: string | null; account_number?: string | null }>(
    "/green/agent-payouts/account/resolve",
    {
      bank_code: input.bankCode,
      account_number: input.accountNumber,
    },
  );
  return response.data;
};

export const saveSponsorAgentBankAccount = async (input: {
  userId: number;
  organizationId?: number | null;
  bankCode: string;
  bankName?: string | null;
  accountNumber: string;
  accountName?: string | null;
}) => {
  const response = await api.put<{ ok?: boolean; bank_account?: SponsorAgentBankAccount | null }>("/green/agent-payouts/account", {
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    bank_code: input.bankCode,
    bank_name: input.bankName ?? null,
    account_number: input.accountNumber,
    account_name: input.accountName ?? null,
  });
  return response.data;
};

export const createSponsorAgentPayoutRequest = async (input: { userId: number; organizationId?: number | null; projectId?: number | null }) => {
  const response = await api.post<{ ok?: boolean; request?: SponsorAgentPayoutRequest | null }>("/green/agent-payouts/requests", {
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    project_id: input.projectId ?? null,
  });
  return response.data;
};

export const fetchUsers = async (organizationId?: number | null) => {
  const response = await api.get<Array<{ id: number; full_name: string; role?: string | null; role_name?: string | null }>>("/green/users", {
    params: organizationId ? { organization_id: organizationId } : {},
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const registerGreenMobilePushToken = async (
  session: MobileSession,
  input: {
    token: string;
    platform?: string | null;
    appVersion?: string | null;
    projectId?: string | null;
    deviceLabel?: string | null;
  },
) => {
  const response = await api.post("/green/mobile/push-tokens/register", {
    user_id: session.user.id,
    organization_id: session.user.organization_id ?? null,
    user_uid: session.user.user_uid ?? null,
    full_name: session.user.full_name,
    token: input.token,
    platform: input.platform ?? null,
    app_version: input.appVersion ?? null,
    project_id: input.projectId ?? null,
    device_label: input.deviceLabel ?? null,
  });
  return response.data;
};

export const deactivateGreenMobilePushToken = async (session: MobileSession | null, token: string) => {
  const response = await api.post("/green/mobile/push-tokens/deactivate", {
    user_id: session?.user.id ?? null,
    token,
  });
  return response.data;
};

export const fetchTreeTasks = async (treeId: number) => {
  const response = await api.get<TaskSummary[]>(`/green/trees/${treeId}/tasks`);
  return Array.isArray(response.data) ? response.data.map(normalizeTaskSummary) : [];
};

export const fetchTreeTimeline = async (treeId: number) => {
  const response = await api.get(`/green/trees/${treeId}/timeline`);
  return response.data;
};

export const fetchTreePhotoDataUri = async (treeId: number, version?: string | null) => {
  const response = await api.get<{ data_uri?: string | null }>(`/green/trees/${treeId}/photo-inline`, {
    params: {
      w: 1280,
      q: 76,
      fm: "jpeg",
      ...(version ? { v: version } : {}),
    },
    timeout: 45000,
    headers: { Accept: "application/json" },
  });
  return String(response.data?.data_uri || "").trim();
};

export const changeGreenPassword = async (userId: number, currentPassword: string, newPassword: string) => {
  const response = await api.post("/green/auth/change-password", {
    user_id: userId,
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
};

export const updateGreenUserProfilePhoto = async (session: MobileSession, photoUrl: string) => {
  const response = await api.post("/green/auth/update-profile-photo", {
    user_id: session.user.id,
    organization_id: session.user.organization_id ?? null,
    profile_photo_url: photoUrl,
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
  folder: string;
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
