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

// NOTE: Play Console recommends AGP 9.0+, and React Native's own gradle-plugin still pins
// 8.12.0 as of RN 0.86. Pinning AGP to 9.0.0 here was tried and reverted - it broke the
// Kotlin Android Gradle plugin ("Cannot add extension with name 'kotlin', as there is an
// extension already registered with that name"), i.e. it's not actually compatible with this
// project's current Kotlin Gradle Plugin version. Leave AGP on RN's managed default until RN's
// own gradle-plugin bumps it (tracked upstream), rather than force a version combination that
// doesn't build.

const config: ExpoConfig = {
  name: "LC Green",
  slug: "landcheck-mobile",
  version: "1.0.43",
  scheme: "landcheckmobile",
  orientation: "default",
  icon: "./assets/green-logo-cropped-760.png",
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
    googleServicesFile: "./google-services.json",
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
    "expo-status-bar",
    [
      "expo-splash-screen",
      {
        image: "./assets/green-logo-cropped-760.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    "react-native-edge-to-edge",
    withPlayStoreSafePermissions,
  ] as NonNullable<ExpoConfig["plugins"]>,
};

export default {
  expo: config,
};
