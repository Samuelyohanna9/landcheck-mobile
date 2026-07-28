import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Alert, AppState, type AppStateStatus, Linking, Platform, Pressable, StyleSheet, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";
import { APP_VERSION } from "../config/env";
import { fetchVersionInfo } from "../api/client";
import { navigationTheme } from "../theme/navigation";
import { useAuth } from "../context/AuthContext";
import { useGreenSync } from "../context/GreenSyncContext";
import { BootScreen } from "../screens/common/BootScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { PrivacyConsentScreen } from "../screens/common/PrivacyConsentScreen";
import { IntroScreen } from "../screens/common/IntroScreen";
import { ChangePasswordScreen } from "../screens/common/ChangePasswordScreen";
import { GreenOverviewScreen } from "../screens/green/GreenOverviewScreen";
import { GreenAgentPayoutScreen } from "../screens/green/GreenAgentPayoutScreen";
import { GreenTasksScreen } from "../screens/green/GreenTasksScreen";
import { GreenTaskDetailScreen } from "../screens/green/GreenTaskDetailScreen";
import { GreenFieldToolsScreen } from "../screens/green/GreenFieldToolsScreen";
import { GreenTreeRecordsScreen } from "../screens/green/GreenTreeRecordsScreen";
import { TreeDetailScreen } from "../screens/green/TreeDetailScreen";
import { DonorReportScreen } from "../screens/green/DonorReportScreen";
import { ProfileScreen } from "../screens/common/ProfileScreen";
import { SponsorProjectsScreen } from "../screens/sponsor/SponsorProjectsScreen";
import { SponsorTreesScreen } from "../screens/sponsor/SponsorTreesScreen";
import { SponsorProfileScreen } from "../screens/sponsor/SponsorProfileScreen";
import { SponsorLeaderboardScreen } from "../screens/sponsor/SponsorLeaderboardScreen";
import { SponsorCheckoutScreen } from "../screens/sponsor/SponsorCheckoutScreen";
import { SponsorTreeDetailScreen } from "../screens/sponsor/SponsorTreeDetailScreen";
import { SponsorGamesScreen } from "../screens/sponsor/SponsorGamesScreen";
import { GrowMyTreeGame } from "../games/GrowMyTreeGame";
import { SaveTheForestGame } from "../games/SaveTheForestGame";
import { ForestBuilderGame } from "../games/ForestBuilderGame";
import { WildlifeCollectorGame } from "../games/WildlifeCollectorGame";
import { ClimateDefenderGame } from "../games/ClimateDefenderGame";
import { FruitHarvestGame } from "../games/FruitHarvestGame";
import { DailySpinGame } from "../games/DailySpinGame";
import { ForestQuestGame } from "../games/ForestQuestGame";
import { SchoolGreeningGame } from "../games/SchoolGreeningGame";
import type {
  GreenAppStackParamList,
  GreenTabParamList,
  RootStackParamList,
  SponsorAppStackParamList,
  SponsorTabParamList,
} from "../types/navigation";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const GreenAppStack = createNativeStackNavigator<GreenAppStackParamList>();
const GreenTabs = createBottomTabNavigator<GreenTabParamList>();
const SponsorAppStack = createNativeStackNavigator<SponsorAppStackParamList>();
const SponsorTabs = createBottomTabNavigator<SponsorTabParamList>();

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
  const { selectedProject, tasks } = useGreenSync();
  const insets = useSafeAreaInsets();
  const tabBottomOffset = Platform.OS === "android" ? Math.max(insets.bottom - 10, 1) : Math.max(insets.bottom, 8);
  const tabInnerBottomPadding = Platform.OS === "android" ? Math.max(insets.bottom, 4) : Math.max(insets.bottom, 6);
  const tabBarHeight = 44 + tabInnerBottomPadding;
  const showAgentPayouts = useMemo(() => {
    const accessModel = String(selectedProject?.access_model || "").trim().toLowerCase();
    return accessModel === "public_sponsorship" || Boolean(selectedProject?.public_sponsor_enabled);
  }, [selectedProject?.access_model, selectedProject?.public_sponsor_enabled]);
  const captureUsesCenterButton = !showAgentPayouts;
  const pendingFieldCaptureCount = useMemo(() => {
    const profile = String(selectedProject?.workflow_profile || "").toLowerCase();
    if (profile !== "agric" && profile !== "relief_recovery") return 0;
    return tasks.filter((t) => {
      if (String(t.task_type || "").toLowerCase().trim() !== "field_capture") return false;
      const status = String(t.status || "").toLowerCase().trim();
      const reviewState = String(t.review_state || "").toLowerCase().trim();
      return !(reviewState === "approved" || status === "done" || status === "completed" || status === "closed");
    }).length;
  }, [selectedProject?.workflow_profile, tasks]);

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
        fontSize: 10,
        fontWeight: "800",
        marginBottom: 0,
      },
      tabBarItemStyle: {
        paddingTop: 6,
        paddingBottom: 2,
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
          tabBarBadge: pendingFieldCaptureCount > 0 ? pendingFieldCaptureCount : undefined,
          tabBarButton: captureUsesCenterButton ? (props) => <CenterFieldButton {...props} /> : undefined,
          tabBarIcon: ({ color, size }) =>
            captureUsesCenterButton ? (
              <Ionicons name="add" color={colors.inverseText} size={20} />
            ) : (
              <Ionicons name="add-circle-outline" color={color} size={size} />
            ),
          tabBarLabelStyle: captureUsesCenterButton
            ? {
                display: "none",
              }
            : undefined,
        }}
      />
      {showAgentPayouts ? (
        <GreenTabs.Screen
          name="GreenAgentPayouts"
          component={GreenAgentPayoutScreen}
          options={{
            title: "Wallet",
            tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={color} size={size} />,
          }}
        />
      ) : null}
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
    <GreenAppStack.Screen name="GreenTaskDetail" component={GreenTaskDetailScreen} />
    <GreenAppStack.Screen name="GreenField" component={GreenFieldToolsScreen} />
    <GreenAppStack.Screen name="GreenRecords" component={GreenTreeRecordsScreen} />
    <GreenAppStack.Screen name="TreeDetail" component={TreeDetailScreen} />
    <GreenAppStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    <GreenAppStack.Screen name="DonorReport" component={DonorReportScreen} />
  </GreenAppStack.Navigator>
);

