export type AppMode = "green";
export type AuthMode = "env_admin" | "partner_user";

export type AuthUser = {
  id: number;
  user_uid?: string | null;
  full_name: string;
  role?: string | null;
  role_key?: string | null;
  role_name?: string | null;
  allow_work?: boolean;
  allow_green?: boolean;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  organization_status?: string | null;
  organization_is_active?: boolean;
  organization_logo_url?: string | null;
};

export type MobileSession = {
  authed: true;
  appMode: AppMode;
  auth_mode: AuthMode;
  logged_in_at: string;
  user: AuthUser;
};

export type ProjectSummary = {
  id: number;
  organization_id?: number | null;
  name: string;
  location_text?: string | null;
  sponsor?: string | null;
  planting_model?: string | null;
  allow_existing_tree_link?: boolean | null;
  default_existing_tree_scope?: string | null;
  created_at?: string | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  organization_status?: string | null;
  organization_logo_url?: string | null;
};

export type CustodianSummary = {
  id: number;
  project_id: number;
  custodian_type: "household" | "school" | "community_group" | string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  address_text?: string | null;
  local_government?: string | null;
  community_name?: string | null;
  verification_status?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SpeciesAllocation = {
  species: string;
  count: number;
};

export type WorkOrderSummary = {
  id: number;
  project_id: number;
  assignee_name: string;
  work_type: "planting" | "maintenance" | string;
  target_trees?: number | null;
  species_allocations?: SpeciesAllocation[] | null;
  maintenance_schedule?: string | null;
  auto_assign_first_cycle_maintenance?: boolean | null;
  due_date?: string | null;
  status?: string | null;
  area_enabled?: boolean | null;
  area_label?: string | null;
  area_geojson?: Record<string, unknown> | string | null;
  allow_existing_tree_area_reuse?: boolean | null;
  planted_count?: number | null;
  last_update?: string | null;
  created_at?: string | null;
};

export type DistributionAllocationSummary = {
  id: number;
  event_id: number;
  project_id: number;
  custodian_id: number;
  custodian_name?: string | null;
  custodian_type?: string | null;
  event_date?: string | null;
  species?: string | null;
  event_quantity?: number | null;
  quantity_allocated?: number | null;
  supervision_target?: number | null;
  expected_planting_start?: string | null;
  expected_planting_end?: string | null;
  followup_cycle_days?: number | null;
  notes?: string | null;
  supervision_assigned?: number | null;
  supervision_done?: number | null;
  supervision_live?: number | null;
  supervision_remaining?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CarbonSummary = {
  project_id?: number | null;
  current_co2_kg: number;
  current_co2_tonnes: number;
  annual_co2_kg: number;
  annual_co2_tonnes: number;
  projected_lifetime_co2_tonnes: number;
  co2_per_tree_avg_kg: number;
  trees_missing_age_data?: number;
  trees_with_fallback_age?: number;
  trees_pending_review?: number;
};

export type TreeSummary = {
  id: number;
  project_id: number;
  project_tree_no?: number | null;
  species?: string | null;
  planting_date?: string | null;
  status?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[] | null;
  created_by?: string | null;
  created_at?: string | null;
  tree_origin?: "new_planting" | "existing_inventory" | "natural_regeneration" | string | null;
  custodian_id?: number | null;
  tree_height_m?: number | null;
  tree_age_months?: number | null;
  inventory_tree_count?: number | null;
  existing_area_geojson?: Record<string, unknown> | string | null;
  existing_area_sqm?: number | null;
  custodian_name?: string | null;
  maintenance_count?: number | null;
  maintenance_done?: number | null;
  maintenance_pending?: number | null;
  maintenance_overdue?: number | null;
  maintenance_types?: string | null;
  last_maintenance_type?: string | null;
  last_maintenance_date?: string | null;
  lng?: number | null;
  lat?: number | null;
  sync_state?: "live" | "pending";
};

export type TaskSummary = {
  id: number;
  tree_id: number;
  task_type: string;
  assignee_name?: string | null;
  due_date?: string | null;
  priority?: string | null;
  status?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[] | null;
  created_at?: string | null;
  completed_at?: string | null;
  review_state?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  auto_generated?: boolean | null;
  model_season?: string | null;
  source_task_id?: number | null;
  reported_tree_status?: string | null;
  activity_lng?: number | null;
  activity_lat?: number | null;
  activity_recorded_at?: string | null;
  tree_status?: string | null;
  tree_species?: string | null;
  tree_planting_date?: string | null;
  lng?: number | null;
  lat?: number | null;
  custodian_name?: string | null;
  sync_state?: "live" | "pending";
};

export type ReviewQueueItem = {
  id: number;
  tree_id: number;
  task_type: string;
  assignee_name?: string | null;
  status?: string | null;
  review_state?: string | null;
  priority?: string | null;
  due_date?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[] | null;
  submitted_at?: string | null;
  created_at?: string | null;
  reported_tree_status?: string | null;
  review_notes?: string | null;
  activity_lng?: number | null;
  activity_lat?: number | null;
  activity_recorded_at?: string | null;
  project_id?: number | null;
  tree_status?: string | null;
  tree_species?: string | null;
  tree_lng?: number | null;
  tree_lat?: number | null;
  custodian_name?: string | null;
};

export type PrivacyPolicyMeta = {
  consent_version: string;
  scopes: Record<
    string,
    {
      title: string;
      summary: string;
    }
  >;
};

export type OfflineStats = {
  queued: number;
  cachedProjects: number;
  cachedTasks: number;
  cachedTrees: number;
  failed: number;
  lastSyncedAt?: string | null;
};

export type GreenSyncProgress = {
  active: boolean;
  total: number;
  completed: number;
  synced: number;
  failed: number;
  conflicts: number;
  percent: number;
  currentLabel?: string | null;
};

export type DraftPhoto = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type GreenTreeCreateInput = {
  projectId: number;
  species: string;
  plantingDate?: string | null;
  status?: string;
  notes?: string;
  lng: number;
  lat: number;
  photos?: DraftPhoto[];
  treeHeightM?: number | null;
  treeOrigin?: "new_planting" | "existing_inventory" | "natural_regeneration";
  attributionScope?: "full" | "monitor_only";
  countInPlantingKpis?: boolean;
  countInCarbonScope?: boolean;
  custodianId?: number | null;
  treeAgeMonths?: number | null;
  inventoryTreeCount?: number | null;
  existingAreaGeojson?: Record<string, unknown> | null;
};

export type GreenTreeUpdateInput = {
  projectId: number;
  treeId: number;
  species?: string;
  plantingDate?: string | null;
  status?: string;
  notes?: string;
  lng?: number | null;
  lat?: number | null;
  treeHeightM?: number | null;
  treeAgeMonths?: number | null;
  custodianId?: number | null;
  inventoryTreeCount?: number | null;
  existingAreaGeojson?: Record<string, unknown> | null;
};

export type GreenTaskMutationInput = {
  projectId: number;
  taskId: number;
  treeId: number;
  actorName?: string;
  status?: string;
  notes?: string;
  treeStatus?: string;
  activityLat?: number | null;
  activityLng?: number | null;
  activityRecordedAt?: string | null;
  photos?: DraftPhoto[];
  existingPhotoUrl?: string | null;
  existingPhotoUrls?: string[] | null;
};

export type QueueActionType =
  | "create_tree"
  | "update_tree"
  | "update_task"
  | "submit_task"
  | "upload_tree_photos"
  | "upload_task_photos";

export type SyncQueueRow = {
  id: number;
  action_type: QueueActionType;
  project_id?: number | null;
  task_id?: number | null;
  tree_id?: number | null;
  entity_type?: string | null;
  entity_id?: string | null;
  payload: string;
  status: "pending" | "syncing" | "failed" | "synced";
  retry_count?: number | null;
  last_error?: string | null;
  created_at: string;
  updated_at?: string | null;
  synced_at?: string | null;
};
