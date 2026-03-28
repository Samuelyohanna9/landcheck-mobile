import { API_URL } from "../config/env";

export const resolveGreenAssetUrl = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;

  return `${API_URL}/${raw.replace(/^\/+/, "")}`;
};
