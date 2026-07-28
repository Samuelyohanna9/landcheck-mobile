import { api } from "./client";
import { API_URL } from "../config/env";
import { resolveGreenAssetUrl } from "../utils/assets";
import type {
  MobileSession,
  SponsorOrderPaymentInitResult,
  ProjectSummary,
  SponsorOrderSummary,
  SponsorTreeDetail,
  SponsorTreeSummary,
} from "../types/domain";

export const SPONSOR_TERMS_VERSION = "2026-06-06-v1";

const normalizePhotoUrl = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return resolveGreenAssetUrl(raw) || raw;
};

const normalizePhotoUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  value.forEach((item) => {
    const next = normalizePhotoUrl(item);
    if (!next || seen.has(next)) return;
    seen.add(next);
    output.push(next);
  });
  return output;
};

const normalizeProject = (project: any): ProjectSummary => ({
  ...(project || {}),
  public_sponsor_enabled: Boolean(project?.public_sponsor_enabled),
  sponsor_checkout_ready:
    project?.sponsor_checkout_ready === null || project?.sponsor_checkout_ready === undefined
      ? null
      : Boolean(project.sponsor_checkout_ready),
  sponsor_launch_note: project?.sponsor_launch_note ? String(project.sponsor_launch_note) : null,
  flutterwave_available: project?.flutterwave_available === null || project?.flutterwave_available === undefined
    ? null
    : Boolean(project.flutterwave_available),
  manual_payment_available: project?.manual_payment_available === null || project?.manual_payment_available === undefined
    ? null
    : Boolean(project.manual_payment_available),
  sponsor_price_per_tree:
    project?.sponsor_price_per_tree === null || project?.sponsor_price_per_tree === undefined
      ? null
      : Number(project.sponsor_price_per_tree || 0),
  sponsor_price_per_tree_ngn:
    project?.sponsor_price_per_tree_ngn === null || project?.sponsor_price_per_tree_ngn === undefined
      ? null
      : Number(project.sponsor_price_per_tree_ngn || 0),
  sponsor_price_per_tree_usd:
    project?.sponsor_price_per_tree_usd === null || project?.sponsor_price_per_tree_usd === undefined
      ? null
      : Number(project.sponsor_price_per_tree_usd || 0),
  available_sponsor_currencies: Array.isArray(project?.available_sponsor_currencies)
    ? project.available_sponsor_currencies
        .map((item: unknown) => String(item || "").trim().toUpperCase())
        .filter((item: string, index: number, arr: string[]) => item.length === 3 && arr.indexOf(item) === index)
    : [
        project?.sponsor_price_per_tree_ngn ? "NGN" : null,
        project?.sponsor_price_per_tree_usd ? "USD" : null,
        !project?.sponsor_price_per_tree_ngn && !project?.sponsor_price_per_tree_usd && project?.sponsor_price_per_tree
          ? String(project?.sponsor_currency || "NGN").trim().toUpperCase()
          : null,
      ].filter((item: string | null): item is string => Boolean(item)),
  sponsor_price_options:
    project?.sponsor_price_options && typeof project.sponsor_price_options === "object"
      ? Object.fromEntries(
          Object.entries(project.sponsor_price_options).flatMap(([currency, amount]) => {
            const code = String(currency || "").trim().toUpperCase();
            const numeric = Number(amount || 0);
            return code.length === 3 && Number.isFinite(numeric) && numeric > 0 ? [[code, numeric]] : [];
          }),
        )
      : {},
  sponsor_capacity:
    project?.sponsor_capacity === null || project?.sponsor_capacity === undefined
      ? null
      : Number(project.sponsor_capacity || 0),
  sponsor_max_per_order:
    project?.sponsor_max_per_order === null || project?.sponsor_max_per_order === undefined
      ? null
      : Number(project.sponsor_max_per_order || 0),
  slots_reserved:
    project?.slots_reserved === null || project?.slots_reserved === undefined ? null : Number(project.slots_reserved || 0),
  slots_awaiting_payment:
    project?.slots_awaiting_payment === null || project?.slots_awaiting_payment === undefined
      ? null
      : Number(project.slots_awaiting_payment || 0),
  slots_awaiting_tree:
    project?.slots_awaiting_tree === null || project?.slots_awaiting_tree === undefined
      ? null
      : Number(project.slots_awaiting_tree || 0),
  slots_linked:
    project?.slots_linked === null || project?.slots_linked === undefined ? null : Number(project.slots_linked || 0),
  slots_available:
    project?.slots_available === null || project?.slots_available === undefined ? null : Number(project.slots_available || 0),
});

