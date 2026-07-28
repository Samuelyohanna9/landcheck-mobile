import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ActionTile } from "../../components/ActionTile";
import { BrandMark } from "../../components/BrandMark";
import { EmptyState } from "../../components/EmptyState";
import { FieldIdentityAvatar } from "../../components/FieldIdentityAvatar";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SelectSheet } from "../../components/SelectSheet";
import { fetchProjectDetail } from "../../api/green";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import {
  ATTENTION_TREE_STATUSES,
  DEAD_TREE_STATUSES,
  FIELD_CAPTURE_TASK_TYPE,
  HEALTHY_TREE_STATUSES,
  PLANTING_TASK_TYPES,
  isTaskApproved,
  isTaskMetadataEditRequested,
  isTaskRejected,
  isTaskSubmitted,
  normalizeName,
  normalizeTaskState,
} from "../../green/workflow";
import { getWorkflowLabels, getProjectWorkflowProfile, isAgricProject, isCsrProject, isReliefRecoveryProject } from "../../green/projectProfile";
import { filterVisibleTreeRecords } from "../../green/treeRecords";
import { cacheProjectDetail, readCachedProjectDetail } from "../../storage/database";
import type { CarbonSummary, ProjectDetailSummary } from "../../types/domain";
import { colors, radii, spacing } from "../../theme/tokens";

const GAUGE_SIZE = 78;
const GAUGE_STROKE = 8;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const getGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const getGreetingIcon = (): "sunny-outline" | "partly-sunny-outline" | "moon-outline" => {
  const h = new Date().getHours();
  if (h < 12) return "sunny-outline";
  if (h < 18) return "partly-sunny-outline";
  return "moon-outline";
};

