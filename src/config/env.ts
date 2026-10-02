import * as Application from "expo-application";
import Constants from "expo-constants";

type ExpoExtra = {
  apiUrl?: string | null;
  mapboxToken?: string | null;
};

const resolveExpoExtra = (): ExpoExtra => {
  const fromExpoConfig = (Constants.expoConfig?.extra || {}) as ExpoExtra;
  if (fromExpoConfig.apiUrl || fromExpoConfig.mapboxToken) return fromExpoConfig;

  const fromManifest2 = (
    (Constants as { manifest2?: { extra?: { expoClient?: { extra?: ExpoExtra | null } | null } | null } }).manifest2?.extra
      ?.expoClient?.extra || {}
  ) as ExpoExtra;
  if (fromManifest2.apiUrl || fromManifest2.mapboxToken) return fromManifest2;

  const fromLegacyManifest = ((Constants as { manifest?: { extra?: ExpoExtra | null } | null }).manifest?.extra || {}) as ExpoExtra;
  return fromLegacyManifest;
};

const expoExtra = resolveExpoExtra();
const rawApiUrl = String(process.env.EXPO_PUBLIC_API_URL || expoExtra.apiUrl || "https://api.landcheck.online").trim();
const rawMapboxToken = String(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || expoExtra.mapboxToken || "").trim();

export const API_URL = rawApiUrl.replace(/\/+$/, "");
export const MAPBOX_ACCESS_TOKEN = rawMapboxToken;
export const APP_NAME = "LandCheck Mobile";
// Read from the installed native binary (what Play Store actually shipped) instead of a
// hand-maintained string here - a hardcoded value silently goes stale on every release and
// makes the update-prompt check in AppNavigator compare against the wrong "current version".
export const APP_VERSION = Application.nativeApplicationVersion || "1.0.43";
