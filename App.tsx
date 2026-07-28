import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SystemBars } from "react-native-edge-to-edge";
import { AuthProvider } from "./src/context/AuthContext";
import { GreenSyncProvider } from "./src/context/GreenSyncContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { setupGreenNotifications } from "./src/notifications/greenNotifications";

export default function App() {
  useEffect(() => {
    void setupGreenNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <SystemBars style="auto" />
      <AuthProvider>
        <GreenSyncProvider>
          <AppNavigator />
        </GreenSyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
