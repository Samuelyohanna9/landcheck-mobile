import { useCallback, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";
import { fetchPublicLeaderboard, type LeaderboardEntry } from "../api/sponsor";

const MEDALS = ["🥇", "🥈", "🥉"];

type SchoolEntry = LeaderboardEntry & { rank: number };

const treeBar = (count: number, max: number) => {
  const pct = Math.min(100, (count / Math.max(max, 1)) * 100);
  const trees = Math.round(pct / 12);
  return "🌲".repeat(trees) + "░".repeat(Math.max(0, 8 - trees));
};

const campusColors: [string, string][] = [
  ["#166534", "#15803d"],
  ["#0369a1", "#0284c7"],
  ["#7c3aed", "#6d28d9"],
  ["#0f766e", "#0d9488"],
  ["#b45309", "#d97706"],
];

export const SchoolGreeningGame = () => {
  const { session } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading: gpLoading, refresh } = useGameGP(session);

  const [schools, setSchools] = useState<SchoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"leaderboard" | "campus">("leaderboard");

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadSchools();
    }, [refresh]),
  );

  const loadSchools = async () => {
    setLoading(true);
    try {
      const data = await fetchPublicLeaderboard();
      const schoolRows = (data.top_schools || []).map((s, i) => ({ ...s, rank: i + 1 }));
      setSchools(schoolRows);
    } catch {
      // Show demo data offline
      setSchools([
        { sponsor_id: 1, display_name: "Greenfield Academy",   entity_category: "school", monthly_trees: 120, all_time_trees: 1250, achievement_level: "Forest Builder", rank: 1 },
        { sponsor_id: 2, display_name: "Unity Secondary School", entity_category: "school", monthly_trees: 88,  all_time_trees: 980,  achievement_level: "Green Supporter", rank: 2 },
        { sponsor_id: 3, display_name: "Bright Future Academy", entity_category: "school", monthly_trees: 74, all_time_trees: 870, achievement_level: "Green Supporter", rank: 3 },
        { sponsor_id: 4, display_name: "Hope High School",     entity_category: "school", monthly_trees: 61,  all_time_trees: 640,  achievement_level: "Seed Supporter", rank: 4 },
        { sponsor_id: 5, display_name: "Sunshine College",     entity_category: "school", monthly_trees: 48,  all_time_trees: 520,  achievement_level: "Seed Supporter", rank: 5 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const maxTrees = Math.max(...schools.map((s) => s.all_time_trees), 1);
  const selected = selectedIdx !== null ? schools[selectedIdx] : null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={["#312e81", "#3730a3", "#4338ca"]} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>🏫 School Challenge</Text>
          <View style={styles.gpChip}>
            <Text style={styles.gpText}>🌿 {gpLoading ? "—" : gpBalance}</Text>
          </View>
        </View>
        <Text style={styles.headerSub}>Compete to make your school the greenest campus</Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(["leaderboard", "campus"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setViewMode(tab)}
              style={[styles.tab, viewMode === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, viewMode === tab && styles.tabTextActive]}>
                {tab === "leaderboard" ? "🏆 Leaderboard" : "🌳 Campus View"}
              </Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4338ca" />
          <Text style={styles.loadingText}>Loading schools…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {viewMode === "leaderboard" ? (
            <>
              {schools.map((school, i) => (
                <Pressable
                  key={school.sponsor_id}
                  onPress={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  style={({ pressed }) => [styles.schoolCard, pressed && styles.pressed, selectedIdx === i && styles.schoolCardSelected]}
                >
                  <View style={styles.rankWrap}>
                    <Text style={styles.rank}>{i < 3 ? MEDALS[i] : `#${school.rank}`}</Text>
                  </View>
                  <View style={styles.schoolInfo}>
                    <Text style={styles.schoolName}>{school.display_name}</Text>
                    <Text style={styles.treeBar}>{treeBar(school.all_time_trees, maxTrees)}</Text>
                    <Text style={styles.treeCount}>{school.all_time_trees.toLocaleString()} trees all time · {school.monthly_trees} this month</Text>
                  </View>
                  <View style={styles.badgeWrap}>
                    <Text style={styles.badge}>{school.achievement_level}</Text>
                  </View>
                </Pressable>
              ))}

              {selected && (
                <View style={styles.campusPreview}>
                  <LinearGradient colors={campusColors[selectedIdx! % campusColors.length]} style={styles.campusGrad}>
                    <Text style={styles.campusTitle}>{selected.display_name}</Text>
                    <View style={styles.campusStats}>
                      <View style={styles.campusStat}><Text style={styles.campusStatVal}>{selected.all_time_trees}</Text><Text style={styles.campusStatLbl}>Total Trees</Text></View>
                      <View style={styles.campusStat}><Text style={styles.campusStatVal}>{selected.monthly_trees}</Text><Text style={styles.campusStatLbl}>This Month</Text></View>
                      <View style={styles.campusStat}><Text style={styles.campusStatVal}>#{selected.rank}</Text><Text style={styles.campusStatLbl}>Rank</Text></View>
                    </View>
                    <View style={styles.campusScene}>
                      {Array.from({ length: Math.min(20, Math.ceil(selected.all_time_trees / 60)) }).map((_, i) => (
                        <Text key={i} style={styles.campusTree}>🌲</Text>
                      ))}
                    </View>
                    <Pressable
                      onPress={() => Alert.alert("Support School", "Sponsor trees on any project and your contribution counts toward your school's greening challenge ranking.")}
                      style={({ pressed }) => [styles.supportBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.supportBtnText}>🌱 Support This School</Text>
                    </Pressable>
                  </LinearGradient>
                </View>
              )}

              {schools.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>🏫</Text>
                  <Text style={styles.emptyText}>No schools on the leaderboard yet. Be the first to sponsor a school's greening!</Text>
                </View>
              )}
            </>
          ) : (
            /* Campus view — visual grid of all competing schools */
            <View style={styles.campusGrid}>
              {schools.map((school, i) => (
                <Pressable
                  key={school.sponsor_id}
                  onPress={() => { setSelectedIdx(i); setViewMode("leaderboard"); }}
                  style={({ pressed }) => [styles.campusCard, pressed && styles.pressed]}
                >
                  <LinearGradient colors={campusColors[i % campusColors.length]} style={styles.campusCardGrad}>
                    <Text style={styles.campusCardRank}>{i < 3 ? MEDALS[i] : `#${school.rank}`}</Text>
                    <View style={styles.campusCardTrees}>
                      {Array.from({ length: Math.min(9, Math.ceil(school.all_time_trees / 140)) }).map((_, j) => (
                        <Text key={j} style={styles.miniTree}>🌲</Text>
                      ))}
                    </View>
                    <Text style={styles.campusCardName} numberOfLines={2}>{school.display_name}</Text>
                    <Text style={styles.campusCardCount}>{school.all_time_trees} 🌳</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={16} color="#4338ca" />
            <Text style={styles.infoText}>
              Sponsor trees to boost your school's ranking. Every tree counts toward the weekly competition.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef2ff" },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "900", color: "#fff" },
  gpChip: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  gpText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 12 },
  tabs: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 3, gap: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  tabText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  tabTextActive: { color: "#fff", fontWeight: "900" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: "#4338ca" },
  scroll: { padding: 14, gap: 10 },
  schoolCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 14,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, gap: 12,
  },
  schoolCardSelected: { borderWidth: 2, borderColor: "#4338ca" },
  rankWrap: { width: 36, alignItems: "center" },
  rank: { fontSize: 22 },
  schoolInfo: { flex: 1 },
  schoolName: { fontSize: 14, fontWeight: "800", color: "#1a3328", marginBottom: 3 },
  treeBar: { fontSize: 12, letterSpacing: 0, marginBottom: 3 },
  treeCount: { fontSize: 11, color: "#35564a" },
  badgeWrap: { backgroundColor: "#ede9fe", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badge: { fontSize: 10, fontWeight: "800", color: "#4338ca" },
  campusPreview: { borderRadius: 16, overflow: "hidden", elevation: 4, marginTop: 4 },
  campusGrad: { padding: 20 },
  campusTitle: { fontSize: 18, fontWeight: "900", color: "#fff", marginBottom: 12 },
  campusStats: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  campusStat: { alignItems: "center" },
  campusStatVal: { fontSize: 20, fontWeight: "900", color: "#fff" },
  campusStatLbl: { fontSize: 10, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  campusScene: { flexDirection: "row", flexWrap: "wrap", gap: 2, marginBottom: 16 },
  campusTree: { fontSize: 20 },
  supportBtn: { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  supportBtnText: { fontSize: 14, fontWeight: "900", color: "#fff" },
  emptyState: { alignItems: "center", gap: 12, padding: 32 },
  emptyEmoji: { fontSize: 56 },
  emptyText: { fontSize: 14, color: "#4338ca", textAlign: "center", lineHeight: 22 },
  campusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  campusCard: { width: "47%", borderRadius: 16, overflow: "hidden", elevation: 3 },
  campusCardGrad: { padding: 14, minHeight: 150, justifyContent: "space-between" },
  campusCardRank: { fontSize: 22 },
  campusCardTrees: { flexDirection: "row", flexWrap: "wrap", gap: 1 },
  miniTree: { fontSize: 16 },
  campusCardName: { fontSize: 12, fontWeight: "800", color: "#fff", marginTop: 6 },
  campusCardCount: { fontSize: 13, fontWeight: "900", color: "rgba(255,255,255,0.9)" },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(67,56,202,0.08)",
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(67,56,202,0.15)", marginTop: 4,
  },
  infoText: { flex: 1, fontSize: 12, color: "#312e81", lineHeight: 18 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
