import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const GREEN_CHANNEL_ID = "green-alerts";

export const setupGreenNotifications = async () => {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(GREEN_CHANNEL_ID, {
      name: "LandCheck Green Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#2f8f4e",
    });
  }
};

export const requestGreenNotificationPermission = async () => {
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
