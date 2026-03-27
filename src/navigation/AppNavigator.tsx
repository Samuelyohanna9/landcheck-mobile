import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";
import { navigationTheme } from "../theme/navigation";
import { useAuth } from "../context/AuthContext";
import { BootScreen } from "../screens/common/BootScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { PrivacyConsentScreen } from "../screens/common/PrivacyConsentScreen";
import { IntroScreen } from "../screens/common/IntroScreen";
import { ChangePasswordScreen } from "../screens/common/ChangePasswordScreen";
import { GreenOverviewScreen } from "../screens/green/GreenOverviewScreen";
import { GreenTasksScreen } from "../screens/green/GreenTasksScreen";
import { GreenFieldToolsScreen } from "../screens/green/GreenFieldToolsScreen";
import { GreenTreeRecordsScreen } from "../screens/green/GreenTreeRecordsScreen";
import { TreeDetailScreen } from "../screens/green/TreeDetailScreen";
import { DonorReportScreen } from "../screens/green/DonorReportScreen";
import { ProfileScreen } from "../screens/common/ProfileScreen";
import type { GreenAppStackParamList, GreenTabParamList, RootStackParamList } from "../types/navigation";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const GreenAppStack = createNativeStackNavigator<GreenAppStackParamList>();
const GreenTabs = createBottomTabNavigator<GreenTabParamList>();

const CenterFieldButton = ({ children, onPress, accessibilityState }: any) => {
  const focused = Boolean(accessibilityState?.selected);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.centerFieldWrap, focused && styles.centerFieldWrapFocused, pressed && styles.centerFieldPressed]}
    >
      <View style={styles.centerFieldInner}>{children}</View>
    </Pressable>
  );
};

const GreenTabNavigator = () => {
  const insets = useSafeAreaInsets();
  const tabBottomOffset = Platform.OS === "android" ? Math.max(insets.bottom - 10, 1) : Math.max(insets.bottom, 8);
  const tabInnerBottomPadding = Platform.OS === "android" ? Math.max(insets.bottom, 6) : Math.max(insets.bottom, 6);
  const tabBarHeight = 48 + tabInnerBottomPadding;

  return (
  <GreenTabs.Navigator
    screenOptions={{
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarStyle: {
        position: "absolute",
        left: 20,
        right: 20,
        bottom: tabBottomOffset,
        height: tabBarHeight,
        paddingTop: 4,
        paddingBottom: tabInnerBottomPadding,
        backgroundColor: "#ffffff",
        borderTopColor: "transparent",
        borderTopWidth: 0,
        borderRadius: 22,
        shadowColor: colors.shadow,
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
      },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: {
        fontSize: 9,
        fontWeight: "800",
        marginBottom: 0,
      },
      tabBarItemStyle: {
        paddingTop: 7,
      },
      sceneStyle: {
        backgroundColor: colors.background,
      },
    }}
  >
    <GreenTabs.Screen
      name="GreenHome"
      component={GreenOverviewScreen}
      options={{
        title: "Overview",
        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
      }}
    />
    <GreenTabs.Screen
      name="GreenQuickCapture"
      component={GreenFieldToolsScreen}
      options={{
        title: "Capture",
        tabBarButton: (props) => <CenterFieldButton {...props} />,
        tabBarIcon: () => <Ionicons name="add" color={colors.inverseText} size={20} />,
        tabBarLabelStyle: {
          display: "none",
        },
      }}
    />
    <GreenTabs.Screen
      name="GreenProfile"
      component={ProfileScreen}
      options={{
        title: "Profile",
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
      }}
    />
  </GreenTabs.Navigator>
  );
};

const GreenAppNavigator = () => (
  <GreenAppStack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
    <GreenAppStack.Screen name="GreenTabs" component={GreenTabNavigator} />
    <GreenAppStack.Screen name="GreenTasks" component={GreenTasksScreen} />
    <GreenAppStack.Screen name="GreenField" component={GreenFieldToolsScreen} />
    <GreenAppStack.Screen name="GreenRecords" component={GreenTreeRecordsScreen} />
    <GreenAppStack.Screen name="TreeDetail" component={TreeDetailScreen} />
    <GreenAppStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    <GreenAppStack.Screen name="DonorReport" component={DonorReportScreen} />
  </GreenAppStack.Navigator>
);

export const AppNavigator = () => {
  const { booting, session, pendingConsent, needsIntro, dismissIntro } = useAuth();

  if (booting) return <BootScreen />;

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <RootStack.Screen name="Login" component={LoginScreen} />
        ) : pendingConsent ? (
          <RootStack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
        ) : needsIntro ? (
          <RootStack.Screen name="Intro">
            {() => <IntroScreen onContinue={() => void dismissIntro()} />}
          </RootStack.Screen>
        ) : (
          <RootStack.Screen name="GreenApp" component={GreenAppNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  centerFieldWrap: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  centerFieldWrapFocused: {
    transform: [{ translateY: 0 }],
  },
  centerFieldPressed: {
    opacity: 0.92,
  },
  centerFieldInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});
