import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import { GreenSyncProvider } from "./src/context/GreenSyncContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { setupGreenNotifications } from "./src/notifications/greenNotifications";
import { checkForAppUpdate } from "./src/utils/appUpdates";

export default function App() {
  useEffect(() => {
    void setupGreenNotifications().catch(() => {});
    void checkForAppUpdate();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <GreenSyncProvider>
          <AppNavigator />
        </GreenSyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
