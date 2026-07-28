import * as SecureStore from "expo-secure-store";
import type { MobileSession } from "../types/domain";

const SESSION_KEY = "landcheck_mobile_session_v1";

const parseIsoDate = (value: unknown) => {
  const clean = String(value || "").trim();
  if (!clean) return null;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSessionExpired = (session: Partial<MobileSession> | null | undefined) => {
  const idleExpiry = parseIsoDate(session?.idle_timeout_at);
  if (idleExpiry && idleExpiry.getTime() <= Date.now()) return true;
  const hardExpiry = parseIsoDate(session?.expires_at);
  if (hardExpiry && hardExpiry.getTime() <= Date.now()) return true;
  return false;
};

export const saveSession = async (session: MobileSession) => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
};

export const loadSession = async (): Promise<MobileSession | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MobileSession;
    if (parsed?.authed && parsed?.user && String(parsed?.access_token || "").trim() && !isSessionExpired(parsed)) {
      return {
        ...parsed,
        access_token: String(parsed.access_token || "").trim(),
      };
    }
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
  return null;
};

export const clearSession = async () => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};
