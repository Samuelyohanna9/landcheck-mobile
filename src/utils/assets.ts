import { API_URL } from "../config/env";

export const resolveGreenAssetCandidates = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  if (/^data:/i.test(raw)) return [raw];
  if (/^https?:\/\//i.test(raw)) {
    if (raw.includes("/green/uploads/object/")) return [raw];
    try {
      const apiOrigin = new URL(API_URL).origin;
      const rawOrigin = new URL(raw).origin;
      if (rawOrigin === apiOrigin) return [raw];
    } catch {
      // Fall through to proxy candidate.
    }
    return [raw, `${API_URL}/green/organizations/logo-proxy?url=${encodeURIComponent(raw)}`];
  }

  return [`${API_URL}/${raw.replace(/^\/+/, "")}`];
};

export const resolveGreenAssetUrl = (value?: string | null) => resolveGreenAssetCandidates(value)[0] || "";
