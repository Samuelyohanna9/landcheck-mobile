import * as Application from "expo-application";

const rawApiUrl = String(process.env.EXPO_PUBLIC_API_URL || "https://api.landcheck.online").trim();
const rawMapboxToken = String(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "").trim();

export const API_URL = rawApiUrl.replace(/\/+$/, "");
export const MAPBOX_ACCESS_TOKEN = rawMapboxToken;
export const APP_NAME = "LandCheck Mobile";
// Read from the installed native binary (what Play Store actually shipped) instead of a
// hand-maintained string here - a hardcoded value silently goes stale on every release and
// makes the update-prompt check in AppNavigator compare against the wrong "current version".
export const APP_VERSION = Application.nativeApplicationVersion || "1.0.43";
