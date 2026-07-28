export type AppMode = "green" | "green_sponsor";
export type AuthMode = "env_admin" | "partner_user" | "sponsor_user";
export type WorkflowProfile = "green" | "agric" | "relief_recovery" | "csr";
export type ProjectAccessModel = "partner_org" | "public_sponsorship";
export type SponsorAccountType = "individual" | "organization";

export type AgricProjectConfig = {
  program_type?: "extension_support" | "input_support" | "traceability" | "finance_insurance" | "mixed" | string | null;
  focus_commodities?: string | null;
  support_packages?: string | null;
  season_label?: string | null;
};

export type ReliefProjectConfig = {
  program_type?: "emergency_relief" | "shelter_recovery" | "construction_materials" | "infrastructure_rehab" | "cash_voucher" | "mixed" | string | null;
  intervention_focus?: string | null;
  package_types?: string | null;
  target_zone?: string | null;
};

export type CsrProjectConfig = {
  program_type?: "tree_planting" | "urban_greening" | "school_greening" | "community_restoration" | "employee_volunteering" | "mixed" | string | null;
  client_name?: string | null;
  implementation_scope?: string | null;
  reporting_cycle?: string | null;
  target_outcomes?: string | null;
};

export type AgricFarmerProfile = {
  farmer_code?: string | null;
  gender?: "male" | "female" | string | null;
  date_of_birth?: string | null;
  national_id?: string | null;
  state_name?: string | null;
  ward_name?: string | null;
  farmer_group?: string | null;
  household_size?: number | null;
  primary_crop?: string | null;
  secondary_crops?: string | null;
  land_tenure?: string | null;
  irrigation_access?: string | null;
  finance_access?: boolean | null;
  insurance_access?: boolean | null;
  input_support_needs?: string | null;
};

export type ReliefBeneficiaryProfile = {
  beneficiary_code?: string | null;
  government_id?: string | null;
  displacement_status?: string | null;
  origin_location?: string | null;
  current_settlement?: string | null;
  support_category?: string | null;
  priority_needs?: string | null;
  livelihood_type?: string | null;
  vulnerability_flags?: string | null;
  relief_gender?: string | null;
  shelter_status?: string | null;
  household_size?: number | null;
  women_count?: number | null;
  children_under_five?: number | null;
  elderly_count?: number | null;
  disability_count?: number | null;
};

export type AgricPlotProfile = {
  plot_code?: string | null;
  plot_name?: string | null;
  commodity?: string | null;
  variety?: string | null;
  season_name?: string | null;
  season_year?: number | null;
  land_use?: string | null;
  irrigation_type?: string | null;
  production_stage?: string | null;
  estimated_yield_kg?: number | null;
  boundary_capture_method?: "point" | "polygon_map" | "polygon_gps_walk" | string | null;
  area_hectares?: number | null;
  support_placeholder?: boolean | null;
  hidden_from_records?: boolean | null;
  placeholder_reason?: string | null;
};

export type ReliefSiteProfile = {
  asset_code?: string | null;
  asset_name?: string | null;
  asset_type?: string | null;
  damage_level?: string | null;
  occupancy_status?: string | null;
  tenure_status?: string | null;
  response_pathway?: string | null;
  floor_area_sqm?: number | null;
  rooms_count?: number | null;
  estimated_repair_cost?: number | null;
  population_served?: number | null;
  support_package?: string | null;
  safety_risks?: string | null;
  reported_need?: string | null;
  relief_boundary_capture_method?: "point" | "line_map" | "line_gps_walk" | "polygon_map" | "polygon_gps_walk" | string | null;
  area_hectares?: number | null;
  support_placeholder?: boolean | null;
  hidden_from_records?: boolean | null;
  placeholder_reason?: string | null;
};

export type FieldRecordProfile = Record<string, unknown> & Partial<AgricPlotProfile> & Partial<ReliefSiteProfile>;

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
  work_username?: string | null;
  email?: string | null;
  phone?: string | null;
  account_type?: SponsorAccountType | string | null;
  sponsor_uid?: string | null;
  entity_category?: string | null;
  leaderboard_visibility?: string | null;
  profile_photo_url?: string | null;
  current_avatar_border?: string | null;
  current_map_icon?: string | null;
};

export type MobileSession = {
  authed: true;
  appMode: AppMode;
  auth_mode: AuthMode;
  logged_in_at: string;
  access_token: string;
  session_uid?: string | null;
  expires_at?: string | null;
  idle_timeout_at?: string | null;
  mfa_enabled?: boolean;
  mfa_verified?: boolean;
  user: AuthUser;
};

