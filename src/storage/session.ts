import * as SecureStore from "expo-secure-store";
import type { MobileSession } from "../types/domain";

const SESSION_KEY = "landcheck_mobile_session_v1";

export const saveSession = async (session: MobileSession) => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
};

export const loadSession = async (): Promise<MobileSession | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MobileSession;
    if (parsed?.authed && parsed?.user) return parsed;
  } catch {
    return null;
  }
  return null;
};

export const clearSession = async () => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};
