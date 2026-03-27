import type { ReactNode } from "react";
import type { RefreshControlProps, StyleProp, ViewStyle } from "react-native";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/tokens";
import { BotanicalSilhouette } from "./BotanicalSilhouette";
import { LeafDecor } from "./LeafDecor";

type ScreenSurfaceProps = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  refreshControlProps?: Partial<RefreshControlProps>;
};

export const ScreenSurface = ({
  children,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
  scrollEnabled = true,
  refreshControlProps,
}: ScreenSurfaceProps) => {
  const refreshControl =
    onRefresh !== undefined ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.primary}
        colors={[colors.primary]}
        {...refreshControlProps}
      />
    ) : undefined;

  return (
    <LinearGradient colors={["#eef8f0", "#f9fcf9", "#ddefdf"]} start={{ x: 0.08, y: 0 }} end={{ x: 0.92, y: 1 }} style={styles.gradient}>
      <View style={[styles.glowOrb, styles.glowTopRight]} />
      <View style={[styles.glowOrb, styles.glowMidRight]} />
      <View style={[styles.glowOrb, styles.glowBottomLeft]} />
      <View style={[styles.glowOrb, styles.glowBottomRight]} />
      <View style={styles.hazeBand} />
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />
      <View pointerEvents="none" style={[styles.silhouetteWrap, styles.silhouetteMidRight]}>
        <BotanicalSilhouette color="#1f7e4d" opacity={0.1} />
      </View>
      <View pointerEvents="none" style={[styles.silhouetteWrap, styles.silhouetteMidLeft]}>
        <BotanicalSilhouette color="#7ab86c" opacity={0.09} />
      </View>
      <View pointerEvents="none" style={[styles.silhouetteWrap, styles.silhouetteBottomRight]}>
        <BotanicalSilhouette color="#0f6a45" opacity={0.12} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorTopRight]}>
        <LeafDecor variant="leafyGreen" color="#0a5f42" opacity={0.2} strokeWidth={1.6} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorTopLeft]}>
        <LeafDecor variant="sprout" color="#7cb86d" opacity={0.18} strokeWidth={1.5} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorUpperLeftEdge]}>
        <LeafDecor variant="leaf" color="#2f8f4e" opacity={0.16} strokeWidth={1.5} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorLeftMid]}>
        <LeafDecor variant="leaf" color="#0f6a45" opacity={0.24} strokeWidth={1.8} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorLeftLower]}>
        <LeafDecor variant="leafyGreen" color="#176b4a" opacity={0.18} strokeWidth={1.55} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorMidRight]}>
        <LeafDecor variant="leafyGreen" color="#2e8f58" opacity={0.16} strokeWidth={1.55} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorCenterRightLarge]}>
        <LeafDecor variant="leaf" color="#5da96b" opacity={0.16} strokeWidth={1.45} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorBottomRight]}>
        <LeafDecor variant="sprout" color="#2d8b59" opacity={0.22} strokeWidth={1.7} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorBottomEdge]}>
        <LeafDecor variant="leaf" color="#90c97b" opacity={0.2} strokeWidth={1.5} />
      </View>
      <View pointerEvents="none" style={[styles.decorWrap, styles.decorBottomLeftEdge]}>
        <LeafDecor variant="sprout" color="#7dbd70" opacity={0.18} strokeWidth={1.45} />
      </View>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 116,
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(25, 125, 70, 0.08)",
  },
  blobTop: {
    width: 220,
    height: 220,
    top: -80,
    right: -40,
  },
  blobBottom: {
    width: 180,
    height: 180,
    bottom: 60,
    left: -50,
  },
  glowOrb: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(175, 232, 156, 0.42)",
  },
  glowTopRight: {
    width: 260,
    height: 260,
    top: -95,
    right: -75,
  },
  glowMidRight: {
    width: 170,
    height: 170,
    top: "36%",
    right: -70,
    backgroundColor: "rgba(203, 246, 148, 0.42)",
  },
  glowBottomLeft: {
    width: 150,
    height: 150,
    bottom: 210,
    left: -65,
    backgroundColor: "rgba(150, 216, 118, 0.34)",
  },
  glowBottomRight: {
    width: 190,
    height: 190,
    bottom: 18,
    right: -85,
    backgroundColor: "rgba(127, 196, 144, 0.24)",
  },
  hazeBand: {
    position: "absolute",
    left: -10,
    right: -10,
    top: "46%",
    height: 180,
    backgroundColor: "rgba(255,255,255,0.18)",
    transform: [{ rotate: "-10deg" }],
  },
  decorWrap: {
    position: "absolute",
  },
  silhouetteWrap: {
    position: "absolute",
  },
  silhouetteMidRight: {
    width: 220,
    height: 260,
    right: -56,
    top: "26%",
    transform: [{ rotate: "-12deg" }],
  },
  silhouetteMidLeft: {
    width: 180,
    height: 220,
    left: -54,
    top: "44%",
    transform: [{ rotate: "10deg" }],
  },
  silhouetteBottomRight: {
    width: 200,
    height: 238,
    right: -48,
    bottom: -8,
    transform: [{ rotate: "-8deg" }],
  },
  decorTopRight: {
    width: 210,
    height: 210,
    top: 22,
    right: -32,
    transform: [{ rotate: "-12deg" }],
  },
  decorTopLeft: {
    width: 120,
    height: 120,
    left: -24,
    top: 88,
    transform: [{ rotate: "18deg" }],
  },
  decorUpperLeftEdge: {
    width: 116,
    height: 116,
    left: -28,
    top: 226,
    transform: [{ rotate: "-10deg" }],
  },
  decorLeftMid: {
    width: 180,
    height: 180,
    left: -56,
    bottom: 184,
    transform: [{ rotate: "14deg" }],
  },
  decorLeftLower: {
    width: 142,
    height: 142,
    left: -34,
    bottom: 34,
    transform: [{ rotate: "16deg" }],
  },
  decorMidRight: {
    width: 124,
    height: 124,
    right: -22,
    top: "52%",
    transform: [{ rotate: "-14deg" }],
  },
  decorCenterRightLarge: {
    width: 148,
    height: 148,
    right: -38,
    top: "66%",
    transform: [{ rotate: "-8deg" }],
  },
  decorBottomRight: {
    width: 170,
    height: 170,
    right: -34,
    bottom: 88,
    transform: [{ rotate: "-18deg" }],
  },
  decorBottomEdge: {
    width: 132,
    height: 132,
    left: "54%",
    bottom: -18,
    transform: [{ rotate: "18deg" }],
  },
  decorBottomLeftEdge: {
    width: 112,
    height: 112,
    left: 8,
    bottom: -12,
    transform: [{ rotate: "-12deg" }],
  },
});
