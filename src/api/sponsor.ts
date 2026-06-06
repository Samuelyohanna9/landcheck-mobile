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
  `${API_URL}/green/sponsor/trees/${unitId}/certificate/pdf?sponsor_id=${session.user.id}`;

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
