import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { API_URL } from "../config/env";
import { loadSession } from "../storage/session";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

const attachMobileLandCheckHeaders = async (config: InternalAxiosRequestConfig) => {
  const session = await loadSession().catch(() => null);
  const sponsorSession = session?.auth_mode === "sponsor_user" || session?.appMode === "green_sponsor";
  const headers = config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
  config.headers = headers;
  headers.set("X-LC-Client", sponsorSession ? "green-sponsor-mobile" : "green-field-mobile");
  headers.set("X-LC-App-Route", sponsorSession ? "/green/sponsor/mobile" : "/green/field/mobile");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${String(session.access_token)}`);
  }
  if (session?.auth_mode) headers.set("X-LC-Auth-Mode", String(session.auth_mode));
  if (session?.appMode) headers.set("X-LC-Session-App-Mode", String(session.appMode));
  if (session?.user?.role_key || session?.user?.role) {
    headers.set("X-LC-Role-Key", String(session.user?.role_key || session.user?.role || ""));
  }
  if (session?.user?.id != null) headers.set("X-LC-User-Id", String(session.user.id));
  if (session?.user?.full_name) headers.set("X-LC-User-Name", String(session.user.full_name));
  if (session?.user?.organization_id != null) headers.set("X-LC-Organization-Id", String(session.user.organization_id));
  return config;
};

api.interceptors.request.use((config) => attachMobileLandCheckHeaders(config));

export const getErrorMessage = (error: unknown, fallback = "Request failed") => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length) return String(detail[0]?.msg || fallback);
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

export type VersionCheckResult = {
  latest_version: string;
  minimum_version: string;
  play_store_url: string;
};

export const fetchVersionInfo = async (): Promise<VersionCheckResult> => {
  const response = await api.get("/green/app/version-check");
  return response.data;
};