const normalizeOrder = (row: any): SponsorOrderSummary => ({
  ...(row || {}),
  quantity: Number(row?.quantity || 0),
  amount_per_tree: Number(row?.amount_per_tree || 0),
  amount_total: Number(row?.amount_total || 0),
  payment_gateway_transaction_id:
    row?.payment_gateway_transaction_id === null || row?.payment_gateway_transaction_id === undefined
      ? null
      : Number(row.payment_gateway_transaction_id || 0),
  linked_units: Number(row?.linked_units || 0),
  awaiting_tree_units: Number(row?.awaiting_tree_units || 0),
  awaiting_payment_units: Number(row?.awaiting_payment_units || 0),
  total_units: Number(row?.total_units || 0),
  payment_proof_urls: normalizePhotoUrls(row?.payment_proof_urls),
});

const normalizeTree = (row: any): SponsorTreeSummary => ({
  ...(row || {}),
  project_id: Number(row?.project_id || 0),
  unit_id: Number(row?.unit_id || 0),
  tree_id: row?.tree_id === null || row?.tree_id === undefined ? null : Number(row.tree_id || 0),
  project_tree_no: row?.project_tree_no === null || row?.project_tree_no === undefined ? null : Number(row.project_tree_no || 0),
  lng: row?.lng === null || row?.lng === undefined ? null : Number(row.lng),
  lat: row?.lat === null || row?.lat === undefined ? null : Number(row.lat),
  photo_url: normalizePhotoUrl(row?.photo_url),
  tree_height_m: row?.tree_height_m === null || row?.tree_height_m === undefined ? null : Number(row.tree_height_m),
  tree_age_months: row?.tree_age_months === null || row?.tree_age_months === undefined ? null : Number(row.tree_age_months),
  inventory_tree_count:
    row?.inventory_tree_count === null || row?.inventory_tree_count === undefined ? null : Number(row.inventory_tree_count),
  photo_urls: normalizePhotoUrls(row?.photo_urls),
  carbon: row?.carbon
    ? {
        current_co2_kg: Number(row.carbon.current_co2_kg || 0),
        annual_co2_kg: Number(row.carbon.annual_co2_kg || 0),
        lifetime_co2_kg: Number(row.carbon.lifetime_co2_kg || 0),
      }
    : null,
});

export const fetchPublicSponsorshipProjects = async () => {
  const response = await api.get("/green/public-projects");
  return (Array.isArray(response.data) ? response.data : []).map(normalizeProject);
};

export const fetchPublicSponsorshipProject = async (projectId: number) => {
  const response = await api.get(`/green/public-projects/${projectId}`);
  return normalizeProject(response.data || {});
};

