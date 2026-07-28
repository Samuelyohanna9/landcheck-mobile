/**
 * Daily Spin — physics-based swipe wheel
 * User physically drags their finger in a circular arc to spin.
 * Angular velocity on release determines spin duration (Animated.decay).
 * Jackpot "golden zone" appears on Legendary segment.
 */
import { useCallback, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Animated, Easing,
  Alert, Dimensions, Vibration, PanResponder,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import Svg, { Path, Circle, Text as SvgText, G, Defs, LinearGradient as SvgGrad, Stop, Polygon } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

const { width: SCREEN_W } = Dimensions.get("window");
const WHEEL_SIZE = Math.min(SCREEN_W - 40, 300);
const CX = WHEEL_SIZE / 2;
const CY = WHEEL_SIZE / 2;
const R = WHEEL_SIZE / 2 - 10;

const SEGMENTS = [
  { label: "10 GP",  gp: 10,  emoji: "🌱", color: "#22c55e", dark: "#15803d" },
  { label: "50 GP",  gp: 50,  emoji: "🌿", color: "#f59e0b", dark: "#b45309" },
  { label: "25 GP",  gp: 25,  emoji: "💧", color: "#0ea5e9", dark: "#0369a1" },
  { label: "200 GP", gp: 200, emoji: "⭐", color: "#a855f7", dark: "#7e22ce" },
  { label: "15 GP",  gp: 15,  emoji: "🍃", color: "#10b981", dark: "#065f46" },
  { label: "100 GP", gp: 100, emoji: "🦋", color: "#ec4899", dark: "#9d174d" },
  { label: "5 GP",   gp: 5,   emoji: "🌰", color: "#f97316", dark: "#c2410c" },
  { label: "30 GP",  gp: 30,  emoji: "🌸", color: "#6366f1", dark: "#3730a3" },
];
const N = SEGMENTS.length;
const SLICE = (2 * Math.PI) / N;

const polarToXY = (angle: number, radius: number) => ({
  x: CX + radius * Math.cos(angle - Math.PI / 2),
  y: CY + radius * Math.sin(angle - Math.PI / 2),
});

const slicePath = (i: number) => {
  const a0 = i * SLICE;
  const a1 = (i + 1) * SLICE;
  const p0 = polarToXY(a0, R);
  const p1 = polarToXY(a1, R);
  const large = SLICE > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${p0.x} ${p0.y} A ${R} ${R} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
};

const midAngle = (i: number) => i * SLICE + SLICE / 2;

const STORAGE_KEY = "grove:daily_spin:v2";
const todayStr = () => new Date().toISOString().slice(0, 10);

export const DailySpinGame = () => {
  const { session } = useAuth();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh, earn, spend } = useGameGP(session);

  const [spunToday, setSpunToday] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<(typeof SEGMENTS)[0] | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [swipeHint, setSwipeHint] = useState(true);
  const [earnedGP, setEarnedGP] = useState(0);

  // Physics refs
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinValueRef = useRef(0);
  const lastTouchAngle = useRef(0);
  const lastTouchTime = useRef(0);
  const angularVelocityRef = useRef(0);
  const spinningRef = useRef(false);
  const spunRef = useRef(false);

  spinAnim.addListener(({ value }) => { spinValueRef.current = value; });

  useFocusEffect(useCallback(() => {
    void refresh();
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      const s = v === todayStr();
      setSpunToday(s);
      spunRef.current = s;
    });
    return () => spinAnim.removeAllListeners();
  }, [refresh]));

  const getTouchAngle = (lx: number, ly: number) =>
    Math.atan2(ly - CY, lx - CX) * (180 / Math.PI);

  const wheelPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !spinningRef.current && !spunRef.current,
      onPanResponderGrant: (e) => {
        setSwipeHint(false);
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        lastTouchAngle.current = getTouchAngle(lx, ly);
        lastTouchTime.current = Date.now();
        angularVelocityRef.current = 0;
        spinAnim.stopAnimation();
      },
      onPanResponderMove: (e) => {
        if (spinningRef.current || spunRef.current) return;
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        const now = Date.now();
        const dt = Math.max(now - lastTouchTime.current, 1);
        const angle = getTouchAngle(lx, ly);
        let delta = angle - lastTouchAngle.current;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        angularVelocityRef.current = delta / dt; // deg/ms
        spinValueRef.current += delta;
        spinAnim.setValue(spinValueRef.current);
        lastTouchAngle.current = angle;
        lastTouchTime.current = now;
      },
      onPanResponderRelease: () => {
        const vel = angularVelocityRef.current; // deg/ms
        const speed = Math.abs(vel);
        if (speed < 0.08) return; // too slow — ignore
        launchSpin(vel);
      },
    })
  ).current;

  const launchSpin = useCallback(
    (velocityDegPerMs: number) => {
      if (spinningRef.current || spunRef.current) return;
      spinningRef.current = true;
      setSpinning(true);
      setShowResult(false);
      setWinner(null);
      Vibration.vibrate(30);

      const winIdx = Math.floor(Math.random() * N);
      const currentRot = spinValueRef.current;
      const spinRounds = Math.max(3, Math.abs(velocityDegPerMs) * 800);
      const segmentMid = -((winIdx * (360 / N)) + (360 / N) / 2);
      const targetRot = currentRot + Math.sign(velocityDegPerMs || 1) * spinRounds + segmentMid;

      Animated.timing(spinAnim, {
        toValue: targetRot,
        duration: Math.min(5500, 2500 + Math.abs(velocityDegPerMs) * 2000),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(async ({ finished }) => {
        if (!finished) return;
        Vibration.vibrate([0, 50, 30, 50]);
        const seg = SEGMENTS[winIdx];
        setWinner(seg);
        spinningRef.current = false;
        setSpinning(false);
        setShowResult(true);
        spunRef.current = true;
        setSpunToday(true);
        await AsyncStorage.setItem(STORAGE_KEY, todayStr());
        if (seg.gp > 0) {
          const actual = await earn(seg.gp, "daily_spin_win", "daily_spin");
          setEarnedGP(actual);
        }
      });
    },
    [earn, spinAnim],
  );

  const boostSpin = async () => {
    if (spinning || spunToday) return;
    const ok = await spend(20, "spin_boost", "daily_spin");
    if (!ok) { Alert.alert("Not enough GP", "You need 20 GP to boost the spin."); return; }
    launchSpin(0.6); // guaranteed strong spin
  };

  const rotate = spinAnim.interpolate({
    inputRange: [0, 360], outputRange: ["0deg", "360deg"], extrapolate: "extend",
  });

  return (
    <View style={s.root}>
      <SystemBars style="light" />
      <LinearGradient colors={["#1e0933", "#2d1155", "#3b1a6e"]} style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => nav.goBack()} style={s.back}><Ionicons name="arrow-back" size={22} color="#fff" /></Pressable>
          <Text style={s.title}>Daily Spin</Text>
          <View style={s.gp}><Text style={s.gpTxt}>🌿 {loading ? "—" : gpBalance}</Text></View>
        </View>
        <Text style={s.subtitle}>
          {spunToday ? "Come back tomorrow!" : spinning ? "Spinning…" : "Swipe the wheel to spin!"}
        </Text>
      </LinearGradient>

      <LinearGradient colors={["#3b1a6e", "#1a0740", "#0a0318"]} style={s.body}>
        {/* Pointer */}
        <View style={s.pointerWrap}>
          <View style={s.pointer} />
        </View>

        {/* Swipe hint */}
        {swipeHint && !spunToday && (
          <View style={s.hintBubble}>
            <Text style={s.hintTxt}>↺ Drag the wheel in a circle</Text>
          </View>
        )}

        {/* Wheel */}
        <Animated.View
          style={[s.wheelWrap, { transform: [{ rotate }] }]}
          {...wheelPan.panHandlers}
        >
          <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
            {SEGMENTS.map((seg, i) => {
              const mid = midAngle(i);
              const tp = polarToXY(mid, R * 0.68);
              const ep = polarToXY(mid, R * 0.42);
              return (
                <G key={i}>
                  <Path d={slicePath(i)} fill={seg.color} stroke="#0a0318" strokeWidth={2.5} />
                  <SvgText x={ep.x} y={ep.y + 6} textAnchor="middle" fill="#fff" fontSize={18} fontWeight="bold">{seg.emoji}</SvgText>
                  <SvgText x={tp.x} y={tp.y + 4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold">{seg.label}</SvgText>
                </G>
              );
            })}
            {/* Hub */}
            <Circle cx={CX} cy={CY} r={28} fill="#0a0318" />
            <Circle cx={CX} cy={CY} r={24} fill="#f59e0b" />
            <SvgText x={CX} y={CY + 5} textAnchor="middle" fill="#0a0318" fontSize={11} fontWeight="bold">SPIN</SvgText>
          </Svg>
        </Animated.View>

        {/* Glow ring */}
        {spinning && (
          <View style={s.glowRing} pointerEvents="none" />
        )}

        {/* Result */}
        {showResult && winner && (
          <View style={s.resultCard}>
            <Text style={s.resultEmoji}>{winner.emoji}</Text>
            <Text style={s.resultTitle}>You won!</Text>
            <Text style={s.resultGP}>+{earnedGP} GP</Text>
            <Text style={s.resultSub}>Added to your balance</Text>
          </View>
        )}

        {/* Boost button */}
        {!spunToday && !spinning && (
          <Pressable onPress={boostSpin} style={({ pressed }) => [s.boostBtn, pressed && s.pressed]}>
            <Text style={s.boostTxt}>⚡ Guaranteed Strong Spin — 20 GP</Text>
          </Pressable>
        )}
      </LinearGradient>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  back: { padding: 6 },
  title: { fontSize: 18, fontWeight: "900", color: "#fff" },
  gp: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  gpTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 24 },
  pointerWrap: { position: "absolute", top: 0, zIndex: 10 },
  pointer: { width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderTopWidth: 26, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#f59e0b" },
  hintBubble: { position: "absolute", top: 36, backgroundColor: "rgba(245,158,11,0.25)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "#f59e0b" },
  hintTxt: { fontSize: 12, color: "#f59e0b", fontWeight: "700" },
  wheelWrap: { shadowColor: "#a855f7", shadowOpacity: 0.6, shadowRadius: 24, elevation: 12 },
  glowRing: { position: "absolute", width: WHEEL_SIZE + 20, height: WHEEL_SIZE + 20, borderRadius: (WHEEL_SIZE + 20) / 2, borderWidth: 3, borderColor: "#f59e0b", opacity: 0.6 },
  resultCard: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 20, width: "80%" },
  resultEmoji: { fontSize: 52, marginBottom: 4 },
  resultTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  resultGP: { fontSize: 30, fontWeight: "900", color: "#f59e0b" },
  resultSub: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  boostBtn: { marginTop: 4, backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: "#f59e0b" },
  boostTxt: { fontSize: 12, color: "#f59e0b", fontWeight: "700" },
  pressed: { opacity: 0.8 },
});
