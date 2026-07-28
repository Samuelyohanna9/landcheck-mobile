import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const resolveExpoRuntime = () => {
  const appOwnership = String((Constants as { appOwnership?: string | null }).appOwnership || "").trim().toLowerCase();
  const executionEnvironment = String(
    (Constants as { executionEnvironment?: string | null }).executionEnvironment || "",
  ).trim().toLowerCase();
  return {
    appOwnership,
    executionEnvironment,
  };
};

export const supportsNativeNotifications = () => {
  const runtime = resolveExpoRuntime();
  return runtime.appOwnership !== "expo" && runtime.executionEnvironment !== "storeclient";
};

if (supportsNativeNotifications()) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export const GREEN_CHANNEL_ID = "green-alerts";
export const SPONSOR_CHANNEL_ID = "sponsor-alerts";

export const setupGreenNotifications = async () => {
  if (!supportsNativeNotifications()) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(GREEN_CHANNEL_ID, {
      name: "LandCheck Green Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#2f8f4e",
    });
    await Notifications.setNotificationChannelAsync(SPONSOR_CHANNEL_ID, {
      name: "LandCheck Sponsor Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#c5a059",
    });
  }
};

export const requestGreenNotificationPermission = async () => {
  if (!supportsNativeNotifications()) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return Boolean(next.granted || next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
};

export const pushGreenNotification = async (title: string, body: string) => {
  if (!supportsNativeNotifications()) return;
  const permission = await Notifications.getPermissionsAsync();
  const allowed = Boolean(permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
  if (!allowed) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger: null,
  });
};
