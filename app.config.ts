import { AndroidConfig, ConfigPlugin, withAndroidManifest } from "@expo/config-plugins";
import type { ExpoConfig } from "@expo/config-types";

const withPlayStoreSafePermissions: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    AndroidConfig.Permissions.removePermissions(config.modResults, [
      "android.permission.RECORD_AUDIO",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ]);
    return config;
  });

// newArchEnabled is a real, respected Expo config key but is missing from this version's
// @expo/config-types definitions - extend the type locally rather than casting the whole config.
const config: ExpoConfig & { newArchEnabled?: boolean } = {
  name: "LC Green",
  slug: "landcheck-mobile",
  version: "1.0.43",
  scheme: "landcheckmobile",
  orientation: "default",
  icon: "./assets/green-logo-cropped-760.png",
  // Keep the Expo config flag explicit after rolling back to the last stable Android stack.
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "online.landcheck.mobile",
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "LandCheck Green uses GPS to record tree planting and maintenance locations in the field.",
      NSCameraUsageDescription: "LandCheck Green uses the camera to capture tree and maintenance evidence photos.",
      // Required by sp-react-native-in-app-updates to open the App Store listing when an update
      // prompt is accepted on iOS.
      LSApplicationQueriesSchemes: ["itms-apps"],
    },
  },
  android: {
    package: "online.landcheck.mobile",
    versionCode: 44,
    // Locally this file exists on disk (gitignored - never committed as a credential file).
    // EAS Build only uploads git-tracked files, so on EAS it comes from a "file" environment
    // variable instead, which is downloaded to a local path and exposed via this env var.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA"],
    adaptiveIcon: {
      backgroundColor: "#ffffff",
      foregroundImage: "./assets/green-logo-cropped-760.png",
      monochromeImage: "./assets/green-logo-cropped-760.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://api.landcheck.online",
    mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "",
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "ad94606a-86eb-45e6-a6fd-75fb1b54dad6",
    },
  },
  plugins: [
    "@react-native-community/datetimepicker",
    [
      "@rnmapbox/maps",
      {
        RNMapboxMapsVersion: "11.18.2",
      },
    ],
    "expo-secure-store",
    "expo-sqlite",
    [
      "expo-location",
      {
        locationWhenInUsePermission: "LandCheck Green uses GPS to record tree planting and maintenance locations in the field.",
      },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission: "LandCheck Green uses the camera to capture tree and maintenance evidence photos.",
        microphonePermission: false,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/green-logo-cropped-760.png",
        color: "#2f8f4e",
        defaultChannel: "green-alerts",
      },
    ],
    "expo-font",
    "expo-background-task",
    "expo-image",
    [
      "expo-splash-screen",
      {
        image: "./assets/green-logo-cropped-760.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    // REVERTED (see landcheck-mobile crash postmortem): enabling R8 here shipped to production
    // without adequate ProGuard keep rules for the app's native modules (Mapbox, background-task,
    // notifications, etc. - the checked-in proguard-rules.pro only covered reanimated/turbomodule),
    // and R8 stripped/renamed classes those modules need at runtime, crashing the app on launch
    // for real users. Re-enabling this requires writing full keep rules for every native module
    // AND verifying with a real local build installed on a physical device first - not just a
    // clean typecheck/compile - before it's ever submitted to production again.
    // [
    //   "expo-build-properties",
    //   {
    //     android: {
    //       enableProguardInReleaseBuilds: true,
    //       enableShrinkResourcesInReleaseBuilds: true,
    //     },
    //   },
    // ],
    withPlayStoreSafePermissions,
  ] as NonNullable<ExpoConfig["plugins"]>,
};

export default {
  expo: config,
};
