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

const config: ExpoConfig = {
  name: "LC Green",
  slug: "landcheck-mobile",
  version: "1.0.43",
  scheme: "landcheckmobile",
  orientation: "default",
  icon: "./assets/green-logo-cropped-760.png",
  splash: {
    image: "./assets/green-logo-cropped-760.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "online.landcheck.mobile",
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "LandCheck Green uses GPS to record tree planting and maintenance locations in the field.",
      NSCameraUsageDescription: "LandCheck Green uses the camera to capture tree and maintenance evidence photos.",
    },
  },
  android: {
    package: "online.landcheck.mobile",
    versionCode: 44,
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
    "expo-background-task",
    "expo-image",
    "react-native-edge-to-edge",
    withPlayStoreSafePermissions,
  ] as NonNullable<ExpoConfig["plugins"]>,
};

export default {
  expo: config,
};
