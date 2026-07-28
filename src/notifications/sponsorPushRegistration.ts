import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { deactivateGreenSponsorMobilePushToken, registerGreenSponsorMobilePushToken } from "../api/sponsor";
import type { MobileSession } from "../types/domain";
import { requestGreenNotificationPermission, supportsNativeNotifications } from "./greenNotifications";

const SPONSOR_PUSH_TOKEN_STORAGE_KEY = "sponsor:expo-push-token";

type StoredSponsorPushToken = {
  token: string;
  sponsorId: number;
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

const readStoredToken = async (): Promise<StoredSponsorPushToken | null> => {
  try {
    const raw = await AsyncStorage.getItem(SPONSOR_PUSH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSponsorPushToken;
    if (!parsed || typeof parsed.token !== "string" || typeof parsed.sponsorId !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredToken = async (value: StoredSponsorPushToken | null) => {
  if (!value) {
    await AsyncStorage.removeItem(SPONSOR_PUSH_TOKEN_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(SPONSOR_PUSH_TOKEN_STORAGE_KEY, JSON.stringify(value));
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

export const syncSponsorPushRegistration = async (session: MobileSession | null) => {
  if (!session || session.user.id <= 0) return null;
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  if (!supportsNativeNotifications()) return null;
  const allowed = await requestGreenNotificationPermission();
  if (!allowed) return null;

  let tokenValue = "";
  try {
    const resolved = await getExpoPushTokenValue();
    tokenValue = resolved.token;
  } catch {
    return null;
  }
  if (!tokenValue) return null;

  const previous = await readStoredToken();
  if (previous?.token === tokenValue && previous.sponsorId === session.user.id) {
    return tokenValue;
  }

  await registerGreenSponsorMobilePushToken(session, {
    token: tokenValue,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || null,
    deviceLabel: String(Constants.deviceName || "").trim() || null,
  });
  await writeStoredToken({ token: tokenValue, sponsorId: session.user.id });
  return tokenValue;
};

export const clearSponsorPushRegistration = async (session: MobileSession | null) => {
  if (!supportsNativeNotifications()) {
    await writeStoredToken(null);
    return;
  }
  const previous = await readStoredToken();
  if (previous?.token) {
    try {
      await deactivateGreenSponsorMobilePushToken(session, previous.token);
    } catch {
      // Best-effort cleanup only.
    }
  }
  await writeStoredToken(null);
};
