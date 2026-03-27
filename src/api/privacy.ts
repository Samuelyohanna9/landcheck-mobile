import { Platform } from "react-native";
import { api } from "./client";
import type { MobileSession, PrivacyPolicyMeta } from "../types/domain";

const resolveActorType = (session: MobileSession) => {
  if (session.auth_mode === "env_admin") return "system_admin";
  const role = String(session.user.role_key || session.user.role || "").toLowerCase();
  if (role.startsWith("custodian")) return "custodian";
  return "staff";
};

export const fetchPrivacyPolicy = async () => {
  const response = await api.get<PrivacyPolicyMeta>("/green/privacy/policy");
  return response.data;
};

export const recordMobileConsent = async (session: MobileSession, policy: PrivacyPolicyMeta) => {
  const scopeKey = "green_field_data_capture";
  const scopeMeta = policy.scopes?.[scopeKey];
  await api.post("/green/privacy/consents", {
    scope_key: scopeKey,
    consent_version: policy.consent_version,
    source_app: "green",
    source_path: "/mobile/green",
    actor_type: resolveActorType(session),
    actor_id: session.user.id,
    actor_name: session.user.full_name,
    organization_id: session.user.organization_id ?? null,
    organization_name: session.user.organization_name ?? null,
    accepted: true,
    legal_basis: "consent",
    consent_text: scopeMeta?.summary || "Mobile user accepted operational privacy notice.",
    metadata: {
      platform: Platform.OS,
      auth_mode: session.auth_mode,
      organization_slug: session.user.organization_slug ?? null,
    },
  });
};
