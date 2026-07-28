import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { SponsorIdentityAvatar } from "../../components/SponsorIdentityAvatar";
import { fetchPublicLeaderboard, LeaderboardEntry, SponsorLeaderboardData } from "../../api/sponsor";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, radii, spacing } from "../../theme/tokens";

type TabKey = "overall" | "school" | "community" | "company";

export const SponsorLeaderboardScreen = () => {
  const { session } = useAuth();
  const [data, setData] = useState<SponsorLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overall");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetchPublicLeaderboard();
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load the leaderboard."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const activeList = useMemo((): LeaderboardEntry[] => {
    if (!data) return [];
    if (activeTab === "overall") return data.top_overall || [];
    if (activeTab === "school") return data.top_schools || [];
    if (activeTab === "community") return data.top_communities || [];
    if (activeTab === "company") return data.top_companies || [];
    return [];
  }, [data, activeTab]);

  const userRank = useMemo((): LeaderboardEntry | null => {
    if (!session || !data) return null;
    const userId = session.user.id;
    // Search in overall list
    return data.top_overall?.find((x) => x.sponsor_id === userId) || null;
  }, [session, data]);

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { color: "#ffd700", icon: "trophy" };
    if (rank === 2) return { color: "#c0c0c0", icon: "trophy" };
    if (rank === 3) return { color: "#cd7f32", icon: "trophy" };
    return { color: colors.textMuted, icon: "ribbon-outline" };
  };

  const getBadgeEmoji = (level?: string | null) => {
    const l = String(level || "").toLowerCase();
    if (l.includes("guardian")) return "🌍";
    if (l.includes("champion")) return "🌲";
    if (l.includes("builder")) return "🌳";
    if (l.includes("green")) return "🌿";
    return "🌱";
  };

  if (!session) return null;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void loadData()} contentContainerStyle={styles.scrollContent}>
      {/* Premium header block */}
      <View style={styles.headerContainer}>
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Ionicons name="trophy-outline" size={14} color="#a6813c" />
            <Text style={styles.badgeText}>Monthly Leaderboard</Text>
          </View>
          <SponsorIdentityAvatar sponsorId={session.user.id} displayName={session.user.full_name} photoUri={session.user.profile_photo_url} size={48} borderColor="rgba(197, 160, 89, 0.35)" accentColor="#a6813c" />
        </View>
        <Text style={styles.title}>Top Sponsors</Text>
        <Text style={styles.subtitle}>
          Celebrate and follow the top supporters sponsoring forest restoration and climate action under LandCheck Green this month.
        </Text>
      </View>

      <View style={styles.bodyContent}>
        {/* User's own ranking banner */}
        {userRank ? (
          <View style={styles.userRankBanner}>
            <SponsorIdentityAvatar sponsorId={session.user.id} displayName={session.user.full_name} photoUri={session.user.profile_photo_url} size={54} borderColor="rgba(197, 160, 89, 0.35)" accentColor="#a6813c" />
            <View style={styles.userRankInfo}>
              <Text style={styles.userRankTitle}>You are ranked #{userRank.rank} overall!</Text>
              <Text style={styles.userRankSubtitle}>
                With {userRank.monthly_trees} trees sponsored this month. Keep up the amazing work!
              </Text>
            </View>
          </View>
        ) : null}

        {/* Tab switch row */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, activeTab === "overall" && styles.tabButtonActive]}
            onPress={() => setActiveTab("overall")}
          >
            <Text style={[styles.tabLabel, activeTab === "overall" && styles.tabLabelActive]}>Overall</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === "school" && styles.tabButtonActive]}
            onPress={() => setActiveTab("school")}
          >
            <Text style={[styles.tabLabel, activeTab === "school" && styles.tabLabelActive]}>Schools</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === "community" && styles.tabButtonActive]}
            onPress={() => setActiveTab("community")}
          >
            <Text style={[styles.tabLabel, activeTab === "community" && styles.tabLabelActive]}>Communities</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === "company" && styles.tabButtonActive]}
            onPress={() => setActiveTab("company")}
          >
            <Text style={[styles.tabLabel, activeTab === "company" && styles.tabLabelActive]}>Companies</Text>
          </Pressable>
        </View>

        {/* List Section */}
        <SectionCard title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Rankings`} subtitle="Refreshed dynamically on verified sponsorship order completions.">
          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : activeList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="leaf-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No entries yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to sponsor a tree in this category this month!</Text>
            </View>
          ) : (
            <View style={styles.listContainer}>
              {activeList.map((item, index) => {
                const rankMeta = getRankStyle(item.rank);
                const isCurrentUser = item.sponsor_id === session.user.id;
                const emoji = getBadgeEmoji(item.achievement_level);

                return (
                  <View key={`rank-${item.sponsor_id}`} style={[styles.rankRow, isCurrentUser && styles.rankRowCurrent]}>
                    <View style={styles.rankCol}>
                      {item.rank <= 3 ? (
                        <Ionicons name={rankMeta.icon as any} size={22} color={rankMeta.color} />
                      ) : (
                        <Text style={styles.rankNumber}>#{item.rank}</Text>
                      )}
                    </View>

                    <SponsorIdentityAvatar
                      sponsorId={isCurrentUser ? session.user.id : null}
                      displayName={item.display_name}
                      photoUri={isCurrentUser ? session.user.profile_photo_url : null}
                      size={42}
                      borderColor={isCurrentUser ? "rgba(22, 103, 58, 0.28)" : "rgba(18, 92, 45, 0.12)"}
                      accentColor={isCurrentUser ? colors.primaryDark : "#3f6c52"}
                    />

                    <View style={styles.infoCol}>
                      <View style={styles.nameRow}>
                        <Text style={styles.nameText} numberOfLines={1}>
                          {item.display_name}
                        </Text>
                        <View style={styles.levelBadge}>
                          <Text style={styles.levelBadgeText}>{emoji} {item.achievement_level}</Text>
                        </View>
                      </View>
                      <Text style={styles.metaText}>
                        Category: {item.entity_category} | All-time: {item.all_time_trees} trees
                      </Text>
                    </View>

                    <View style={styles.valueCol}>
                      <Text style={styles.valueText}>{item.monthly_trees}</Text>
                      <Text style={styles.valueLabel}>Trees</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>
      </View>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: spacing.lg,
  },
  bodyContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fbf7ee",
    borderWidth: 1,
    borderColor: "rgba(197, 160, 89, 0.25)",
  },
  badgeText: {
    color: "#a6813c",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: "#0c2b1a",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  userRankBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fbf7ee",
    borderWidth: 1.5,
    borderColor: "#c5a059",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  userRankIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fefdfa",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(197, 160, 89, 0.20)",
  },
  userRankInfo: {
    flex: 1,
  },
  userRankTitle: {
    color: "#0c2b1a",
    fontSize: 15,
    fontWeight: "900",
  },
  userRankSubtitle: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(18, 92, 45, 0.08)",
    borderRadius: 16,
    padding: 4,
    gap: 2,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryDark,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: "#ffffff",
  },
  loader: {
    marginVertical: 40,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
    marginVertical: 20,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 8,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  listContainer: {
    gap: spacing.sm,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9faf9",
    borderWidth: 1,
    borderColor: "rgba(18, 92, 45, 0.04)",
    borderRadius: 16,
    padding: spacing.md,
    gap: 12,
  },
  rankRowCurrent: {
    backgroundColor: "#ffffff",
    borderColor: colors.primary,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  rankCol: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "900",
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  nameText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    maxWidth: 140,
  },
  levelBadge: {
    backgroundColor: "#fbf7ee",
    borderWidth: 1,
    borderColor: "rgba(197, 160, 89, 0.15)",
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelBadgeText: {
    color: "#b8860b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  valueCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  valueText: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  valueLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
