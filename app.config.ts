export default {
  expo: {
    name: "LC Green",
    slug: "landcheck-mobile",
    version: "1.0.1",
    scheme: "landcheckmobile",
    orientation: "portrait",
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
        NSPhotoLibraryUsageDescription: "LandCheck Green accesses your photo library so you can attach evidence photos to field records.",
      },
    },
    android: {
      package: "online.landcheck.mobile",
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA", "READ_MEDIA_IMAGES"],
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
          photosPermission: "LandCheck Green accesses your photo library so you can attach evidence photos to field records.",
          cameraPermission: "LandCheck Green uses the camera to capture tree and maintenance evidence photos.",
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
    ],
  },
};
