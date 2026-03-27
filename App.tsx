import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
      <AuthProvider>
        <GreenSyncProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </GreenSyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
