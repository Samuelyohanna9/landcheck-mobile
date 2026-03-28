import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ActionTile } from "../../components/ActionTile";
import { BrandMark } from "../../components/BrandMark";
import { EmptyState } from "../../components/EmptyState";
import { MetricTile } from "../../components/MetricTile";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { SelectSheet } from "../../components/SelectSheet";
import { StatusChip } from "../../components/StatusChip";
import { fetchOrganizationBranding, fetchProjectCarbonSummary, fetchProjectDetail } from "../../api/green";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  ATTENTION_TREE_STATUSES,
  DEAD_TREE_STATUSES,
  HEALTHY_TREE_STATUSES,
  PLANTING_TASK_TYPES,
  isTaskApproved,
  isTaskRejected,
  isTaskSubmitted,
  normalizeName,
  normalizeTaskState,
} from "../../green/workflow";
import type { CarbonSummary } from "../../types/domain";
import { colors, radii, spacing } from "../../theme/tokens";

const SURVIVAL_GAUGE_SIZE = 68;
const SURVIVAL_GAUGE_STROKE = 7;
const SURVIVAL_GAUGE_RADIUS = (SURVIVAL_GAUGE_SIZE - SURVIVAL_GAUGE_STROKE) / 2;
const SURVIVAL_GAUGE_CIRCUMFERENCE = 2 * Math.PI * SURVIVAL_GAUGE_RADIUS;