const SponsorTabNavigator = () => {
  const insets = useSafeAreaInsets();
  const tabBottomOffset = Platform.OS === "android" ? Math.max(insets.bottom - 10, 1) : Math.max(insets.bottom, 8);
  const tabInnerBottomPadding = Platform.OS === "android" ? Math.max(insets.bottom, 4) : Math.max(insets.bottom, 6);
  const tabBarHeight = 44 + tabInnerBottomPadding;

  return (
    <SponsorTabs.Navigator
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
          fontSize: 10,
          fontWeight: "800",
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingTop: 6,
          paddingBottom: 2,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <SponsorTabs.Screen
        name="SponsorProjects"
        component={SponsorProjectsScreen}
        options={{
          title: "Projects",
          tabBarIcon: ({ color, size }) => <Ionicons name="leaf-outline" color={color} size={size} />,
        }}
      />
      <SponsorTabs.Screen
        name="SponsorTrees"
        component={SponsorTreesScreen}
        options={{
          title: "My Trees",
          tabBarIcon: ({ color, size }) => <Ionicons name="git-branch-outline" color={color} size={size} />,
        }}
      />
      <SponsorTabs.Screen
        name="SponsorLeaderboard"
        component={SponsorLeaderboardScreen}
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy-outline" color={color} size={size} />,
        }}
      />
      <SponsorTabs.Screen
        name="SponsorGrove"
        component={SponsorGamesScreen}
        options={{
          title: "Grove",
          tabBarIcon: ({ color, size }) => <Ionicons name="game-controller-outline" color={color} size={size} />,
        }}
      />
      <SponsorTabs.Screen
        name="SponsorProfile"
        component={SponsorProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
    </SponsorTabs.Navigator>
  );
};

