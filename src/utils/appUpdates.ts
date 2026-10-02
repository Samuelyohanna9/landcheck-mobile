import { Alert, Platform } from "react-native";
import SpInAppUpdates, { IAUInstallStatus, IAUUpdateKind, StartUpdateOptions } from "sp-react-native-in-app-updates";

// Google Play's own "In-App Update" API (Play Core) - this is a Play Store version check, not an
// OTA JS update (that's expo-updates, which this project doesn't currently wire up either). On
// Android it uses FLEXIBLE mode: the new APK downloads in the background while the current app
// stays usable, then the user is prompted once to restart and apply it - rather than IMMEDIATE,
// which blocks the whole app behind a full-screen native update UI. On iOS there's no Play Core
// equivalent, so the library checks the App Store's own public lookup API and shows a plain
// "update available" alert that deep-links to the App Store listing.
const inAppUpdates = new SpInAppUpdates(__DEV__);

let hasCheckedThisSession = false;

export async function checkForAppUpdate(): Promise<void> {
  // Once per app launch is enough - this runs from App.tsx's startup effect, which only fires
  // once anyway, but guard here too in case something else ever calls this a second time.
  if (hasCheckedThisSession) return;
  hasCheckedThisSession = true;

  try {
    const result = await inAppUpdates.checkNeedsUpdate();
    if (!result.shouldUpdate) return;

    if (Platform.OS === "android") {
      inAppUpdates.addStatusUpdateListener((status) => {
        if (status.status === IAUInstallStatus.DOWNLOADED) {
          Alert.alert(
            "Update ready",
            "A new version of LandCheck Green has been downloaded. Restart now to finish installing it.",
            [
              { text: "Later", style: "cancel" },
              { text: "Restart now", onPress: () => inAppUpdates.installUpdate() },
            ],
          );
        }
      });
      const updateOptions: StartUpdateOptions = { updateType: IAUUpdateKind.FLEXIBLE };
      await inAppUpdates.startUpdate(updateOptions);
    } else {
      // iOS: the library shows its own native alert (title/message/buttons below) and opens the
      // App Store listing if the user accepts - no further action needed on our side.
      const updateOptions: StartUpdateOptions = {
        title: "Update available",
        message: "A new version of LandCheck Green is available on the App Store.",
        buttonUpgradeText: "Update",
        buttonCancelText: "Not now",
      };
      await inAppUpdates.startUpdate(updateOptions);
    }
  } catch {
    // Never let an update check (no network, Play Services unavailable, store API down, running
    // on an emulator without Play Store, etc.) block or crash app startup.
  }
}
