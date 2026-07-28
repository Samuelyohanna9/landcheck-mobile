import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "../../components/BrandMark";
import { EmptyState } from "../../components/EmptyState";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { SponsorIdentityAvatar } from "../../components/SponsorIdentityAvatar";
import { fetchSponsorTrees } from "../../api/sponsor";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getSponsorFirstName, getSponsorGreeting, getSponsorGreetingIcon } from "../../sponsor/presentation";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatDate, toTitle } from "../../utils/format";
import type { SponsorTreeSummary } from "../../types/domain";
import type { SponsorAppStackParamList } from "../../types/navigation";

const sponsorHeroBackground = require("../../../assets/background-sponsor.png");

const toneForTree = (status?: string | null) => {
  const key = String(status || "").trim().toLowerCase();
  if (key === "linked" || key === "active") return "online" as const;
  if (key === "cancelled" || key === "replaced") return "offline" as const;
  if (key === "awaiting_payment" || key === "awaiting_tree") return "warning" as const;
  return "neutral" as const;
};

export const SponsorTreesScreen = () => {
  const { session } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<SponsorAppStackParamList>>();
  const [trees, setTrees] = useState<SponsorTreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    setError("");
    try {
      const rows = await fetchSponsorTrees(session);
      setTrees(rows);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load your sponsored trees."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const greeting = useMemo(() => getSponsorGreeting(), []);
  const greetingIcon = useMemo(() => getSponsorGreetingIcon(), []);
  const firstName = useMemo(() => getSponsorFirstName(session?.user.full_name), [session?.user.full_name]);
  const linkedCount = useMemo(() => trees.filter((item) => Number(item.tree_id || 0) > 0).length, [trees]);
  const awaitingCount = useMemo(
    () => trees.filter((item) => ["awaiting_payment", "awaiting_tree"].includes(String(item.sponsorship_status || "").trim().toLowerCase())).length,
    [trees],
  );
  const carbonTotal = useMemo(() => trees.reduce((sum, item) => sum + Number(item.carbon?.current_co2_kg || 0), 0), [trees]);
  const liveCarbonLabel = useMemo(() => (carbonTotal >= 1000 ? `${(carbonTotal / 1000).toFixed(2)} t` : `${carbonTotal.toFixed(1)} kg`), [carbonTotal]);

  if (!session) return null;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void loadData()} contentContainerStyle={styles.scrollContent}>
      {/* Header background and greeting */}
      <View style={styles.headerContainer}>
        <ExpoImage source={sponsorHeroBackground} contentFit="cover" style={styles.headerBgImage} />
        
        {/* Soft gradient fade overlay */}
        <LinearGradient
          colors={["#f9fcf9", "rgba(249, 252, 249, 0.88)", "rgba(249, 252, 249, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        
        <View style={styles.topRow}>
          <View style={styles.brandMarkContainer}>
            <BrandMark size={48} />
          </View>
          <SponsorIdentityAvatar sponsorId={session.user.id} displayName={session.user.full_name} photoUri={session.user.profile_photo_url} size={48} />
        </View>

        <View style={styles.greetingSection}>
          <View style={styles.greetingBadge}>
            <Ionicons name={greetingIcon} size={13} color="#a6813c" />
            <Text style={styles.greetingBadgeText}>Climate Contributor</Text>
          </View>
          <Text style={styles.greetingTitle}>
            {greeting}, {firstName}
          </Text>
          <Text style={styles.greetingSubtitle}>
            Trace every sponsored tree from reservation to verified planting, care, certificate, and public impact sharing.
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statsPill}>
            <Ionicons name="leaf-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{trees.length} tree{trees.length === 1 ? "" : "s"} reserved</Text>
          </View>
          <View style={styles.statsPill}>
            <Ionicons name="git-network-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{linkedCount} live tree{linkedCount === 1 ? "" : "s"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodyContent}>

      <View style={styles.storyBanner}>
        <ExpoImage source={sponsorHeroBackground} style={styles.storyBackdrop} contentFit="cover" />
        <View style={styles.storyOverlay}>
          <View style={styles.storyTextBlock}>
            <Text style={styles.storyEyebrow}>Your live tree portfolio</Text>
            <Text style={styles.storyTitle}>Every verified tree now has a richer story you can follow and share.</Text>
            <Text style={styles.storyBody}>
              Open any live tree to see its map location, approved field evidence, maintenance timeline, QR certificate, and public impact page.
            </Text>
            <View style={styles.storyProofRow}>
              <View style={styles.storyProofChip}>
                <Ionicons name="camera-outline" size={13} color={colors.primaryDark} />
                <Text style={styles.storyProofText}>Evidence photos</Text>
              </View>
              <View style={styles.storyProofChip}>
                <Ionicons name="location-outline" size={13} color={colors.primaryDark} />
                <Text style={styles.storyProofText}>Map direction</Text>
              </View>
              <View style={styles.storyProofChip}>
                <Ionicons name="share-social-outline" size={13} color={colors.primaryDark} />
                <Text style={styles.storyProofText}>Share-ready link</Text>
              </View>
            </View>
          </View>
          <View style={styles.storyStatRow}>
            <View style={styles.storyStatCard}>
              <Text style={styles.storyStatKicker}>Live carbon</Text>
              <Text style={styles.storyStatValue}>{liveCarbonLabel}</Text>
              <Text style={styles.storyStatLabel}>Already tied to your verified trees</Text>
            </View>
            <View style={styles.storyStatCard}>
              <Text style={styles.storyStatKicker}>Verified trees</Text>
              <Text style={styles.storyStatValue}>{linkedCount}</Text>
              <Text style={styles.storyStatLabel}>Ready for map, photos, and certificate view</Text>
            </View>
          </View>
        </View>
      </View>

      <SectionCard title="Tree progress" subtitle="A quick view of what is already live and what is still moving through review.">
        <View style={styles.metricRow}>
          <MetricTile label="Trees reserved" value={trees.length} helper="All sponsor units" />
          <MetricTile label="Live trees" value={linkedCount} tone="success" helper="Verified and visible" />
        </View>
        <View style={styles.metricRow}>
          <MetricTile label="Waiting" value={awaitingCount} tone="warning" helper="Payment or planting still pending" />
          <MetricTile label="Live CO2" value={`${carbonTotal.toFixed(2)} kg`} helper="Already stored" />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </SectionCard>

      <SectionCard title="My trees" subtitle="Open any verified tree to explore its map, evidence gallery, care timeline, certificate, and public share page.">
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : trees.length === 0 ? (
          <EmptyState
            title="No sponsored trees yet"
            subtitle="Once you reserve trees, they will appear here and update as the project team verifies payment and planting."
          />
        ) : (
          <View style={styles.list}>
            {trees.map((item) => {
              const linked = Boolean(item.tree_id);
              return (
                <View
                  key={`sponsor-tree-${item.unit_id}`}
                  style={[
                    styles.itemCard,
                    linked ? styles.itemCardLinked : styles.itemCardPending,
                  ]}
                >
                  <View style={styles.itemHead}>
                    <SponsorIdentityAvatar sponsorId={session.user.id} displayName={session.user.full_name} photoUri={session.user.profile_photo_url} size={44} />
                    <View style={styles.itemText}>
                      <View style={styles.titleRow}>
                        <Ionicons name={linked ? "leaf-outline" : "time-outline"} size={16} color={linked ? "#c5a059" : colors.warning} />
                        <Text style={styles.itemTitle}>
                          {item.project_tree_no ? `Tree ${item.project_tree_no}` : item.unit_uid || "Sponsored tree"}
                        </Text>
                      </View>
                      <Text style={styles.itemMeta}>{item.project_name || "LandCheck Green project"}</Text>
                    </View>
                    <StatusChip label={toTitle(item.sponsorship_status || "pending")} tone={toneForTree(item.sponsorship_status)} />
                  </View>

                  <Text style={styles.itemBody}>
                    {linked
                      ? `${item.species || "Tree"} | planted ${formatDate(item.planting_date)} | ${Number(item.carbon?.current_co2_kg || 0).toFixed(2)} kg current CO2`
                      : "This sponsorship is still moving through payment and field verification. The premium certificate and live evidence will unlock once the tree is planted and reviewed."}
                  </Text>

                  <View style={styles.chipRow}>
                    <StatusChip label={linked ? "Certificate ready" : "Certificate pending"} tone={linked ? "online" : "warning"} />
                    <StatusChip label={linked ? "Map available" : "Waiting for location"} tone={linked ? "online" : "neutral"} />
                  </View>

                  {item.dedication_name || item.dedication_message ? (
                    <Text style={styles.dedication}>
                      Dedication: {[item.dedication_name, item.dedication_message].filter(Boolean).join(" | ")}
                    </Text>
                  ) : null}

                  {linked ? (
                    <Pressable
                      style={styles.cardActionButton}
                      onPress={() => navigation.navigate("SponsorTreeDetail", { unitId: item.unit_id })}
                    >
                      <Ionicons name="sparkles-outline" size={16} color="#071d11" />
                      <Text style={styles.cardActionButtonLabel}>Open Live Tree Story</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.cardActionButtonDisabled}>
                      <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
                      <Text style={styles.cardActionButtonDisabledLabel}>Awaiting verified planting</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Take Climate Action" subtitle="Every additional tree you sponsor helps filter more water, absorb more carbon, and restore vital local ecosystems.">
        <PrimaryButton
          label="Sponsor Another Tree"
          onPress={() => navigation.navigate("SponsorProjects" as never)}
        />
      </SectionCard>
      </View>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  bodyContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  headerContainer: {
    marginTop: -16,
    paddingHorizontal: 16,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    position: "relative",
    overflow: "hidden",
  },
  headerBgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: -40,
    bottom: 0,
    width: "115%",
    height: "100%",
    opacity: 0.95,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandMarkContainer: {
    borderRadius: radii.md,
    backgroundColor: "#ffffff",
    padding: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sunnyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  greetingSection: {
    gap: 6,
    paddingRight: "30%",
  },
  greetingBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fbf7ee",
    borderWidth: 1,
    borderColor: "rgba(197, 160, 89, 0.20)",
  },
  greetingBadgeText: {
    color: "#a6813c",
    fontSize: 12,
    fontWeight: "900",
  },
  greetingTitle: {
    color: "#0c2b1a",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  greetingSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  statsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.08)",
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statsPillText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  heroBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  storyBanner: {
    borderRadius: radii.xl,
    overflow: "hidden",
    minHeight: 286,
    position: "relative",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  storyBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -80,
    width: "100%",
    height: "150%",
    opacity: 0.08,
  },
  storyOverlay: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
    justifyContent: "space-between",
  },
  storyTextBlock: {
    gap: 8,
  },
  storyEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  storyTitle: {
    color: "#0c2b1a",
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.6,
    maxWidth: 320,
  },
  storyBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  storyProofRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  storyProofChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f6f9f7",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.08)",
  },
  storyProofText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  storyStatRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  storyStatCard: {
    flex: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#f6f9f7",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.12)",
    gap: 6,
  },
  storyStatKicker: {
    color: "#c5a059",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  storyStatValue: {
    color: "#0c2b1a",
    fontSize: 28,
    fontWeight: "900",
  },
  storyStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: spacing.sm,
  },
  itemCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: "#ffffff",
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  itemCardLinked: {
    borderLeftWidth: 4,
    borderLeftColor: "#c5a059",
  },
  itemCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: "#e0e6e2",
  },
  itemHead: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  itemText: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  itemBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  dedication: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardActionButton: {
    backgroundColor: "#c5a059",
    borderRadius: radii.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  cardActionButtonLabel: {
    color: "#071d11",
    fontSize: 14,
    fontWeight: "900",
  },
  cardActionButtonDisabled: {
    backgroundColor: "rgba(22, 103, 58, 0.05)",
    borderRadius: radii.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  cardActionButtonDisabledLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
});
