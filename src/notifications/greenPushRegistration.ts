import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { deactivateGreenMobilePushToken, registerGreenMobilePushToken } from "../api/green";
import type { MobileSession } from "../types/domain";
import { requestGreenNotificationPermission, supportsNativeNotifications } from "./greenNotifications";

const GREEN_PUSH_TOKEN_STORAGE_KEY = "green:expo-push-token";

type StoredGreenPushToken = {
  token: string;
  userId: number;
};

const resolveExpoProjectId = () => {
  const fromEasConfig = String(Constants.easConfig?.projectId || "").trim();
  if (fromEasConfig) return fromEasConfig;
  const extra = (Constants.expoConfig?.extra || {}) as { eas?: { projectId?: string | null } };
  const fromExpoConfig = String(extra?.eas?.projectId || "").trim();
  if (fromExpoConfig) return fromExpoConfig;
  const fromEnv = String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "").trim();
  return fromEnv || null;
};

const readStoredToken = async (): Promise<StoredGreenPushToken | null> => {
  try {
    const raw = await AsyncStorage.getItem(GREEN_PUSH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGreenPushToken;
    if (!parsed || typeof parsed.token !== "string" || typeof parsed.userId !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredToken = async (value: StoredGreenPushToken | null) => {
  if (!value) {
    await AsyncStorage.removeItem(GREEN_PUSH_TOKEN_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(GREEN_PUSH_TOKEN_STORAGE_KEY, JSON.stringify(value));
};

const getExpoPushTokenValue = async () => {
  const projectId = resolveExpoProjectId();
  const token = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  return {
    token: String(token.data || "").trim(),
    projectId,
  };
};

export const syncGreenPushRegistration = async (session: MobileSession | null) => {
  if (!session || session.user.id <= 0) return null;
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  if (!supportsNativeNotifications()) return null;
  const allowed = await requestGreenNotificationPermission();
  if (!allowed) return null;

  let tokenValue = "";
  let projectId: string | null = null;
  try {
    const resolved = await getExpoPushTokenValue();
    tokenValue = resolved.token;
    projectId = resolved.projectId;
  } catch {
    return null;
  }
  if (!tokenValue) return null;

  const previous = await readStoredToken();
  if (previous?.token === tokenValue && previous.userId === session.user.id) {
    return tokenValue;
  }

  await registerGreenMobilePushToken(session, {
    token: tokenValue,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || null,
    projectId,
    deviceLabel: String(Constants.deviceName || "").trim() || null,
  });
  await writeStoredToken({ token: tokenValue, userId: session.user.id });
  return tokenValue;
};

export const clearGreenPushRegistration = async (session: MobileSession | null) => {
  if (!supportsNativeNotifications()) {
    await writeStoredToken(null);
    return;
  }
  const previous = await readStoredToken();
  if (previous?.token) {
    try {
      await deactivateGreenMobilePushToken(session, previous.token);
    } catch {
      // Best-effort cleanup only.
    }
  }
  await writeStoredToken(null);
};