const getSurvivalQuality = (rate: number) => {
  if (rate >= 80) return { label: "Excellent", note: "Keep it up! 🎉", bg: "rgba(42,168,82,0.14)", color: colors.primaryDark };
  if (rate >= 50) return { label: "Good progress", note: "Keep going 👍", bg: "rgba(217,119,6,0.14)", color: "#7a4b00" };
  return { label: "Needs attention", note: "Act now ⚠️", bg: "rgba(220,38,38,0.12)", color: "#b91c1c" };
};

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
  const [projectDetail, setProjectDetail] = useState<ProjectDetailSummary | null>(null);
  const [carbonError, setCarbonError] = useState("");

  const carbonSummary = useMemo<CarbonSummary | null>(() => {
    if (!projectDetail?.carbon) return null;
    return {
      ...projectDetail.carbon,
      project_id: Number(projectDetail.carbon.project_id || projectDetail.id || selectedProjectId || 0) || null,
    };
  }, [projectDetail?.carbon, projectDetail?.id, selectedProjectId]);
  const organizationLogoUrl =
    projectDetail?.organization_logo_url ||
    selectedProject?.organization_logo_url ||
    session?.user.organization_logo_url ||
    null;

  const greeting = useMemo(() => getGreeting(), []);
  const greetingIcon = useMemo(() => getGreetingIcon(), []);
  const firstName = useMemo(() => {
    const name = String(session?.user.full_name || "").trim();
    return name.split(" ")[0] || name || "there";
  }, [session?.user.full_name]);

  const currentUserName = normalizeName(session?.user.full_name);
  const workflowLabels = useMemo(() => getWorkflowLabels(selectedProject || null), [selectedProject]);
  const agricMode = useMemo(() => isAgricProject(selectedProject || null), [selectedProject]);
  const reliefMode = useMemo(() => isReliefRecoveryProject(selectedProject || null), [selectedProject]);
  const csrMode = useMemo(() => isCsrProject(selectedProject || null), [selectedProject]);
  const workflowProfile = useMemo(() => getProjectWorkflowProfile(selectedProject || null), [selectedProject]);
  const impactEyebrow = reliefMode ? "Recovery evidence" : agricMode ? "Programme evidence" : csrMode ? "Verified CSR implementation" : "Verified climate action";
  const impactChipLabels = reliefMode
    ? ["Mapped sites", "Relief updates", "Approved records"]
    : agricMode
      ? ["Mapped plots", "Field updates", "Approved records"]
      : ["Mapped trees", "Care updates", "Photo proof"];
  const scopedTrees = useMemo(() => {
    const custodianId = Number(matchedCustodian?.id || 0);
    return filterVisibleTreeRecords(trees).filter((tree) => {
      if (isCustodianUser && custodianId > 0) return Number(tree.custodian_id || 0) === custodianId;
      if (custodianId > 0 && Number(tree.custodian_id || 0) === custodianId) return true;
      return normalizeName(tree.created_by) === currentUserName;
    });
  }, [currentUserName, isCustodianUser, matchedCustodian?.id, trees]);

  const healthyTrees = scopedTrees.filter((t) => HEALTHY_TREE_STATUSES.has(normalizeTaskState(t.status))).length;
  const deadTrees = scopedTrees.filter((t) => DEAD_TREE_STATUSES.has(normalizeTaskState(t.status))).length;
  const needsAttentionTrees = scopedTrees.filter((t) => ATTENTION_TREE_STATUSES.has(normalizeTaskState(t.status))).length;
  const survivalRate = scopedTrees.length ? Math.round((healthyTrees / scopedTrees.length) * 100) : 0;
  const survivalQuality = useMemo(() => getSurvivalQuality(survivalRate), [survivalRate]);
  const gaugeDashOffset = GAUGE_CIRCUMFERENCE * (1 - survivalRate / 100);

  const myTaskCounts = useMemo(() => {
    if (isCustodianUser) return { total: 0, pending: 0, done: 0, submitted: 0, rejected: 0, metadataEdit: 0, review: 0, undone: 0 };
    const maintenanceTasks = tasks.filter(
      (t) =>
        !PLANTING_TASK_TYPES.has(normalizeTaskState(t.task_type)) &&
        normalizeTaskState(t.task_type) !== FIELD_CAPTURE_TASK_TYPE &&
        !isTaskRejected(t) &&
        !isTaskMetadataEditRequested(t),
    );
    const reviewTasks = tasks.filter((t) => isTaskRejected(t) || isTaskMetadataEditRequested(t));
    const total = maintenanceTasks.length;
    const done = maintenanceTasks.filter(isTaskApproved).length;
    const submitted = maintenanceTasks.filter(isTaskSubmitted).length;
    const rejected = reviewTasks.filter(isTaskRejected).length;
    const metadataEdit = reviewTasks.filter(isTaskMetadataEditRequested).length;
    const pending = maintenanceTasks.filter((t) => !isTaskApproved(t) && !isTaskSubmitted(t)).length;
    return { total, pending, done, submitted, rejected, metadataEdit, review: rejected + metadataEdit, undone: pending };
  }, [isCustodianUser, tasks]);

  const plantingReviewCounts = useMemo(() => {
    const plantingTasks = tasks.filter((t) => PLANTING_TASK_TYPES.has(normalizeTaskState(t.task_type)));
    return {
      submitted: plantingTasks.filter(isTaskSubmitted).length,
      approved: plantingTasks.filter(isTaskApproved).length,
    };
  }, [tasks]);

  const pendingPlanting = useMemo(() => {
    if (isCustodianUser && matchedCustodian) {
      return distributionAllocations
        .filter((r) => Number(r.custodian_id || 0) === Number(matchedCustodian.id))
        .reduce((sum, r) => sum + Math.max(Number(r.quantity_allocated || 0) - scopedTrees.length, 0), 0);
    }
    const workOrderPending = workOrders
      .filter((o) => normalizeTaskState(o.work_type) === "planting")
      .reduce((sum, o) => sum + Math.max(Number(o.target_trees || 0) - Number(o.planted_count || 0), 0), 0);
    if (agricMode || reliefMode) {
      const fieldCapturePending = tasks.filter((t) => {
        if (normalizeTaskState(t.task_type) !== FIELD_CAPTURE_TASK_TYPE) return false;
        const status = normalizeTaskState(t.status);
        const reviewState = normalizeTaskState(t.review_state);
        return !(reviewState === "approved" || status === "done" || status === "completed" || status === "closed");
      }).length;
      return workOrderPending + fieldCapturePending;
    }
    return workOrderPending;
  }, [agricMode, distributionAllocations, isCustodianUser, matchedCustodian, reliefMode, scopedTrees.length, tasks, workOrders]);

  const annualPerTreeKg = useMemo(() => {
    if (!carbonSummary || healthyTrees <= 0) return 0;
    return carbonSummary.annual_co2_kg / healthyTrees;
  }, [carbonSummary, healthyTrees]);

  const projectOptions = projects.map((p) => ({
    label: p.name,
    value: String(p.id),
    description: p.location_text || "Project available in this organization scope",
  }));

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedProjectId) {
        if (active) {
          setProjectDetail(null);
          setCarbonError("");
        }
        return;
      }

      const cachedDetail = await readCachedProjectDetail("green", selectedProjectId);
      if (active && cachedDetail) {
        setProjectDetail(cachedDetail);
        setCarbonError("");
      }

      if (!isOnline) return;

      try {
        const actorName = String(session?.user.full_name || "").trim();
        const detail = await fetchProjectDetail(selectedProjectId, actorName || undefined);
        if (!active) return;
        setProjectDetail(detail);
        setCarbonError("");
        await cacheProjectDetail("green", selectedProjectId, detail);
      } catch (e) {
        if (!active) return;
        setCarbonError(e instanceof Error ? e.message : "Carbon impact is unavailable right now.");
      }
    };
    void load();
    return () => { active = false; };
  }, [isOnline, selectedProjectId, session?.user.full_name]);

  const syncLabel = syncProgress.active
    ? `Sending ${Math.min(syncProgress.completed, syncProgress.total)} of ${syncProgress.total}`
    : offlineStats.queued > 0
      ? `${offlineStats.queued} waiting to send`
      : "All synced";

  return (
    <ScreenSurface refreshing={false} onRefresh={() => void refreshAll()} contentContainerStyle={styles.content}>

      {/* ─── HERO ─── */}
      <LinearGradient colors={["#0f2d1a", "#1a5c36"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        {/* Brand row – logos untouched */}
        <View style={styles.heroBrandRow}>
          <View style={styles.heroBrandIdentity}>
            <View style={styles.heroBrandLogos}>
              <BrandMark size={44} />
              {organizationLogoUrl ? (
                <BrandMark size={44} logoUrl={organizationLogoUrl} fallbackToDefault={false} variant="partner" />
              ) : null}
            </View>
            <View style={styles.heroBrandText}>
              <Text style={styles.heroTitle}>LandCheck <Text style={styles.heroTitleAccent}>{workflowProfile === "agric" ? "Agric" : workflowProfile === "relief_recovery" ? "Relief" : workflowProfile === "csr" ? "CSR" : "Green"}</Text></Text>
              <Text style={styles.heroSubtitle}>{workflowLabels.dashboardSubtitle}</Text>
            </View>
          </View>
          <FieldIdentityAvatar
            userId={session?.user.id}
            displayName={session?.user.full_name}
            photoUri={session?.user.profile_photo_url}
            size={46}
            borderColor="rgba(255,255,255,0.18)"
            accentColor="#ffffff"
          />
        </View>

        {/* Greeting */}
        <View style={styles.heroGreetingRow}>
          <Ionicons name={greetingIcon} size={16} color="rgba(255,255,255,0.82)" />
          <Text style={styles.heroGreeting}>
            {greeting},{" "}
            <Text style={styles.heroGreetingName}>{firstName}!</Text>
          </Text>
        </View>

        {/* Status row */}
        <View style={styles.heroStatusRow}>
          <View style={styles.heroOnlinePill}>
            <View style={[styles.heroOnlineDot, { backgroundColor: isOnline ? "#a3f0b0" : "#fca5a5" }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroOnlineLabel}>{isOnline ? "ONLINE" : "OFFLINE"}</Text>
              <Text style={styles.heroOnlineValue} numberOfLines={1}>{syncLabel}</Text>
            </View>
          </View>
          <View style={styles.heroUserPill}>
            <Ionicons name="person-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={styles.heroUserText} numberOfLines={1}>{session?.user.full_name || "Field user"}</Text>
          </View>
        </View>

        {/* Sync progress bar */}
        {syncProgress.active ? (
          <View style={styles.heroProgressBar}>
            <View style={[styles.heroProgressFill, { width: `${Math.max(syncProgress.percent, 6)}%` as any }]} />
          </View>
        ) : null}
      </LinearGradient>

      {/* ─── PROJECT & FIELD ─── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="sprout" size={16} color={colors.primaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Project & Field</Text>
            <Text style={styles.cardSubtitle}>CURRENT PROJECT</Text>
          </View>
        </View>

        <View style={styles.projectPickerRow}>
          <Pressable onPress={() => setProjectPickerOpen(true)} style={styles.projectDropdown}>
            <Text style={[styles.projectDropdownText, !selectedProject && styles.projectDropdownPlaceholder]} numberOfLines={1}>
              {selectedProject ? selectedProject.name : "Choose a project"}
            </Text>
            <Ionicons name="chevron-down" size={17} color={colors.textSoft} />
          </Pressable>

          {selectedProject ? (
            <View style={styles.projectLocationChip}>
              <Ionicons name="location" size={14} color={colors.primaryDark} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.projectLocationName} numberOfLines={1}>{selectedProject.name}</Text>
                <Text style={styles.projectLocationSub} numberOfLines={1}>
                  {selectedProject.location_text || "Project selected"}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {!selectedProject ? (
          <EmptyState
            title="No active project yet"
            subtitle={`Select a project above before opening tasks, ${workflowLabels.actionTitle.toLowerCase()}, or ${workflowLabels.recordsTitle.toLowerCase()}.`}
          />
        ) : (
          <>
            {/* 4 metric tiles */}
            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                <View style={[styles.metricIcon, { backgroundColor: "rgba(42,168,82,0.13)" }]}>
                  <MaterialCommunityIcons
                    name={agricMode || reliefMode ? "vector-polygon" : "tree-outline"}
                    size={17}
                    color={colors.primaryDark}
                  />
                </View>
                <Text style={styles.metricValue}>{scopedTrees.length}</Text>
                <Text style={styles.metricLabel}>{workflowLabels.totalLabel}</Text>
                <Text style={styles.metricHelper}>Visible to you</Text>
              </View>

              <View style={styles.metricBox}>
                <View style={[styles.metricIcon, { backgroundColor: "rgba(42,168,82,0.13)" }]}>
                  <MaterialCommunityIcons name="heart-outline" size={17} color={colors.primaryDark} />
                </View>
                <Text style={styles.metricValue}>{healthyTrees}</Text>
                <Text style={styles.metricLabel}>{workflowLabels.healthyLabel}</Text>
                <Text style={styles.metricHelper}>{workflowLabels.healthyHelper}</Text>
              </View>

              <View style={styles.metricBox}>
                <View style={[styles.metricIcon, { backgroundColor: "rgba(217,119,6,0.13)" }]}>
                  <MaterialCommunityIcons name="alert-outline" size={17} color="#d97706" />
                </View>
                <Text style={[styles.metricValue, needsAttentionTrees > 0 && styles.metricValueWarn]}>
                  {needsAttentionTrees}
                </Text>
                <Text style={styles.metricLabel}>{workflowLabels.attentionLabel}</Text>
                <Text style={styles.metricHelper}>{workflowLabels.attentionHelper}</Text>
              </View>

              <View style={styles.metricBox}>
                <View style={[styles.metricIcon, { backgroundColor: "rgba(220,38,38,0.12)" }]}>
                  <MaterialCommunityIcons name="close-circle-outline" size={17} color="#dc2626" />
                </View>
                <Text style={[styles.metricValue, deadTrees > 0 && styles.metricValueDanger]}>{deadTrees}</Text>
                <Text style={styles.metricLabel}>{workflowLabels.deadLabel}</Text>
                <Text style={styles.metricHelper}>{workflowLabels.deadHelper}</Text>
              </View>
            </View>

            {/* Survival rate */}
            <View style={styles.survivalCard}>
              <View style={styles.survivalGaugeWrap}>
                <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
                  <Circle
                    cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS}
                    stroke="#e2f0e4" strokeWidth={GAUGE_STROKE} fill="none"
                  />
                  <Circle
                    cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS}
                    stroke={colors.primary} strokeWidth={GAUGE_STROKE} strokeLinecap="round" fill="none"
                    strokeDasharray={GAUGE_CIRCUMFERENCE}
                    strokeDashoffset={gaugeDashOffset}
                    rotation={-90}
                    origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
                  />
                </Svg>
                <View style={styles.survivalGaugeCenter}>
                  <Text style={styles.survivalPct}>{survivalRate}%</Text>
                </View>
              </View>

              <View style={styles.survivalTextBlock}>
                <Text style={styles.survivalHeadline}>{agricMode ? "Overall Field Condition" : reliefMode ? "Overall Site Condition" : "Overall Survival Rate"}</Text>
                <Text style={styles.survivalSubtext}>{agricMode ? "Based on current plot status" : reliefMode ? "Based on current site status" : "Based on current tree status"}</Text>
              </View>

              <View style={[styles.survivalBadge, { backgroundColor: survivalQuality.bg }]}>
                <Ionicons name="trending-up" size={11} color={survivalQuality.color} />
                <View style={{ alignItems: "center" }}>
                  <Text style={[styles.survivalBadgeLabel, { color: survivalQuality.color }]}>
                    {survivalQuality.label}
                  </Text>
                  <Text style={styles.survivalBadgeNote}>{survivalQuality.note}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* ─── QUICK ACTIONS ─── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.sectionTitleLine} />
      </View>

      <View style={styles.tileGrid}>
        <View style={styles.tileCell}>
          <ActionTile
            title={workflowLabels.activityTitle}
            icon={<MaterialCommunityIcons name="clipboard-text-outline" size={26} color={colors.primaryDark} />}
            badgeValue={isCustodianUser ? "-" : myTaskCounts.undone}
            badgeTone={myTaskCounts.undone > 0 ? "warning" : "success"}
            secondaryBadgeValue={myTaskCounts.review > 0 ? myTaskCounts.review : undefined}
            secondaryBadgeTone="danger"
            footerBadges={[
              { label: `${myTaskCounts.submitted} Submitted`, tone: "warning" },
              { label: `${myTaskCounts.done} Approved`, tone: "success" },
            ]}
            disabled={isCustodianUser || !selectedProject}
            onPress={() => navigation.navigate("GreenTasks", { mode: "maintenance" })}
          />
        </View>
        <View style={styles.tileCell}>
          <ActionTile
            title={workflowLabels.actionTitle}
            icon={<MaterialCommunityIcons name="map-marker-plus-outline" size={26} color={colors.primaryDark} />}
            badgeValue={pendingPlanting}
            badgeTone={pendingPlanting > 0 ? "warning" : "success"}
            footerBadges={[
              { label: `${plantingReviewCounts.submitted} Submitted`, tone: "warning" },
              { label: `${plantingReviewCounts.approved} Approved`, tone: "success" },
            ]}
            disabled={!selectedProject}
            onPress={() => navigation.navigate("GreenField")}
          />
        </View>
        <View style={styles.tileCell}>
          <ActionTile
            title="Review Fixes"
            icon={<MaterialCommunityIcons name="file-document-edit-outline" size={26} color={colors.primaryDark} />}
            badgeValue={isCustodianUser ? "-" : myTaskCounts.review}
            badgeTone={myTaskCounts.review > 0 ? "warning" : "success"}
            footerBadges={[
              { label: `${myTaskCounts.metadataEdit} Metadata`, tone: "warning" },
              { label: `${myTaskCounts.rejected} Rejected`, tone: "warning" },
            ]}
            disabled={isCustodianUser || !selectedProject}
            onPress={() => navigation.navigate("GreenTasks", { mode: "review" })}
          />
        </View>
        <View style={styles.tileCell}>
          <ActionTile
            title={workflowLabels.recordsTitle}
            icon={
              <MaterialCommunityIcons
                name={agricMode || reliefMode ? "map-marker-path" : "tree-outline"}
                size={26}
                color={colors.primaryDark}
              />
            }
            badgeValue={scopedTrees.length}
            footerBadges={[{ label: `${scopedTrees.length} ${workflowLabels.entityPlural}`, tone: "success" }]}
            disabled={!selectedProject}
            onPress={() => navigation.navigate("GreenRecords")}
          />
        </View>
      </View>

      {/* ─── CARBON IMPACT ─── */}
      {selectedProject && !agricMode && !reliefMode ? (
        <LinearGradient colors={["#0f2d1a", "#1a5c36"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.carbonCard}>
          <View style={styles.carbonHeader}>
            <View style={styles.carbonIconWrap}>
              <MaterialCommunityIcons name="leaf" size={16} color="#9be3ae" />
            </View>
            <Text style={styles.carbonTitle}>Carbon Impact at a Glance</Text>
          </View>

          {carbonSummary ? (
            <View style={styles.carbonGrid}>
              <View style={styles.carbonMetric}>
                <Text style={styles.carbonMetricValue}>{carbonSummary.current_co2_tonnes.toFixed(2)} t</Text>
                <Text style={styles.carbonMetricLabel}>Current CO2</Text>
                <Text style={styles.carbonMetricSub}>{carbonSummary.current_co2_kg.toFixed(2)} kg sequestered</Text>
              </View>
              <View style={styles.carbonMetric}>
                <Text style={styles.carbonMetricValue}>{carbonSummary.annual_co2_tonnes.toFixed(2)} t</Text>
                <Text style={styles.carbonMetricLabel}>Annual CO2</Text>
                <Text style={styles.carbonMetricSub}>{carbonSummary.annual_co2_kg.toFixed(2)} kg/yr</Text>
              </View>
              <View style={styles.carbonMetric}>
                <Text style={styles.carbonMetricValue}>{carbonSummary.projected_lifetime_co2_tonnes.toFixed(2)} t</Text>
                <Text style={styles.carbonMetricLabel}>Projected 40y</Text>
                <Text style={styles.carbonMetricSub}>Long-term stock</Text>
              </View>
              <View style={styles.carbonMetric}>
                <Text style={styles.carbonMetricValue}>{carbonSummary.co2_per_tree_avg_kg.toFixed(2)} kg</Text>
                <Text style={styles.carbonMetricLabel}>Per Tree</Text>
                <Text style={styles.carbonMetricSub}>{annualPerTreeKg.toFixed(2)} kg/tree/yr</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.carbonUnavailable}>
              {carbonError || (isOnline ? "Loading carbon values…" : "Connect once to load carbon data.")}
            </Text>
          )}
        </LinearGradient>
      ) : null}

      {/* ─── MOTIVATIONAL FOOTER ─── */}
      {selectedProject ? (
        <LinearGradient colors={["#0f5b2f", "#1f7d43", "#66be6d"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.motivationalCard}>
          <View style={styles.motivationalGlowPrimary} />
          <View style={styles.motivationalGlowSecondary} />
          <View style={styles.motivationalCopy}>
            <View style={styles.motivationalHeaderRow}>
              <View style={styles.motivationalIconWrap}>
                <MaterialCommunityIcons name={agricMode || reliefMode ? "map-marker-path" : "leaf"} size={18} color="#ffffff" />
              </View>
              <View style={styles.motivationalTextWrap}>
                <Text style={styles.motivationalEyebrow}>{impactEyebrow}</Text>
                <Text style={styles.motivationalText}>
                  <Text style={styles.motivationalBold}>{agricMode || reliefMode ? "Great work. " : "Great job. "}</Text>
                  {workflowLabels.impactMessage}
                </Text>
              </View>
            </View>
            <View style={styles.motivationalChipRow}>
              {impactChipLabels.map((label) => (
                <View key={label} style={styles.motivationalChip}>
                  <Text style={styles.motivationalChipText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          <Pressable style={styles.motivationalButton} onPress={() => navigation.navigate("GreenField")}>
            <MaterialCommunityIcons
              name={agricMode || reliefMode ? "map-marker-path" : "tree"}
              size={20}
              color={colors.inverseText}
            />
          </Pressable>
        </LinearGradient>
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
    gap: 14,
  },

  /* ─── HERO ─── */
  hero: {
    borderRadius: radii.xl,
    padding: 14,
    gap: 10,
    shadowColor: "rgba(10,50,24,0.38)",
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroBrandIdentity: {
    flex: 1,
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
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "600",
  },
  heroGreetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  heroGreeting: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 15,
    fontWeight: "700",
  },
  heroGreetingName: {
    color: colors.inverseText,
    fontWeight: "900",
  },
  heroStatusRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  heroOnlinePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroOnlineLabel: {
    color: colors.inverseText,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  heroOnlineValue: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    fontWeight: "800",
  },
  heroUserPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    maxWidth: 160,
  },
  heroUserText: {
    color: colors.inverseText,
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
  },
  heroProgressBar: {
    width: "100%",
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: "#a3f0b0",
  },

  /* ─── SHARED CARD ─── */
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 19,
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  /* ─── PROJECT PICKER ─── */
  projectPickerRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  projectDropdown: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  projectDropdownText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  projectDropdownPlaceholder: {
    color: colors.textMuted,
    fontWeight: "500",
  },
  projectLocationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
    maxWidth: 130,
  },
  projectLocationName: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "900",
  },
  projectLocationSub: {
    color: colors.textSoft,
    fontSize: 10,
    lineHeight: 13,
  },

  /* ─── METRIC TILES ─── */
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricBox: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: 10,
    gap: 4,
    alignItems: "flex-start",
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24,
  },
  metricValueWarn: {
    color: "#c05b00",
  },
  metricValueDanger: {
    color: "#b91c1c",
  },
  metricLabel: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
  },
  metricHelper: {
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
  },

  /* ─── SURVIVAL RATE ─── */
  survivalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: 14,
  },
  survivalGaugeWrap: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  survivalGaugeCenter: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  survivalPct: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  survivalTextBlock: {
    flex: 1,
    gap: 3,
  },
  survivalHeadline: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  survivalSubtext: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  survivalBadge: {
    borderRadius: radii.lg,
    paddingHorizontal: 9,
    paddingVertical: 8,
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  survivalBadgeLabel: {
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  survivalBadgeNote: {
    color: colors.textMuted,
    fontSize: 9,
    textAlign: "center",
  },

  /* ─── SECTION HEADER ─── */
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    flexShrink: 0,
  },
  sectionTitleLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },

  /* ─── TILE GRID ─── */
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
  tileCell: {
    width: "50%",
    paddingHorizontal: 5,
    marginBottom: 10,
  },

  /* ─── CARBON CARD ─── */
  carbonCard: {
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: 14,
    shadowColor: "rgba(10,40,20,0.42)",
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  carbonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  carbonIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(163,240,176,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  carbonTitle: {
    color: colors.inverseText,
    fontSize: 15,
    fontWeight: "900",
    flex: 1,
  },
  carbonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  carbonMetric: {
    width: "47%",
    gap: 2,
  },
  carbonMetricValue: {
    color: "#a3f0b0",
    fontSize: 20,
    fontWeight: "900",
  },
  carbonMetricLabel: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontWeight: "800",
  },
  carbonMetricSub: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 10,
    lineHeight: 14,
  },
  carbonUnavailable: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },

  /* ─── MOTIVATIONAL ─── */
  motivationalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.xl,
    padding: spacing.md,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  motivationalGlowPrimary: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    right: -28,
    top: -30,
  },
  motivationalGlowSecondary: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    left: -22,
    bottom: -28,
  },
  motivationalCopy: {
    flex: 1,
    gap: 10,
  },
  motivationalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  motivationalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  motivationalTextWrap: {
    flex: 1,
    gap: 4,
  },
  motivationalEyebrow: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  motivationalText: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  motivationalBold: {
    color: "#ffffff",
    fontWeight: "900",
  },
  motivationalChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  motivationalChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  motivationalChipText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  motivationalButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(9,33,16,0.24)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "rgba(9,33,16,0.32)",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
