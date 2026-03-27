const rawApiUrl = String(process.env.EXPO_PUBLIC_API_URL || "https://api.landcheck.online").trim();
const rawMapboxToken = String(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "").trim();

export const API_URL = rawApiUrl.replace(/\/+$/, "");
export const MAPBOX_ACCESS_TOKEN = rawMapboxToken;
export const APP_NAME = "LandCheck Mobile";