export type ProjectSummary = {
  id: number;
  organization_id?: number | null;
  name: string;
  location_text?: string | null;
  sponsor?: string | null;
  workflow_profile?: WorkflowProfile | null;
  agric_config?: AgricProjectConfig | null;
  relief_config?: ReliefProjectConfig | null;
  csr_config?: CsrProjectConfig | null;
  planting_model?: string | null;
  allow_existing_tree_link?: boolean | null;
  default_existing_tree_scope?: string | null;
  created_at?: string | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  organization_status?: string | null;
  organization_logo_url?: string | null;
  access_model?: ProjectAccessModel | string | null;
  public_sponsor_enabled?: boolean | null;
  public_sponsor_title?: string | null;
  public_sponsor_description?: string | null;
  public_title?: string | null;
  public_description?: string | null;
  sponsor_price_per_tree_ngn?: number | null;
  sponsor_price_per_tree_usd?: number | null;
  sponsor_price_per_tree?: number | null;
  sponsor_currency?: string | null;
  available_sponsor_currencies?: string[];
  sponsor_price_options?: Record<string, number>;
  sponsor_capacity?: number | null;
  sponsor_max_per_order?: number | null;
  sponsor_dedication_enabled?: boolean | null;
  sponsor_payment_instructions?: string | null;
  flutterwave_available?: boolean | null;
  manual_payment_available?: boolean | null;
  sponsor_checkout_ready?: boolean | null;
  sponsor_launch_note?: string | null;
  slots_reserved?: number | null;
  slots_awaiting_payment?: number | null;
  slots_awaiting_tree?: number | null;
  slots_linked?: number | null;
  slots_available?: number | null;
  status?: string | null;
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
  profile_data?: AgricFarmerProfile | ReliefBeneficiaryProfile | Record<string, unknown> | null;
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

export type SponsorAgentQrUnitSummary = {
  unit_id: number;
  unit_uid?: string | null;
  project_id: number;
  tree_id?: number | null;
  tree_project_no?: number | null;
  assigned_work_order_id?: number | null;
  sponsorship_status?: string | null;
  dedication_type?: string | null;
  dedication_name?: string | null;
  dedication_message?: string | null;
  assigned_at?: string | null;
  qr_download_count?: number | null;
  first_qr_downloaded_at?: string | null;
  last_qr_downloaded_at?: string | null;
  last_qr_downloaded_by?: string | null;
  sponsor_account_id?: number | null;
  sponsor_name?: string | null;
  sponsor_organization_name?: string | null;
  project_name?: string | null;
  location_text?: string | null;
  species?: string | null;
  tree_status?: string | null;
  download_status?: "downloaded" | "pending_download" | string | null;
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

export type ProjectDetailSummary = ProjectSummary & {
  stats?: {
    total?: number;
    total_all?: number;
    alive?: number;
    dead?: number;
    needs_attention?: number;
    survival_rate?: number;
  } | null;
  settings?: {
    workflow_profile?: WorkflowProfile | null;
    agric_config?: AgricProjectConfig | null;
    relief_config?: ReliefProjectConfig | null;
    csr_config?: CsrProjectConfig | null;
    planting_model?: string | null;
    allow_existing_tree_link?: boolean | null;
    default_existing_tree_scope?: string | null;
    access_model?: ProjectAccessModel | string | null;
    public_sponsor_enabled?: boolean | null;
    public_sponsor_title?: string | null;
    public_sponsor_description?: string | null;
    sponsor_price_per_tree_ngn?: number | null;
    sponsor_price_per_tree_usd?: number | null;
    sponsor_price_per_tree?: number | null;
    sponsor_currency?: string | null;
    available_sponsor_currencies?: string[];
    sponsor_price_options?: Record<string, number>;
    sponsor_capacity?: number | null;
    sponsor_max_per_order?: number | null;
    sponsor_dedication_enabled?: boolean | null;
    sponsor_payment_instructions?: string | null;
  } | null;
  community?: {
    custodians_total?: number;
    households?: number;
    schools?: number;
    community_groups?: number;
    distribution_events?: number;
    seedlings_distributed?: number;
    distribution_allocations?: number;
    seedlings_allocated?: number;
  } | null;
  carbon?: CarbonSummary | null;
};

export type SponsorOrderSummary = {
  id: number;
  order_uid?: string | null;
  project_id: number;
  project_name?: string | null;
  location_text?: string | null;
  quantity: number;
  amount_per_tree: number;
  amount_total: number;
  currency?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  payment_provider?: string | null;
  payment_link?: string | null;
  payment_gateway_reference?: string | null;
  payment_gateway_transaction_id?: number | null;
  payment_gateway_status?: string | null;
  payment_verified_at?: string | null;
  payment_proof_url?: string | null;
  payment_proof_urls?: string[];
  dedication_type?: string | null;
  dedication_name?: string | null;
  dedication_message?: string | null;
  purchaser_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  linked_units?: number;
  awaiting_tree_units?: number;
  awaiting_payment_units?: number;
  total_units?: number;
};

export type SponsorOrderPaymentInitResult = {
  ok: boolean;
  order_id: number;
  order_uid: string;
  payment_method?: string | null;
  payment_status?: string | null;
  payment_link?: string | null;
};

export type SponsorCarbonSummary = {
  current_co2_kg: number;
  annual_co2_kg: number;
  lifetime_co2_kg: number;
};

export type SponsorTreeTimelineItem = {
  id: number;
  task_type?: string | null;
  status?: string | null;
  review_state?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[];
  completed_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  reported_tree_status?: string | null;
  activity_lng?: number | null;
  activity_lat?: number | null;
  activity_recorded_at?: string | null;
};

export type SponsorTreeSummary = {
  unit_id: number;
  unit_uid?: string | null;
  sponsorship_status?: string | null;
  linked_at?: string | null;
  dedication_type?: string | null;
  dedication_name?: string | null;
  dedication_message?: string | null;
  order_id?: number | null;
  order_uid?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  order_created_at?: string | null;
  project_id: number;
  project_name?: string | null;
  location_text?: string | null;
  tree_id?: number | null;
  project_tree_no?: number | null;
  species?: string | null;
  tree_status?: string | null;
  planting_date?: string | null;
  photo_url?: string | null;
  photo_urls?: string[];
  tree_height_m?: number | null;
  tree_age_months?: number | null;
  inventory_tree_count?: number | null;
  count_in_carbon_scope?: boolean | null;
  tree_created_at?: string | null;
  lng?: number | null;
  lat?: number | null;
  carbon?: SponsorCarbonSummary | null;
};

export type SponsorTreeDetail = SponsorTreeSummary & {
  tree_notes?: string | null;
  created_by?: string | null;
  timeline: SponsorTreeTimelineItem[];
};

export type SponsorAgentBankOption = {
  code: string;
  name: string;
};

export type SponsorAgentBankAccount = {
  id: number;
  user_id: number;
  organization_id?: number | null;
  currency?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_number_masked?: string | null;
  account_name?: string | null;
  verified_at?: string | null;
  verified?: boolean;
};

export type SponsorAgentPayoutRequest = {
  id: number;
  request_uid?: string | null;
  user_id: number;
  user_name?: string | null;
  user_uid?: string | null;
  organization_id?: number | null;
  currency?: string | null;
  amount_total: number;
  payout_minimum?: number | null;
  status?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_number_masked?: string | null;
  account_name?: string | null;
  earning_keys?: string[];
  earning_count?: number;
  project_ids?: number[];
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  settlement_channel?: string | null;
  settlement_reference?: string | null;
  transfer_reference?: string | null;
  transfer_id?: number | null;
  transfer_status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SponsorAgentEarningRow = {
  earning_key: string;
  work_type: "planting" | "maintenance" | string;
  project_id: number;
  project_name?: string | null;
  currency?: string | null;
  amount: number;
  tree_id?: number | null;
  task_id?: number | null;
  unit_id?: number | null;
  order_id?: number | null;
  order_uid?: string | null;
  project_tree_no?: number | null;
  tree_label?: string | null;
  species?: string | null;
  actor_name?: string | null;
  task_label?: string | null;
  earned_at?: string | null;
  sponsor_name?: string | null;
  sponsor_organization_name?: string | null;
  payout_status?: string | null;
  payout_request_id?: number | null;
  payout_request_uid?: string | null;
  payout_requested_at?: string | null;
  payout_paid_at?: string | null;
};

export type SponsorAgentProjectPayoutSummary = {
  project_id: number;
  project_name?: string | null;
  location_text?: string | null;
  currency?: string | null;
  planting_fee?: number | null;
  maintenance_fee?: number | null;
};

export type SponsorAgentProjectEarningsSummary = {
  project_id: number;
  project_name?: string | null;
  currency?: string | null;
  available_amount: number;
  requested_amount: number;
  paid_amount: number;
  planting_count: number;
  maintenance_count: number;
};

export type SponsorAgentPayoutDashboard = {
  eligible: boolean;
  minimum_payout_amount: number;
  currency?: string | null;
  auto_payout_available?: boolean;
  user?: {
    id: number;
    full_name?: string | null;
    user_uid?: string | null;
    organization_id?: number | null;
    organization_name?: string | null;
  } | null;
  bank_account?: SponsorAgentBankAccount | null;
  projects?: SponsorAgentProjectPayoutSummary[];
  summary?: {
    eligible_project_count?: number;
    planting_count?: number;
    maintenance_count?: number;
    total_earnings_amount?: number;
    available_amount?: number;
    requested_amount?: number;
    paid_amount?: number;
    pending_request_count?: number;
    paid_request_count?: number;
    payout_eligible?: boolean;
    bank_verified?: boolean;
  } | null;
  project_summaries?: SponsorAgentProjectEarningsSummary[];
  earnings?: SponsorAgentEarningRow[];
  requests?: SponsorAgentPayoutRequest[];
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
  record_profile_data?: FieldRecordProfile | null;
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
  supervision_visit_no?: number | null;
  supervision_total_visits?: number | null;
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
  tree_planting_date?: string | null;
  tree_origin?: string | null;
  tree_height_m?: number | null;
  tree_age_months?: number | null;
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
  recordProfileData?: FieldRecordProfile | null;
  createdByUserId?: number | null;
  createdByOrganizationId?: number | null;
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
  recordProfileData?: FieldRecordProfile | null;
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