export const createSponsorOrder = async (
  session: MobileSession,
  payload: {
    project_id: number;
    quantity: number;
    checkout_currency?: string | null;
    dedication_type?: string | null;
    dedication_name?: string | null;
    dedication_message?: string | null;
    purchaser_note?: string | null;
    payment_method?: string | null;
    payment_reference?: string | null;
    payment_proof_url?: string | null;
    accepted_terms?: boolean;
    accepted_policy?: boolean;
    consent_version?: string | null;
  },
): Promise<SponsorOrderPaymentInitResult> => {
  const response = await api.post("/green/sponsor/orders", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return {
    ok: Boolean(response.data?.ok),
    order_id: Number(response.data?.order_id || 0),
    order_uid: String(response.data?.order_uid || ""),
    payment_method: response.data?.payment_method ? String(response.data.payment_method) : null,
    payment_status: response.data?.payment_status ? String(response.data.payment_status) : null,
    payment_link: response.data?.payment_link ? String(response.data.payment_link) : null,
  };
};

export const fetchSponsorOrderPaymentStatus = async (session: MobileSession, orderUid: string, refresh = false) => {
  const response = await api.get(`/green/sponsor/orders/${encodeURIComponent(orderUid)}/payment-status`, {
    params: {
      sponsor_id: session.user.id,
      refresh,
    },
  });
  return normalizeOrder(response.data || {});
};

export const fetchSponsorOrders = async (session: MobileSession) => {
  const response = await api.get("/green/sponsor/orders", {
    params: { sponsor_id: session.user.id },
  });
  return (Array.isArray(response.data) ? response.data : []).map(normalizeOrder);
};

export const fetchSponsorTrees = async (session: MobileSession) => {
  const response = await api.get("/green/sponsor/trees", {
    params: { sponsor_id: session.user.id },
  });
  return (Array.isArray(response.data) ? response.data : []).map(normalizeTree);
};

export const fetchSponsorTreeDetail = async (session: MobileSession, unitId: number): Promise<SponsorTreeDetail> => {
  const response = await api.get(`/green/sponsor/trees/${unitId}`, {
    params: { sponsor_id: session.user.id },
  });
  const payload = response.data || {};
  return {
    ...normalizeTree(payload),
    tree_notes: payload?.tree_notes || null,
    created_by: payload?.created_by || null,
    timeline: Array.isArray(payload?.timeline)
      ? payload.timeline.map((item: any) => ({
          ...(item || {}),
          id: Number(item?.id || 0),
          photo_url: normalizePhotoUrl(item?.photo_url),
          photo_urls: normalizePhotoUrls(item?.photo_urls),
          activity_lat: item?.activity_lat === null || item?.activity_lat === undefined ? null : Number(item.activity_lat),
          activity_lng: item?.activity_lng === null || item?.activity_lng === undefined ? null : Number(item.activity_lng),
        }))
      : [],
  };
};

export const buildSponsorCertificateUrl = (session: MobileSession, unitId: number) =>
  `${API_URL}/green/sponsor/trees/${unitId}/certificate/pdf?sponsor_id=${session.user.id}&access_token=${encodeURIComponent(session.access_token)}`;

export const buildSponsorPublicTreeStoryUrl = (unitUid?: string | null) => {
  const normalized = encodeURIComponent(String(unitUid || "").trim());
  return normalized ? `${API_URL}/green/sponsor/public/trees/${normalized}` : "";
};

export const buildSponsorPublicCertificateUrl = (unitUid?: string | null) => {
  const normalized = encodeURIComponent(String(unitUid || "").trim());
  return normalized ? `${API_URL}/green/sponsor/public/trees/${normalized}/certificate.pdf` : "";
};

export const buildSponsorTermsUrl = () => `${API_URL}/green/sponsor/public/terms`;

export const buildSponsorPrivacyUrl = () => "https://landcheck.online/privacy";


export const registerGreenSponsorMobilePushToken = async (
  session: MobileSession,
  input: {
    token: string;
    platform?: string | null;
    appVersion?: string | null;
    deviceLabel?: string | null;
  },
) => {
  const response = await api.post("/green/sponsor/mobile/push-tokens/register", {
    sponsor_id: session.user.id,
    token: input.token,
    platform: input.platform ?? null,
    app_version: input.appVersion ?? null,
    device_label: input.deviceLabel ?? null,
  });
  return response.data;
};

export const deactivateGreenSponsorMobilePushToken = async (session: MobileSession | null, token: string) => {
  const response = await api.post("/green/sponsor/mobile/push-tokens/deactivate", {
    sponsor_id: session?.user.id ?? null,
    token,
  });
  return response.data;
};

export type SponsorProfileSettingsPayload = {
  entity_category?: string;
  leaderboard_visibility?: string;
};

export type SponsorAchievements = {
  total_trees: number;
  level: string;
  badge_code: string;
  badge_emoji: string;
  next_level: string | null;
  next_level_threshold: number | null;
  progress_percentage: number;
};

export type LeaderboardEntry = {
  sponsor_id: number;
  display_name: string;
  entity_category: string;
  monthly_trees: number;
  all_time_trees: number;
  achievement_level: string;
  rank: number;
};

export type SponsorLeaderboardData = {
  top_overall: LeaderboardEntry[];
  top_schools: LeaderboardEntry[];
  top_communities: LeaderboardEntry[];
  top_companies: LeaderboardEntry[];
};

export const updateSponsorProfileSettings = async (
  session: MobileSession,
  payload: SponsorProfileSettingsPayload,
) => {
  const response = await api.patch("/green/sponsor/profile/settings", payload, {
    params: { sponsor_id: session.user.id },
  });
  return response.data;
};

export const fetchSponsorAchievements = async (
  session: MobileSession,
): Promise<SponsorAchievements> => {
  const response = await api.get("/green/sponsor/profile/achievements", {
    params: { sponsor_id: session.user.id },
  });
  return response.data;
};

export const fetchPublicLeaderboard = async (): Promise<SponsorLeaderboardData> => {
  const response = await api.get("/green/sponsor/public/leaderboard");
  return response.data;
};


export type SponsorPointsInfo = {
  id: number;
  green_points: number;
  lifetime_points: number;
  sponsor_tree_points_earned: number;
  merch_points_spent: number;
  merch_eligible_points: number;
  referral_code: string;
  referred_by_id: number | null;
  point_booster_multiplier: number;
  point_booster_remaining_uses: number;
  profile_photo_url: string | null;
  unlocked_species: string[];
  unlocked_avatars: string[];
  unlocked_map_icons: string[];
  current_avatar_border: string | null;
  current_map_icon: string | null;
  referral_rules_met: boolean;
  personal_sponsor_met: boolean;
  conversion_rate_met: boolean;
  personal_trees_sponsored: number;
  total_referred_users: number;
  converted_referred_users: number;
};

export type SponsorSocialFollowClaim = {
  id: number;
  sponsor_id: number;
  facebook_screenshot_url: string | null;
  instagram_screenshot_url: string | null;
  facebook_opened: boolean;
  instagram_opened: boolean;
  status: string;
  supervisor_note: string | null;
  points_awarded: boolean;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

const normalizeSponsorSocialFollowClaim = (row: any): SponsorSocialFollowClaim => ({
  id: Number(row?.id || 0),
  sponsor_id: Number(row?.sponsor_id || 0),
  facebook_screenshot_url: normalizePhotoUrl(row?.facebook_screenshot_url),
  instagram_screenshot_url: normalizePhotoUrl(row?.instagram_screenshot_url),
  facebook_opened: Boolean(row?.facebook_opened),
  instagram_opened: Boolean(row?.instagram_opened),
  status: row?.status ? String(row.status) : "pending",
  supervisor_note: row?.supervisor_note ? String(row.supervisor_note) : null,
  points_awarded: Boolean(row?.points_awarded),
  created_at: row?.created_at ? String(row.created_at) : null,
  updated_at: row?.updated_at ? String(row.updated_at) : null,
  submitted_at: row?.submitted_at ? String(row.submitted_at) : null,
  reviewed_at: row?.reviewed_at ? String(row.reviewed_at) : null,
});

export const fetchSponsorPoints = async (session: MobileSession): Promise<SponsorPointsInfo> => {
  const response = await api.get("/green/sponsor/points", {
    params: { sponsor_id: session.user.id },
  });
  return response.data;
};

export const redeemSponsorReward = async (
  session: MobileSession,
  rewardType: string,
  shippingDetails?: any
) => {
  const response = await api.post("/green/sponsor/redeem", {
    sponsor_id: session.user.id,
    reward_type: rewardType,
    shipping_details: shippingDetails || null,
  });
  return response.data;
};

export const nominateSchool = async (
  session: MobileSession,
  payload: { school_name: string; school_address: string; contact_person?: string; contact_phone?: string; reason: string }
) => {
  const response = await api.post("/green/sponsor/nominate-school", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

export const createCommunityProject = async (
  session: MobileSession,
  payload: { project_name: string; proposed_location: string; description?: string; points: number }
) => {
  const response = await api.post("/green/sponsor/community-project", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

export const applyReferralCode = async (session: MobileSession, referralCode: string) => {
  const response = await api.post("/green/sponsor/apply-referral", {
    sponsor_id: session.user.id,
    referral_code: referralCode,
  });
  return response.data;
};

export const updateSponsorAppearance = async (
  session: MobileSession,
  payload: { avatar_border?: string | null; map_icon?: string | null }
) => {
  const response = await api.post("/green/sponsor/update-appearance", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

export const updateSponsorProfilePhoto = async (session: MobileSession, photoUrl: string) => {
  const response = await api.post("/green/sponsor/update-profile-photo", {
    sponsor_id: session.user.id,
    profile_photo_url: photoUrl,
  });
  return response.data;
};

export const sponsorGameAction = async (
  session: MobileSession,
  payload: { game_id: string; action: string; gp_delta: number }
): Promise<{ ok: boolean; gp_delta: number; new_balance: number }> => {
  const response = await api.post("/green/sponsor/game/action", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

export const shareEarnPoints = async (session: MobileSession) => {
  const response = await api.post("/green/sponsor/points/share-earn", {
    sponsor_id: session.user.id,
  });
  return response.data;
};

export const submitSponsorComplaint = async (
  session: MobileSession,
  payload: { complaint_type: string; tree_id?: number | null; message: string }
) => {
  const response = await api.post("/green/sponsor/complaints", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

export const fetchSponsorSocialFollowClaim = async (
  session: MobileSession,
): Promise<SponsorSocialFollowClaim | null> => {
  const response = await api.get("/green/sponsor/social-follow-claim", {
    params: { sponsor_id: session.user.id },
  });
  return response.data ? normalizeSponsorSocialFollowClaim(response.data) : null;
};

export const submitSponsorSocialFollowClaim = async (
  session: MobileSession,
  payload: {
    facebook_screenshot_url: string;
    instagram_screenshot_url: string;
    facebook_opened: boolean;
    instagram_opened: boolean;
  },
): Promise<SponsorSocialFollowClaim> => {
  const response = await api.post("/green/sponsor/social-follow-claim", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return normalizeSponsorSocialFollowClaim(response.data?.claim || response.data || {});
};
