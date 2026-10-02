import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BrandMark } from "../../components/BrandMark";
import { StatusChip } from "../../components/StatusChip";
import { APP_NAME } from "../../config/env";
import { colors, radii, spacing } from "../../theme/tokens";
import type { AuthRoute, RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AuthRouteSelect">;

type RouteConfig = {
  route: AuthRoute;
  title: string;
  badge: string;
  audience: string;
  blurb: string;
  cta: string;
  icon: keyof typeof Ionicons.glyphMap;
  highlights: string[];
  gradient: readonly [string, string];
  cardTone: "dark" | "light";
};

const ROUTES: RouteConfig[] = [
  {
    route: "sponsor",
    title: "Sponsor Trees",
    badge: "Public route",
    audience: "For individuals and organizations funding verified tree projects.",
    blurb: "Create a sponsor account, choose any public project, pay online, then follow photo, map, and field updates.",
    cta: "Continue as sponsor",
    icon: "leaf-outline",
    highlights: ["Sponsor online", "Live tree updates", "Impact tracking"],
    gradient: ["#ffffff", "#f7faf7"],
    cardTone: "light",
  },
  {
    route: "field",
    title: "Perform Field Work",
    badge: "Partner route",
    audience: "For verified agents, supervisors, and organization partners.",
    blurb: "Use the login already issued in LandCheck Work to capture field data, submit evidence, and complete assigned tasks.",
    cta: "Continue to field login",
    icon: "compass-outline",
    highlights: ["Assigned tasks only", "Organization login", "Field evidence capture"],
    // Dark + amber, not soft green/white like sponsor - field work should read as fast and
    // operational, not trust-and-checkout.
    gradient: ["#16211a", "#0f1712"],
    cardTone: "dark",
  },
];

export const AuthRouteSelectScreen = ({ navigation }: Props) => {
  return (
    <LinearGradient colors={["#eef8ef", "#d8edd8", "#f7fbf7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroGlowOne} />
            <View style={styles.heroGlowTwo} />
            <View style={styles.heroRow}>
              <View style={styles.brandTile}>
                <BrandMark size={64} />
              </View>
              <View style={styles.heroCopy}>
                <StatusChip label="LC Green Mobile" tone="online" />
                <Text style={styles.title}>{APP_NAME}</Text>
                <Text style={styles.subtitle}>Choose how you want to enter the app. Each route opens its own secure login flow.</Text>
              </View>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressChip}>
                <Text style={styles.progressChipText}>1. Choose route</Text>
              </View>
              <View style={styles.progressChip}>
                <Text style={styles.progressChipText}>2. Sign in</Text>
              </View>
              <View style={styles.progressChip}>
                <Text style={styles.progressChipText}>3. Start</Text>
              </View>
            </View>
          </View>

          {ROUTES.map((item) => {
            const darkCard = item.cardTone === "dark";
            const tagline = item.route === "sponsor" 
              ? "Fund verified tree restoration & track live updates."
              : "Capture GPS coordinates, submit evidence & sync offline.";
            return (
              <Pressable
                key={item.route}
                onPress={() => navigation.navigate("Login", { authRoute: item.route })}
                style={({ pressed }) => [styles.routePressable, pressed && styles.routePressed]}
              >
                <LinearGradient colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.routeCard, darkCard ? styles.routeCardDark : styles.routeCardLight]}>
                  <View style={styles.cardRow}>
                    <View style={[styles.routeIconWrap, darkCard ? styles.routeIconWrapDark : styles.routeIconWrapLight]}>
                      <Ionicons name={item.icon} size={22} color={darkCard ? colors.warning : "#0c3b20"} />
                    </View>
                    <View style={styles.cardContent}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.routeTitle, darkCard && styles.routeTitleDark]}>{item.title}</Text>
                        <View style={[styles.badge, darkCard ? styles.badgeDark : styles.badgeLight]}>
                          <Text style={[styles.badgeText, darkCard ? styles.badgeTextDark : styles.badgeTextLight]}>{item.badge}</Text>
                        </View>
                      </View>
                      <Text style={[styles.routeTagline, darkCard && styles.routeTaglineDark]}>{tagline}</Text>
                    </View>
                    <View style={[styles.arrowBubble, darkCard ? styles.arrowBubbleDark : styles.arrowBubbleLight]}>
                      <Ionicons name="arrow-forward" size={18} color={darkCard ? "#071d11" : "#ffffff"} />
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Before you continue</Text>
            <Text style={styles.noteText}>
              Sponsor users create their own public sponsor account. Field users do not sign up here and should use credentials already issued by
              their organization.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  heroCard: {
    position: "relative",
    overflow: "hidden",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(16,91,44,0.08)",
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroGlowOne: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(42,168,82,0.06)",
    top: -70,
    right: -40,
  },
  heroGlowTwo: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(163,240,176,0.18)",
    bottom: -40,
    left: -20,
  },
  heroRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  brandTile: {
    width: 82,
    height: 82,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(16,91,44,0.10)",
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  progressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  progressChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(30,138,66,0.12)",
  },
  progressChipText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  routePressable: {
    borderRadius: radii.xl,
  },
  routePressed: {
    opacity: 0.95,
  },
  routeCard: {
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
  },
  routeCardDark: {
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "rgba(9, 42, 22, 0.22)",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  routeCardLight: {
    borderColor: "rgba(22,103,58,0.10)",
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  routeIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  routeIconWrapDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  routeIconWrapLight: {
    backgroundColor: "rgba(42,168,82,0.08)",
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeTitle: {
    color: "#0c2b1a",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  routeTitleDark: {
    color: colors.inverseText,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeDark: {
    backgroundColor: "rgba(217, 119, 6, 0.16)",
    borderColor: "rgba(217, 119, 6, 0.32)",
  },
  badgeLight: {
    backgroundColor: "rgba(42, 168, 82, 0.08)",
    borderColor: "rgba(42, 168, 82, 0.18)",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  badgeTextDark: {
    color: "#f7b955",
  },
  badgeTextLight: {
    color: "#0c3b20",
  },
  routeTagline: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  routeTaglineDark: {
    color: "rgba(255,255,255,0.78)",
  },
  arrowBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowBubbleDark: {
    backgroundColor: colors.warning,
  },
  arrowBubbleLight: {
    backgroundColor: "#0c3b20",
  },
  noteCard: {
    gap: 8,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteTitle: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  noteText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