export const GreenOverviewScreen = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const {
    projects,
    tasks,
    trees,
    selectedProjectId,
    selectedProject,
    matchedCustodian,
    isCustodianUser,
    isOnline,
    offlineStats,
    syncProgress,
    refreshAll,
    selectProject,
    distributionAllocations,
    workOrders,
  } = useGreenSync();

  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [carbonSummary, setCarbonSummary] = useState<CarbonSummary | null>(null);
  const [carbonError, setCarbonError] = useState("");
  const [liveProjectBranding, setLiveProjectBranding] = useState<{
    organization_id?: number | null;
    organization_name?: string | null;
    organization_logo_url?: string | null;
  } | null>(null);
  const [organizationBranding, setOrganizationBranding] = useState<{ name?: string | null; logo_url?: string | null } | null>(null);
  const organizationId =
    Number(liveProjectBranding?.organization_id || selectedProject?.organization_id || session?.user.organization_id || 0) || null;
  const organizationName =
    liveProjectBranding?.organization_name ||
    organizationBranding?.name ||
    selectedProject?.organization_name ||
    session?.user.organization_name ||
    "";
  const organizationLogoUrl =
    liveProjectBranding?.organization_logo_url ||
    organizationBranding?.logo_url ||
    selectedProject?.organization_logo_url ||
    session?.user.organization_logo_url ||
    null;

  const currentUserName = normalizeName(session?.user.full_name);
  const scopedTrees = useMemo(() => {
    const custodianId = Number(matchedCustodian?.id || 0);
    return trees.filter((tree) => {
      if (isCustodianUser && custodianId > 0) {
        return Number(tree.custodian_id || 0) === custodianId;
      }
      if (custodianId > 0 && Number(tree.custodian_id || 0) === custodianId) return true;
      return normalizeName(tree.created_by) === currentUserName;
    });
  }, [currentUserName, isCustodianUser, matchedCustodian?.id, trees]);

  const healthyTrees = scopedTrees.filter((tree) => HEALTHY_TREE_STATUSES.has(normalizeTaskState(tree.status))).length;
  const deadTrees = scopedTrees.filter((tree) => DEAD_TREE_STATUSES.has(normalizeTaskState(tree.status))).length;
  const needsAttentionTrees = scopedTrees.filter((tree) => ATTENTION_TREE_STATUSES.has(normalizeTaskState(tree.status))).length;
  const survivalRate = scopedTrees.length ? Math.round((healthyTrees / scopedTrees.length) * 100) : 0;

  const myTaskCounts = useMemo(() => {
    if (isCustodianUser) {
      return { total: 0, pending: 0, done: 0, submitted: 0, rejected: 0, undone: 0 };
    }
    const total = tasks.length;
    const done = tasks.filter((task) => isTaskApproved(task)).length;
    const submitted = tasks.filter((task) => isTaskSubmitted(task)).length;
    const rejected = tasks.filter((task) => isTaskRejected(task)).length;
    const pending = tasks.filter((task) => !isTaskApproved(task) && !isTaskSubmitted(task)).length;
    return { total, pending, done, submitted, rejected, undone: pending };
  }, [isCustodianUser, tasks]);

  const plantingReviewCounts = useMemo(() => {
    const plantingTasks = tasks.filter((task) => PLANTING_TASK_TYPES.has(normalizeTaskState(task.task_type)));
    return {
      submitted: plantingTasks.filter((task) => isTaskSubmitted(task)).length,
      approved: plantingTasks.filter((task) => isTaskApproved(task)).length,
    };
  }, [tasks]);

  const pendingPlanting = useMemo(() => {
    if (isCustodianUser && matchedCustodian) {
      return distributionAllocations
        .filter((row) => Number(row.custodian_id || 0) === Number(matchedCustodian.id))
        .reduce((sum, row) => sum + Math.max(Number(row.quantity_allocated || 0) - scopedTrees.length, 0), 0);
    }
    const plantingOrders = workOrders.filter((order) => normalizeTaskState(order.work_type) === "planting");
    return plantingOrders.reduce((sum, order) => {
      const target = Number(order.target_trees || 0);
      const planted = Number(order.planted_count || 0);
      return sum + Math.max(target - planted, 0);
    }, 0);
  }, [distributionAllocations, isCustodianUser, matchedCustodian, scopedTrees.length, workOrders]);

  const projectOptions = projects.map((project) => ({
    label: project.name,
    value: String(project.id),
    description: project.location_text || "Project available in this organization scope",
  }));

  useEffect(() => {
    let active = true;
    const loadCarbon = async () => {
      if (!selectedProjectId) {
        if (active) {
          setCarbonSummary(null);
          setCarbonError("");
        }
        return;
      }
      if (!isOnline) {
        if (active) setCarbonError("");
        return;
      }
      try {
        const actorName = String(session?.user.full_name || "").trim();
        const summary = await fetchProjectCarbonSummary(selectedProjectId, actorName || undefined);
        if (!active) return;
        setCarbonSummary(summary);
        setCarbonError("");
      } catch (error) {
        if (!active) return;
        setCarbonSummary(null);
        setCarbonError(error instanceof Error ? error.message : "Carbon impact is unavailable right now.");
      }
    };
    void loadCarbon();
    return () => {
      active = false;
    };
  }, [isOnline, selectedProjectId, session?.user.full_name]);

  useEffect(() => {
    let active = true;
    const actorName = String(session?.user.full_name || "").trim();
    const loadProjectBranding = async () => {
      if (!selectedProjectId) {
        if (active) setLiveProjectBranding(null);
        return;
      }
      if (!isOnline) {
        if (active) {
          setLiveProjectBranding({
            organization_id: selectedProject?.organization_id || null,
            organization_name: selectedProject?.organization_name || null,
            organization_logo_url: selectedProject?.organization_logo_url || null,
          });
        }
        return;
      }
      try {
        const detail = await fetchProjectDetail(selectedProjectId, actorName || undefined);
        if (!active) return;
        setLiveProjectBranding({
          organization_id: detail.organization_id || null,
          organization_name: detail.organization_name || null,
          organization_logo_url: detail.organization_logo_url || null,
        });
      } catch {
        if (!active) return;
        setLiveProjectBranding({
          organization_id: selectedProject?.organization_id || null,
          organization_name: selectedProject?.organization_name || null,
          organization_logo_url: selectedProject?.organization_logo_url || null,
        });
      }
    };
    void loadProjectBranding();
    return () => {
      active = false;
    };
  }, [
    isOnline,
    selectedProject?.organization_id,
    selectedProject?.organization_logo_url,
    selectedProject?.organization_name,
    selectedProjectId,
    session?.user.full_name,
  ]);

  useEffect(() => {
    let active = true;
    const loadBranding = async () => {
      if (!organizationId) {
        if (active) setOrganizationBranding(null);
        return;
      }

      if (!isOnline) {
        if (active) {
          setOrganizationBranding({
            name: selectedProject?.organization_name || session?.user.organization_name || null,
            logo_url: selectedProject?.organization_logo_url || session?.user.organization_logo_url || null,
          });
        }
        return;
      }

      try {
        const branding = await fetchOrganizationBranding(organizationId);
        if (!active) return;
        setOrganizationBranding({
          name: branding.name || null,
          logo_url: branding.logo_url || null,
        });
      } catch {
        if (!active) return;
        setOrganizationBranding({
          name: selectedProject?.organization_name || session?.user.organization_name || null,
          logo_url: selectedProject?.organization_logo_url || session?.user.organization_logo_url || null,
        });
      }
    };
    void loadBranding();
    return () => {
      active = false;
    };
  }, [
    isOnline,
    organizationId,
    liveProjectBranding?.organization_logo_url,
    liveProjectBranding?.organization_name,
    selectedProject?.organization_logo_url,
    selectedProject?.organization_name,
    session?.user.organization_logo_url,
    session?.user.organization_name,
  ]);

  const annualPerTreeKg = useMemo(() => {
    if (!carbonSummary || healthyTrees <= 0) return 0;
    return carbonSummary.annual_co2_kg / healthyTrees;
  }, [carbonSummary, healthyTrees]);

  return (
    <ScreenSurface refreshing={false} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>
      <View style={styles.heroPanel}>
        <View style={styles.heroBrandRow}>
          <View style={styles.heroBrandLogos}>
            <BrandMark size={44} />
            {(organizationLogoUrl || organizationName) ? (
              <BrandMark
                size={44}
                logoUrl={organizationLogoUrl}
                fallbackToDefault={false}
                variant="partner"
              />
            ) : null}
          </View>
          <View style={styles.heroBrandText}>
            <Text style={styles.heroTitle}>
              LandCheck <Text style={styles.heroTitleAccent}>Green</Text>
            </Text>
            <Text style={styles.heroSubtitle}>Field dashboard</Text>
          </View>
        </View>

        <View style={styles.heroStatusRow}>
          <View style={styles.heroStatusCard}>
            <Text style={styles.heroStatusLabel}>{isOnline ? "ONLINE" : "OFFLINE"}</Text>
            <Text style={styles.heroStatusValue}>
              {syncProgress.active
                ? `Sending ${Math.min(syncProgress.completed, syncProgress.total)} of ${syncProgress.total}`
                : offlineStats.queued > 0
                  ? `${offlineStats.queued} waiting`
                  : "All synced"}
            </Text>
            {syncProgress.active ? <View style={styles.heroStatusBar}><View style={[styles.heroStatusBarFill, { width: `${Math.max(syncProgress.percent, 8)}%` }]} /></View> : null}
          </View>
          <View style={styles.heroUserPill}>
            <Text style={styles.heroUserText}>{session?.user.full_name || "Current user"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.setupCard}>
        <Text style={styles.setupTitle}>Project & Field Setup</Text>

        <Text style={styles.fieldLabel}>Project Project</Text>
        <Pressable onPress={() => setProjectPickerOpen(true)} style={styles.selectField}>
          <Text style={[styles.selectValue, !selectedProject && styles.selectPlaceholder]}>
            {selectedProject ? selectedProject.name : "Choose a project"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
        </Pressable>

        <View style={[styles.projectStatusCard, selectedProject ? styles.projectStatusSelected : styles.projectStatusEmpty]}>
          <Text style={styles.projectStatusTitle}>{selectedProject ? selectedProject.name : "No project selected."}</Text>
          <Text style={styles.projectStatusSubtitle}>
            {selectedProject ? selectedProject.location_text || "Project selected" : "Please select a project to begin."}
          </Text>
        </View>

        {!selectedProject ? (
          <EmptyState title="No active project yet" subtitle="Select a project above before opening tasks, map capture, or tree records." />
        ) : (
          <>
            <View style={styles.statsGrid}>
              <MetricTile label="Total Trees" value={scopedTrees.length} helper="Visible to current user" />
              <MetricTile label="Healthy" value={healthyTrees} tone="success" helper="Healthy + alive" />
            </View>
            <View style={styles.statsGrid}>
              <MetricTile label="Dead" value={deadTrees} tone="danger" helper="Dead + removed" />
              <MetricTile label="Needs Attention" value={needsAttentionTrees} tone="attention" helper="Attention + damaged" />
            </View>
            <View style={styles.survivalCard}>
              <Text style={styles.survivalLabel}>Survival Rate</Text>
              <View style={styles.survivalGaugeWrap}>
                <View style={styles.survivalGauge}>
                  <Svg width={SURVIVAL_GAUGE_SIZE} height={SURVIVAL_GAUGE_SIZE} viewBox={`0 0 ${SURVIVAL_GAUGE_SIZE} ${SURVIVAL_GAUGE_SIZE}`}>
                    <Circle
                      cx={SURVIVAL_GAUGE_SIZE / 2}
                      cy={SURVIVAL_GAUGE_SIZE / 2}
                      r={SURVIVAL_GAUGE_RADIUS}
                      stroke="#e8ece8"
                      strokeWidth={SURVIVAL_GAUGE_STROKE}
                      fill="none"
                    />
                    <Circle
                      cx={SURVIVAL_GAUGE_SIZE / 2}
                      cy={SURVIVAL_GAUGE_SIZE / 2}
                      r={SURVIVAL_GAUGE_RADIUS}
                      stroke={colors.primary}
                      strokeWidth={SURVIVAL_GAUGE_STROKE}
                      strokeLinecap="round"
                      strokeDasharray={SURVIVAL_GAUGE_CIRCUMFERENCE}
                      strokeDashoffset={SURVIVAL_GAUGE_CIRCUMFERENCE * (1 - survivalRate / 100)}
                      fill="none"
                      rotation={-90}
                      origin={`${SURVIVAL_GAUGE_SIZE / 2}, ${SURVIVAL_GAUGE_SIZE / 2}`}
                    />
                  </Svg>
                  <View style={styles.survivalGaugeCenter}>
                    <Text style={styles.survivalValue}>{survivalRate}%</Text>
                  </View>
                </View>
                <View style={styles.survivalTextBlock}>
                  <Text style={styles.survivalHeadline}>Overall Survival Rate</Text>
                  <Text style={styles.survivalSubtext}>Based on current tree status</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.tileGrid}>
        <ActionTile
          title="Maintenance Tasks"
          subtitle={undefined}
          icon={<MaterialCommunityIcons name="clipboard-text-outline" size={26} color={colors.primaryDark} />}
          badgeValue={isCustodianUser ? "-" : myTaskCounts.undone}
          badgeTone={myTaskCounts.undone > 0 ? "warning" : "success"}
          secondaryBadgeValue={myTaskCounts.rejected > 0 ? myTaskCounts.rejected : undefined}
          secondaryBadgeTone="danger"
          footerBadges={[
            { label: `Submitted ${myTaskCounts.submitted}`, tone: "warning" },
            { label: `Approved ${myTaskCounts.done}`, tone: "success" },
          ]}
          disabled={isCustodianUser || !selectedProject}
          onPress={() => navigation.navigate("GreenTasks")}
        />
        <ActionTile
          title="Map & Add Trees"
          subtitle={undefined}
          icon={<MaterialCommunityIcons name="map-marker-plus-outline" size={26} color={colors.primaryDark} />}
          badgeValue={pendingPlanting}
          badgeTone={pendingPlanting > 0 ? "warning" : "success"}
          footerBadges={[
            { label: `Submitted ${plantingReviewCounts.submitted}`, tone: "warning" },
            { label: `Approved ${plantingReviewCounts.approved}`, tone: "success" },
          ]}
          disabled={!selectedProject}
          onPress={() => navigation.navigate("GreenField")}
        />
        <ActionTile
          title="Tree Records"
          subtitle={undefined}
          icon={<MaterialCommunityIcons name="tree-outline" size={26} color={colors.primaryDark} />}
          badgeValue={scopedTrees.length}
          disabled={!selectedProject}
          onPress={() => navigation.navigate("GreenRecords")}
        />
      </View>

      {selectedProject ? (
        <SectionCard
          title="Carbon Impact Summary"
          subtitle="Current, annual, and long-term modeled carbon values"
        >
          {carbonSummary ? (
            <>
              <View style={styles.statsGrid}>
                <MetricTile
                  label="Current CO2"
                  value={`${carbonSummary.current_co2_tonnes.toFixed(2)} t`}
                  helper={`${carbonSummary.current_co2_kg.toFixed(2)} kg sequestered`}
                />
                <MetricTile
                  label="Annual CO2"
                  value={`${carbonSummary.annual_co2_tonnes.toFixed(2)} t`}
                  helper={`${carbonSummary.annual_co2_kg.toFixed(2)} kg / yr`}
                />
              </View>
              <View style={styles.statsGrid}>
                <MetricTile
                  label="Projected 40y"
                  value={`${carbonSummary.projected_lifetime_co2_tonnes.toFixed(2)} t`}
                  tone="success"
                  helper="Long-term modeled stock"
                />
                <MetricTile
                  label="Per Tree"
                  value={`${carbonSummary.co2_per_tree_avg_kg.toFixed(2)} kg`}
                  helper={`${annualPerTreeKg.toFixed(2)} kg / tree / yr`}
                />
              </View>
            </>
          ) : (
            <EmptyState
              title="Carbon impact not loaded"
              subtitle={carbonError || (isOnline ? "Open the project online once to refresh carbon values." : "Reconnect once to refresh carbon impact for this project.")}
            />
          )}
        </SectionCard>
      ) : null}

      <SelectSheet
        visible={projectPickerOpen}
        title="Choose a project"
        options={projectOptions}
        selectedValue={selectedProjectId ? String(selectedProjectId) : null}
        onClose={() => setProjectPickerOpen(false)}
        onSelect={(value) => void selectProject(Number(value))}
      />
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 124,
  },
  heroPanel: {
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    padding: 12,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroBrandLogos: {
    flexDirection: "row",
    gap: 8,
  },
  heroBrandText: {
    flex: 1,
    gap: 1,
  },
  heroTitle: {
    color: colors.inverseText,
    fontSize: 16,
    fontWeight: "900",
  },
  heroTitleAccent: {
    color: "#9be3ae",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
  },
  heroStatusRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  heroActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  heroStatusCard: {
    flex: 0.78,
    minWidth: 0,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    justifyContent: "center",
  },
  heroStatusLabel: {
    color: colors.inverseText,
    fontSize: 11,
    fontWeight: "900",
  },
  heroStatusValue: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontWeight: "800",
  },
  heroStatusBar: {
    width: "100%",
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
    marginTop: 6,
  },
  heroStatusBarFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.inverseText,
  },
  heroUserPill: {
    flex: 1.22,
    minWidth: 110,
    maxWidth: 156,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroUserText: {
    color: colors.inverseText,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  heroActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroActionButtonDisabled: {
    opacity: 0.55,
  },
  heroActionText: {
    color: colors.inverseText,
    fontSize: 13,
    fontWeight: "800",
  },
  setupCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  setupTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  fieldLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectField: {
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  selectValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  selectPlaceholder: {
    color: colors.textMuted,
  },
  projectStatusCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  projectStatusSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
  },
  projectStatusEmpty: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
  },
  projectStatusTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  projectStatusSubtitle: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  survivalCard: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
    gap: 10,
  },
  survivalLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  survivalGaugeWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  survivalGauge: {
    width: SURVIVAL_GAUGE_SIZE,
    height: SURVIVAL_GAUGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  survivalGaugeCenter: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  survivalValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  survivalTextBlock: {
    flex: 1,
    gap: 2,
  },
  survivalHeadline: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  survivalSubtext: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  tileGrid: {
    flexDirection: "row",
    gap: 8,
  },
});
