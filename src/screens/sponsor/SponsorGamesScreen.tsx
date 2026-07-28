import { useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useGameGP } from "../../hooks/useGameGP";
import type { SponsorAppStackParamList } from "../../types/navigation";

type Nav = NativeStackNavigationProp<SponsorAppStackParamList>;

type GameCard = {
  route: keyof SponsorAppStackParamList;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: [string, string];
  tag: string;
  tagColor: string;
  earn?: boolean;
};

const GAMES: GameCard[] = [
  {
    route: "GameDailySpin",
    title: "Daily Spin",
    subtitle: "Spin the wheel — win up to 200 GP free every day",
    emoji: "🎰",
    gradient: ["#f59e0b", "#d97706"],
    tag: "FREE DAILY",
    tagColor: "#92400e",
    earn: true,
  },
  {
    route: "GameForestQuest",
    title: "Follow Us",
    subtitle: "Follow LandCheck on Facebook and Instagram",
    emoji: "📲",
    gradient: ["#2563eb", "#166534"],
    tag: "20 GP",
    tagColor: "#1e3a8a",
    earn: true,
  },
  {
    route: "GameGrowTree",
    title: "Grow My Tree",
    subtitle: "Raise a living tree with richer visuals, care rituals, and growth stages",
    emoji: "🌱",
    gradient: ["#2aa852", "#166534"],
    tag: "FAVOURITE",
    tagColor: "#14532d",
    earn: false,
  },
  {
    route: "GameSaveForest",
    title: "Save the Forest",
    subtitle: "Tap threats away — fire, drought, and illegal axes",
    emoji: "🛡️",
    gradient: ["#ef4444", "#b91c1c"],
    tag: "EARN GP",
    tagColor: "#7f1d1d",
    earn: true,
  },
  {
    route: "GameForestBuilder",
    title: "Forest Builder",
    subtitle: "Design a beautiful ecosystem where every placement and milestone uses GP well",
    emoji: "🌳",
    gradient: ["#0ea5e9", "#0369a1"],
    tag: "SPEND GP",
    tagColor: "#0c4a6e",
    earn: false,
  },
  {
    route: "GameWildlife",
    title: "Wildlife Collector",
    subtitle: "Unlock 12 rare animals to inhabit your forest",
    emoji: "🦋",
    gradient: ["#ec4899", "#9d174d"],
    tag: "12 ANIMALS",
    tagColor: "#831843",
    earn: false,
  },
  {
    route: "GameClimateDefender",
    title: "Climate Defender",
    subtitle: "Absorb CO₂ bubbles before they escape to space",
    emoji: "🌍",
    gradient: ["#10b981", "#065f46"],
    tag: "EARN GP",
    tagColor: "#064e3b",
    earn: true,
  },
  {
    route: "GameFruitHarvest",
    title: "Fruit Harvest",
    subtitle: "Swipe fruit smoothly into the right harvest basket in a brighter orchard scene",
    emoji: "🥭",
    gradient: ["#f97316", "#c2410c"],
    tag: "EARN GP",
    tagColor: "#7c2d12",
    earn: true,
  },
  {
    route: "GameSchoolGreening",
    title: "School Challenge",
    subtitle: "Compete to make your school the greenest campus",
    emoji: "🏫",
    gradient: ["#6366f1", "#3730a3"],
    tag: "COMPETE",
    tagColor: "#312e81",
    earn: false,
  },
];

export const SponsorGamesScreen = () => {
  const { session } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh } = useGameGP(session);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const featured = GAMES[0];
  const rest = GAMES.slice(1);

  return (
    <View style={styles.root}>
      <SystemBars style="light" />
      <LinearGradient colors={["#0d2818", "#0f3d20", "#155e2f"]} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>🌿 Grove</Text>
            <Text style={styles.headerSub}>Play. Earn. Grow your impact.</Text>
          </View>
          <View style={styles.gpBadge}>
            <Text style={styles.gpIcon}>🌿</Text>
            <Text style={styles.gpValue}>{loading ? "—" : gpBalance.toLocaleString()}</Text>
            <Text style={styles.gpLabel}> GP</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Featured card */}
        <Text style={styles.sectionLabel}>TODAY'S HIGHLIGHT</Text>
        <Pressable
          onPress={() => navigation.navigate(featured.route as any)}
          style={({ pressed }) => [styles.featuredCard, pressed && styles.pressed]}
        >
          <LinearGradient colors={featured.gradient} style={styles.featuredGradient}>
            <View style={styles.featuredTag}>
              <Text style={[styles.tagText, { color: featured.tagColor }]}>{featured.tag}</Text>
            </View>
            <Text style={styles.featuredEmoji}>{featured.emoji}</Text>
            <Text style={styles.featuredTitle}>{featured.title}</Text>
            <Text style={styles.featuredSubtitle}>{featured.subtitle}</Text>
            <View style={styles.featuredCta}>
              <Text style={styles.featuredCtaText}>Play Now</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Game grid */}
        <Text style={styles.sectionLabel}>ALL GAMES</Text>
        <View style={styles.grid}>
          {rest.map((game) => (
            <Pressable
              key={game.route}
              onPress={() => navigation.navigate(game.route as any)}
              style={({ pressed }) => [styles.gameCard, pressed && styles.pressed]}
            >
              <LinearGradient colors={game.gradient} style={styles.gameCardGradient}>
                <View style={[styles.gameTag, { backgroundColor: "rgba(0,0,0,0.25)" }]}>
                  <Text style={styles.gameTagText}>{game.tag}</Text>
                </View>
                <Text style={styles.gameEmoji}>{game.emoji}</Text>
                <Text style={styles.gameTitle}>{game.title}</Text>
                <Text style={styles.gameSubtitle} numberOfLines={2}>{game.subtitle}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        {/* GP info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color="#2aa852" />
          <Text style={styles.infoText}>
            Sponsor real trees to earn GP · Use GP in games to grow your virtual world
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f6f1" },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  gpBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  gpIcon: { fontSize: 14 },
  gpValue: { fontSize: 16, fontWeight: "900", color: "#fff", marginLeft: 4 },
  gpLabel: { fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionLabel: {
    fontSize: 10, fontWeight: "800", color: "#35564a", letterSpacing: 1.5,
    marginBottom: 10, marginTop: 4,
  },
  featuredCard: { borderRadius: 20, overflow: "hidden", marginBottom: 20, elevation: 4,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  featuredGradient: { padding: 24 },
  featuredTag: {
    alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12,
  },
  tagText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  featuredEmoji: { fontSize: 52, marginBottom: 8 },
  featuredTitle: { fontSize: 24, fontWeight: "900", color: "#fff", marginBottom: 6 },
  featuredSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 19, marginBottom: 16 },
  featuredCta: { flexDirection: "row", alignItems: "center", gap: 6 },
  featuredCtaText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  gameCard: {
    width: "47.5%", borderRadius: 16, overflow: "hidden", elevation: 3,
    shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  gameCardGradient: { padding: 16, minHeight: 150 },
  gameTag: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 10 },
  gameTagText: { fontSize: 9, fontWeight: "800", color: "rgba(255,255,255,0.9)", letterSpacing: 0.8 },
  gameEmoji: { fontSize: 34, marginBottom: 6 },
  gameTitle: { fontSize: 14, fontWeight: "900", color: "#fff", marginBottom: 4 },
  gameSubtitle: { fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 16 },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(42,168,82,0.1)", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "rgba(42,168,82,0.2)",
  },
  infoText: { flex: 1, fontSize: 12, color: "#35564a", lineHeight: 18 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