const SponsorAppNavigator = () => (
  <SponsorAppStack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
    <SponsorAppStack.Screen name="SponsorTabs" component={SponsorTabNavigator} />
    <SponsorAppStack.Screen name="SponsorCheckout" component={SponsorCheckoutScreen} />
    <SponsorAppStack.Screen name="SponsorTreeDetail" component={SponsorTreeDetailScreen} />
    <SponsorAppStack.Screen name="GameGrowTree" component={GrowMyTreeGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameSaveForest" component={SaveTheForestGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameForestBuilder" component={ForestBuilderGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameWildlife" component={WildlifeCollectorGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameClimateDefender" component={ClimateDefenderGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameFruitHarvest" component={FruitHarvestGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameDailySpin" component={DailySpinGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameForestQuest" component={ForestQuestGame} options={{ animation: "slide_from_bottom" }} />
    <SponsorAppStack.Screen name="GameSchoolGreening" component={SchoolGreeningGame} options={{ animation: "slide_from_bottom" }} />
  </SponsorAppStack.Navigator>
);

const parseVersionParts = (v: string) => v.split(".").map(Number);
const isVersionOlder = (cur: string, target: string) => {
  const c = parseVersionParts(cur);
  const t = parseVersionParts(target);
  for (let i = 0; i < Math.max(c.length, t.length); i++) {
    const cv = c[i] || 0;
    const tv = t[i] || 0;
    if (cv < tv) return true;
    if (cv > tv) return false;
  }
  return false;
};

export const AppNavigator = () => {
  const { booting, session, pendingConsent, needsIntro, dismissIntro } = useAuth();
  const [updateState, setUpdateState] = useState<{ required: boolean; mandatory: boolean; url: string } | null>(null);
  const hasShownUpdateAlertRef = useRef(false);

  const checkVersion = useCallback(async () => {
    try {
      const info = await fetchVersionInfo();
      const current = APP_VERSION;
      if (isVersionOlder(current, info.minimum_version)) {
        setUpdateState({ required: true, mandatory: true, url: info.play_store_url });
      } else if (isVersionOlder(current, info.latest_version)) {
        setUpdateState({ required: true, mandatory: false, url: info.play_store_url });
      } else {
        setUpdateState(null);
      }
    } catch (err) {
      console.warn("Failed to check app version:", err);
    }
  }, []);

  useEffect(() => {
    void checkVersion();
    // Re-check on every foreground resume too, not just cold start - covers a device that
    // was offline at launch (so the first check silently failed) and covers a session left
    // running across a new Play Store release going out.
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void checkVersion();
    });
    return () => subscription.remove();
  }, [checkVersion]);

  useEffect(() => {
    if (updateState && !updateState.mandatory && updateState.required && !hasShownUpdateAlertRef.current) {
      hasShownUpdateAlertRef.current = true;
      Alert.alert(
        "New Version Available",
        "A new version of LandCheck Green is available. Would you like to update now for the latest features and fixes?",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Update Now",
            onPress: () => {
              void Linking.openURL(updateState.url);
            },
          },
        ],
        { cancelable: true }
      );
    }
  }, [updateState]);

  if (updateState?.mandatory) {
    return (
      <View style={styles.blockContainer}>
        <Ionicons name="cloud-download-outline" size={80} color="#c5a059" />
        <Text style={styles.blockTitle}>Update Required</Text>
        <Text style={styles.blockSubtitle}>
          You are using an older version of LandCheck Green that is no longer supported. Please update to the latest version to continue.
        </Text>
        <Pressable
          style={styles.blockButton}
          onPress={() => {
            void Linking.openURL(updateState.url);
          }}
        >
          <Text style={styles.blockButtonText}>Update from Play Store</Text>
        </Pressable>
      </View>
    );
  }

  if (booting) return <BootScreen />;

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <>
            <RootStack.Screen
              name="Login"
              component={LoginScreen}
              initialParams={{ authRoute: "sponsor" }}
            />
          </>
        ) : pendingConsent ? (
          <RootStack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
        ) : needsIntro ? (
          <RootStack.Screen name="Intro">
            {() => <IntroScreen onContinue={() => void dismissIntro()} />}
          </RootStack.Screen>
        ) : session.appMode === "green_sponsor" || session.auth_mode === "sponsor_user" ? (
          <RootStack.Screen name="SponsorApp" component={SponsorAppNavigator} />
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
  blockContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  blockTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0c2b1a",
    textAlign: "center",
    marginTop: 12,
  },
  blockSubtitle: {
    fontSize: 14,
    color: colors.textSoft,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  blockButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  blockButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
});
