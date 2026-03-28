import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { SyncProgressPanel } from "../../components/SyncProgressPanel";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import { normalizeName } from "../../green/workflow";
import { colors, spacing } from "../../theme/tokens";
import type { GreenAppStackParamList } from "../../types/navigation";

export const ProfileScreen = () => {
  const { session, signOut } = useAuth();
  const { isOnline, offlineStats, tasks, trees, refreshing, refreshAll, syncProgress } = useGreenSync();
  const navigation = useNavigation<NativeStackNavigationProp<GreenAppStackParamList>>();

  if (!session) return null;

  const myTrees = trees.filter((tree) => normalizeName(tree.created_by) === normalizeName(session.user.full_name));
  const submittedTasks = tasks.filter((task) => String(task.review_state || "").toLowerCase() === "submitted").length;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void refreshAll()}>
      <ScreenHero
        title={session.user.full_name}
        subtitle={`${session.user.role_name || session.user.role || "Field user"} | ${session.user.organization_name || "System scope"}`}
        logoUrl={session.user.organization_logo_url || undefined}
        badge={<StatusChip label={isOnline ? "Online" : "Offline"} tone={isOnline ? "online" : "offline"} />}
      />

      <SectionCard title="My field summary" subtitle={undefined}>
        <View style={styles.metricRow}>
          <MetricTile label="My trees" value={myTrees.length} tone="success" helper="Saved by you" />
          <MetricTile label="Submitted tasks" value={submittedTasks} helper="Sent for review" />
        </View>
        <View style={styles.metricRow}>
          <MetricTile label="Waiting to send" value={offlineStats.queued} tone="warning" helper="Will send automatically" />
          <MetricTile label="Status" value={isOnline ? "Online" : "Offline"} tone={isOnline ? "success" : "warning"} helper={isOnline ? "Connected now" : "Saved on phone"} />
        </View>
        <SyncProgressPanel progress={syncProgress} />
        {syncProgress.active ? (
          <Text style={styles.infoLine}>Saved work is being sent now. Keep the app open until it finishes.</Text>
        ) : offlineStats.queued > 0 ? (
          <Text style={styles.infoLine}>
            {offlineStats.queued} item{offlineStats.queued === 1 ? "" : "s"} saved on this phone. They will send automatically when you have network.
          </Text>
        ) : (
          <Text style={styles.infoLine}>Everything you recorded has been sent.</Text>
        )}
      </SectionCard>

      <SectionCard title="Actions" subtitle={undefined}>
        <View style={styles.actionBlock}>
          <PrimaryButton label="Donor report PDF" onPress={() => navigation.navigate("DonorReport")} variant="ghost" />
          <PrimaryButton label="Change password" onPress={() => navigation.navigate("ChangePassword")} variant="ghost" />
          <PrimaryButton label="Log out" onPress={() => void signOut()} variant="secondary" />
        </View>
      </SectionCard>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  infoLine: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  actionBlock: {
    gap: spacing.sm,
  },
});
