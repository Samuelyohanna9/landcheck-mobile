import { MAPBOX_ACCESS_TOKEN } from "../config/env";

type MapboxModule = typeof import("@rnmapbox/maps");

let configured = false;
let cachedModule: MapboxModule | null = null;
let nativeAvailable = false;

try {
  // Delay hard failure when the installed app binary is stale and does not yet include the native module.
  // The UI can then show a rebuild message instead of crashing the whole app.
  cachedModule = require("@rnmapbox/maps") as MapboxModule;
  nativeAvailable = true;
} catch {
  cachedModule = null;
  nativeAvailable = false;
}

export const hasMapboxToken = Boolean(MAPBOX_ACCESS_TOKEN);
export const isMapboxNativeAvailable = nativeAvailable;

export const ensureMapboxConfigured = () => {
  if (configured || !cachedModule) return;
  if (hasMapboxToken) {
    void cachedModule.setAccessToken(MAPBOX_ACCESS_TOKEN);
  }
  configured = true;
};

export const Mapbox = cachedModule;
