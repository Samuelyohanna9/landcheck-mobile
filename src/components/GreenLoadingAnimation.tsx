import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, Text } from "react-native";
import { SvgXml } from "react-native-svg";
import { colors, radii, spacing } from "../theme/tokens";

// Static art lifted from LandCheck_Green_Loading_Animation.svg (the same asset used on the web
// and Android apps) - the <style>/@keyframes block from that file is stripped here since
// react-native-svg doesn't run CSS animations, and the wordmark/status text are dropped in favor
// of real React Native <Text> below (reliable native font rendering instead of SVG text). The
// life/motion comes from wrapping this static art in Animated.View below.
const GREEN_MARK_XML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 300">
  <defs>
    <linearGradient id="tileGreen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#43A53D"/>
      <stop offset=".58" stop-color="#11752F"/>
      <stop offset="1" stop-color="#064E2B"/>
    </linearGradient>
    <linearGradient id="leafGreen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E3FF68"/>
      <stop offset=".52" stop-color="#A8E84D"/>
      <stop offset="1" stop-color="#4AAE37"/>
    </linearGradient>
    <radialGradient id="haloGreen">
      <stop offset="0" stop-color="#A8E84D" stop-opacity=".22"/>
      <stop offset="1" stop-color="#A8E84D" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <circle cx="210" cy="166" r="116" fill="url(#haloGreen)"/>

  <g>
    <rect x="118" y="72" width="184" height="184" rx="46" fill="url(#tileGreen)"/>
    <rect x="120" y="74" width="180" height="180" rx="44" fill="none" stroke="#7BD549" stroke-opacity=".3" stroke-width="2"/>
    <path d="M158 144 L158 211 Q158 226 174 226 L246 226 Q258 226 258 213 L258 193 L230 211 L190 211 L190 144 Q190 132 178 132 L170 132 Q158 132 158 144Z" fill="#F8FFF2"/>
    <path d="M197 174 L216 193 L270 126" fill="none" stroke="#052E1A" stroke-width="20" stroke-linecap="square" stroke-linejoin="miter" opacity=".92"/>
    <g>
      <path d="M205 178 C212 126 251 93 288 84 C283 119 266 150 221 187 C236 154 255 126 278 99 C246 119 224 143 205 178Z" fill="url(#leafGreen)" stroke="#DFFF72" stroke-opacity=".55" stroke-width="1.3"/>
      <path d="M207 181 C228 147 252 118 279 96" fill="none" stroke="#F0FF9A" stroke-width="2.6" stroke-linecap="round"/>
    </g>
  </g>
</svg>
`.trim();

type Size = "small" | "medium" | "large";

type GreenLoadingAnimationProps = {
  label?: string;
  size?: Size;
};

const ICON_SIZE: Record<Size, number> = { small: 92, medium: 140, large: 200 };

export const GreenLoadingAnimation = ({ label, size = "medium" }: GreenLoadingAnimationProps) => {
  const iconSize = ICON_SIZE[size];
  const trackWidth = iconSize * 1.7;

  const breathe = useRef(new Animated.Value(0)).current;
  const verify = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const status = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(verify, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(verify, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(900),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(progress, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(status, { toValue: 1, duration: 950, useNativeDriver: true }),
          Animated.timing(status, { toValue: 0.55, duration: 950, useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [breathe, verify, progress, status]);

  const iconScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  const iconTranslateY = breathe.interpolate({ inputRange: [0, 1], outputRange: [3, -4] });
  const verifyScale = verify.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.1] });
  const verifyOpacity = verify.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.25, 0] });
  const progressX = progress.interpolate({ inputRange: [0, 1], outputRange: [-trackWidth * 0.42, trackWidth * 0.42] });

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconStage, { width: iconSize, height: iconSize * (300 / 420) }]}>
        <Animated.View style={{ transform: [{ scale: iconScale }, { translateY: iconTranslateY }] }}>
          <SvgXml xml={GREEN_MARK_XML} width={iconSize} height={iconSize * (300 / 420)} />
        </Animated.View>
        <View pointerEvents="none" style={[styles.verifyDot, { right: iconSize * 0.06, top: iconSize * 0.5 }]}>
          <Animated.View
            style={[
              styles.verifyRing,
              { transform: [{ scale: verifyScale }], opacity: verifyOpacity },
            ]}
          />
          <View style={styles.verifyCore} />
        </View>
      </View>

      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.track, { width: trackWidth }]}>
        <Animated.View style={[styles.fill, { transform: [{ translateX: progressX }] }]} />
      </View>
      <Animated.Text style={[styles.status, { opacity: status }]}>
        Loading environmental impact workspace…
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  iconStage: {
    alignItems: "center",
    justifyContent: "center",
  },
  verifyDot: {
    position: "absolute",
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyRing: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#A8E84D",
  },
  verifyCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#A8E84D",
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  track: {
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: "rgba(22, 103, 58, 0.16)",
    overflow: "hidden",
  },
  fill: {
    width: "42%",
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  status: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
});
