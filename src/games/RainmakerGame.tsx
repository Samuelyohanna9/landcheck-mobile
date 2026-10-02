/**
 * Rainmaker — wave 2: hold-to-charge + individual seedling thirst
 *
 * Gesture rules:
 *   - DRAG the cloud left/right to position it (PanResponder)
 *   - HOLD on the rain button to CHARGE the raindrop (0→100% bar builds over 2s)
 *   - RELEASE to launch — charge level determines splash radius:
 *       < 30%  → tiny drop (hits 1 seedling)
 *       30-70% → normal drop (hits up to 2 adjacent seedlings)
 *       > 70%  → HEAVY drop (hits up to 3 seedlings, +bonus score)
 *   - Each seedling has a THIRST meter (0–100) that drains at 4%/s
 *   - Watering fills thirst. Stage grows at 100%. Wilted (thirst 0) for 5s = seed dies back
 *   - FAIL STATE: if ≥ 3 seedlings die, round ends with penalty
 *
 * GP power-up: "Thunderstorm" (30 GP) — instantly fills ALL thirst meters
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Animated, PanResponder,
  Dimensions, Vibration, Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

const { width: W } = Dimensions.get("window");
const CLOUD_W = 110;
const SEEDLING_COUNT = 6;
const SLOT_W = Math.floor((W - 32) / SEEDLING_COUNT);
const SEEDLING_BASE_Y = 440;
const ROUND_SECS = 50;
const THIRST_DECAY = 4;   // % per second
const WILT_DEATH_SECS = 5;

type SeedStage = 0 | 1 | 2 | 3;
const SEED_EMOJI: Record<SeedStage, string> = { 0: "🌰", 1: "🌱", 2: "🌿", 3: "🌲" };
type Phase = "idle" | "playing" | "done";

type Seedling = {
  stage: SeedStage;
  thirst: number;
  wiltSecs: number;
  dead: boolean;
  waterAnim: Animated.Value;
};

type Drop = { id: string; x: number; radius: number; anim: Animated.Value; opac: Animated.Value };

const makeSeedlings = (): Seedling[] =>
  Array.from({ length: SEEDLING_COUNT }, () => ({
    stage: 0, thirst: 60, wiltSecs: 0, dead: false, waterAnim: new Animated.Value(1),
  }));

export const RainmakerGame = () => {
  const { session } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh, earn, spend } = useGameGP(session);

  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECS);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [seedlings, setSeedlings] = useState<Seedling[]>(makeSeedlings());
  const [earnedGP, setEarnedGP] = useState(0);
  const [charge, setCharge] = useState(0); // 0-100

  const cloudX = useRef(new Animated.Value((W - CLOUD_W) / 2)).current;
  const cloudXRef = useRef((W - CLOUD_W) / 2);
  const seedlingsRef = useRef<Seedling[]>(makeSeedlings());
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const chargeRef = useRef(0);
  const chargeInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const chargeAnim = useRef(new Animated.Value(0)).current;
  const dropIdRef = useRef(0);
  const dropsRef = useRef<Drop[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thirstTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => stopGame();
  }, [refresh]));

  cloudX.addListener(({ value }) => { cloudXRef.current = value; });

  const cloudPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => phaseRef.current === "playing",
    onMoveShouldSetPanResponder: () => phaseRef.current === "playing",
    onPanResponderGrant: () => cloudX.stopAnimation(),
    onPanResponderMove: (_, g) => {
      const nx = Math.max(0, Math.min(W - CLOUD_W, cloudXRef.current + g.dx));
      cloudX.setValue(nx);
      cloudXRef.current = nx;
    },
  })).current;

  const startCharge = () => {
    if (phaseRef.current !== "playing") return;
    chargeRef.current = 0;
    setCharge(0);
    chargeAnim.setValue(0);
    chargeInterval.current = setInterval(() => {
      chargeRef.current = Math.min(100, chargeRef.current + 3);
      setCharge(chargeRef.current);
      chargeAnim.setValue(chargeRef.current);
      if (chargeRef.current >= 100) stopCharge();
    }, 60);
  };

  const stopCharge = () => {
    if (chargeInterval.current) { clearInterval(chargeInterval.current); chargeInterval.current = null; }
  };

  const releaseRain = () => {
    stopCharge();
    const pct = chargeRef.current;
    chargeRef.current = 0;
    setCharge(0);
    chargeAnim.setValue(0);
    if (pct < 5 || phaseRef.current !== "playing") return;

    const cx = cloudXRef.current + CLOUD_W / 2;
    const radius = pct < 30 ? 1 : pct < 70 ? 2 : 3;
    const id = `d${dropIdRef.current++}`;
    const anim = new Animated.Value(SEEDLING_BASE_Y - 160);
    const opac = new Animated.Value(1);

    const drop: Drop = { id, x: cx, radius, anim, opac };
    dropsRef.current = [...dropsRef.current, drop];
    setDrops([...dropsRef.current]);

    Vibration.vibrate(pct > 70 ? [0, 30, 15, 30] : 20);

    Animated.timing(anim, { toValue: SEEDLING_BASE_Y, duration: 400, useNativeDriver: true }).start(() => {
      // Check which seedlings are hit
      const hitIdx = Math.round((cx - 16) / SLOT_W);
      const hits: number[] = [];
      for (let r = 0; r < radius; r++) {
        for (const idx of [hitIdx - r, hitIdx + r]) {
          if (idx >= 0 && idx < SEEDLING_COUNT && !hits.includes(idx)) hits.push(idx);
        }
      }
      let pts = 0;
      const updated = [...seedlingsRef.current];
      hits.forEach((i) => {
        if (updated[i].dead) return;
        const thirstGain = pct < 30 ? 25 : pct < 70 ? 40 : 55;
        updated[i].thirst = Math.min(100, updated[i].thirst + thirstGain);
        updated[i].wiltSecs = 0;
        if (updated[i].thirst >= 100 && updated[i].stage < 3) {
          updated[i].stage = (updated[i].stage + 1) as SeedStage;
          updated[i].thirst = 50;
          pts += pct > 70 ? 20 : 12;
          Animated.sequence([
            Animated.spring(updated[i].waterAnim, { toValue: 1.35, useNativeDriver: true, speed: 60 }),
            Animated.spring(updated[i].waterAnim, { toValue: 1.0, useNativeDriver: true, speed: 30 }),
          ]).start();
        } else {
          pts += pct > 70 ? 8 : 5;
        }
      });
      if (pts > 0) { scoreRef.current += pts; setScore(scoreRef.current); }
      seedlingsRef.current = updated;
      setSeedlings([...updated]);

      Animated.timing(opac, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        dropsRef.current = dropsRef.current.filter((d) => d.id !== id);
        setDrops([...dropsRef.current]);
      });
    });
  };

  const startGame = () => {
    phaseRef.current = "playing";
    scoreRef.current = 0;
    const fresh = makeSeedlings();
    seedlingsRef.current = fresh;
    dropsRef.current = [];
    setScore(0); setTimeLeft(ROUND_SECS); setSeedlings([...fresh]);
    setDrops([]); setEarnedGP(0); setCharge(0);
    setPhase("playing");
    cloudX.setValue((W - CLOUD_W) / 2);

    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      setTimeLeft(ROUND_SECS - elapsed);
      if (elapsed >= ROUND_SECS) void endGame();
    }, 1000);

    // Thirst decay + wilt death
    thirstTimerRef.current = setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const updated = seedlingsRef.current.map((s) => {
        if (s.dead) return s;
        const newThirst = Math.max(0, s.thirst - THIRST_DECAY);
        let wiltSecs = s.wiltSecs;
        if (newThirst === 0) {
          wiltSecs++;
          if (wiltSecs >= WILT_DEATH_SECS) {
            return { ...s, thirst: 0, wiltSecs, dead: true, stage: 0 as SeedStage };
          }
        } else {
          wiltSecs = 0;
        }
        return { ...s, thirst: newThirst, wiltSecs };
      });
      const deadCount = updated.filter((s) => s.dead).length;
      seedlingsRef.current = updated;
      setSeedlings([...updated]);
      if (deadCount >= 3) void endGame();
    }, 1000);
  };

  const stopGame = () => {
    phaseRef.current = "idle";
    stopCharge();
    if (timerRef.current) clearInterval(timerRef.current);
    if (thirstTimerRef.current) clearInterval(thirstTimerRef.current);
  };

  const endGame = useCallback(async () => {
    phaseRef.current = "done";
    stopGame();
    setPhase("done");
    const trees = seedlingsRef.current.filter((s) => s.stage >= 3).length;
    const gp = Math.min(25, trees * 5 + Math.floor(scoreRef.current / 15));
    if (gp > 0) {
      const actual = await earn(gp, "rainmaker_win", "rainmaker");
      setEarnedGP(actual);
    }
  }, [earn]);

  const thunderstorm = async () => {
    const ok = await spend(30, "thunderstorm", "rainmaker");
    if (!ok) { Alert.alert("Not enough GP", "Thunderstorm costs 30 GP."); return; }
    const updated = seedlingsRef.current.map((s) => s.dead ? s : { ...s, thirst: 100, wiltSecs: 0 });
    seedlingsRef.current = updated;
    setSeedlings([...updated]);
    Vibration.vibrate([0, 40, 20, 60]);
  };

  const deadCount = seedlings.filter((s) => s.dead).length;
  const treeCount = seedlings.filter((s) => s.stage >= 3).length;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0c4a6e", "#0369a1", "#7dd3fc"]} style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => { stopGame(); navigation.goBack(); }} style={s.back}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={s.title}>🌧️ Rainmaker</Text>
          <View style={s.gp}><Text style={s.gpTxt}>🌿 {loading ? "—" : gpBalance}</Text></View>
        </View>
        {phase === "playing" && (
          <View style={s.hud}>
            <Text style={s.hudVal}>⭐ {score}</Text>
            <Text style={s.hudVal}>⏱ {timeLeft}s</Text>
            <Text style={s.hudVal}>💀 {deadCount}/3</Text>
          </View>
        )}
      </LinearGradient>

      <View style={s.sky} {...cloudPan.panHandlers}>
        <LinearGradient colors={["#bae6fd", "#e0f2fe", "#f0fdf4"]} style={StyleSheet.absoluteFill} />

        {/* Cloud + charge button */}
        {phase === "playing" && (
          <Animated.View style={[s.cloudWrap, { transform: [{ translateX: cloudX }] }]}>
            <Text style={s.cloudEmoji}>☁️</Text>
            {/* Charge bar */}
            <View style={s.chargeTrack}>
              <Animated.View style={[s.chargeFill, { width: chargeAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) as any,
                backgroundColor: charge > 70 ? "#3b82f6" : charge > 30 ? "#0ea5e9" : "#bae6fd" }]} />
            </View>
            <Pressable
              onPressIn={startCharge}
              onPressOut={releaseRain}
              style={s.rainBtn}
            >
              <Text style={s.rainBtnTxt}>{charge > 70 ? "💦" : charge > 30 ? "🌧️" : "🌂"}</Text>
              <Text style={s.rainHint}>hold & release</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Raindrops */}
        {drops.map((d) => (
          <Animated.View
            key={d.id}
            style={[s.drop, {
              left: d.x - (d.radius * 6),
              width: d.radius * 12,
              opacity: d.opac,
              transform: [{ translateY: d.anim }],
            }]}
            pointerEvents="none"
          />
        ))}

        {/* Seedlings */}
        <View style={s.ground}>
          <LinearGradient colors={["#854d0e", "#92400e"]} style={s.soil} />
          <View style={s.seedRow}>
            {seedlings.map((sl, i) => (
              <View key={i} style={s.seedCell}>
                <Animated.Text style={[s.seedEmoji, sl.dead && s.seedDead, { transform: [{ scale: sl.waterAnim }] }]}>
                  {sl.dead ? "💀" : SEED_EMOJI[sl.stage]}
                </Animated.Text>
                {!sl.dead && (
                  <View style={s.thirstTrack}>
                    <View style={[s.thirstFill, {
                      width: `${sl.thirst}%` as any,
                      backgroundColor: sl.thirst > 50 ? "#0ea5e9" : sl.thirst > 25 ? "#f59e0b" : "#ef4444",
                    }]} />
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Idle overlay */}
        {phase === "idle" && (
          <View style={s.overlay}>
            <Text style={s.bigEmoji}>🌧️</Text>
            <Text style={s.panelTitle}>Rainmaker</Text>
            <Text style={s.panelDesc}>Drag the cloud, then HOLD the button to charge your raindrop — release to launch!</Text>
            <Text style={s.panelDesc}>Each seedling needs water. If 3 wilt and die, round ends!</Text>
            <Pressable onPress={startGame} style={({ pressed }) => [s.startBtn, pressed && s.pressed]}>
              <LinearGradient colors={["#0ea5e9", "#0369a1"]} style={s.startGrad}>
                <Text style={s.startTxt}>▶ Start</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* Done overlay */}
        {phase === "done" && (
          <View style={s.overlay}>
            <Text style={s.bigEmoji}>{treeCount >= 5 ? "🌈" : treeCount >= 3 ? "🌤️" : "🌧️"}</Text>
            <Text style={s.panelTitle}>Round Over!</Text>
            <Text style={s.resultLine}>🌲 {treeCount}/{SEEDLING_COUNT} trees grown</Text>
            <Text style={s.resultLine}>⭐ Score: {score}</Text>
            {earnedGP > 0 && <Text style={s.earnedGP}>+{earnedGP} GP earned!</Text>}
            <Pressable onPress={startGame} style={({ pressed }) => [s.startBtn, pressed && s.pressed]}>
              <LinearGradient colors={["#0ea5e9", "#0369a1"]} style={s.startGrad}>
                <Text style={s.startTxt}>↺ Play Again</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>

      {/* Thunderstorm button */}
      {phase === "playing" && (
        <Pressable onPress={thunderstorm} style={({ pressed }) => [s.stormBtn, pressed && s.pressed]}>
          <Text style={s.stormTxt}>⛈️ Thunderstorm (instant water all) — 30 GP</Text>
        </Pressable>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  back: { padding: 6 },
  title: { fontSize: 17, fontWeight: "900", color: "#fff" },
  gp: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  gpTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  hud: { flexDirection: "row", justifyContent: "space-around" },
  hudVal: { fontSize: 15, fontWeight: "900", color: "#fff" },
  sky: { flex: 1, position: "relative" },
  cloudWrap: { position: "absolute", top: 50, zIndex: 5, alignItems: "center", width: CLOUD_W },
  cloudEmoji: { fontSize: 64 },
  chargeTrack: { width: CLOUD_W - 10, height: 8, backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 4, overflow: "hidden", marginTop: 2 },
  chargeFill: { height: "100%", borderRadius: 4 },
  rainBtn: { marginTop: 4, alignItems: "center", backgroundColor: "rgba(14,165,233,0.85)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  rainBtnTxt: { fontSize: 24 },
  rainHint: { fontSize: 9, color: "#fff", fontWeight: "700" },
  drop: { position: "absolute", top: 0, height: 18, borderRadius: 9, backgroundColor: "#0ea5e9", opacity: 0.85 },
  ground: { position: "absolute", bottom: 0, left: 0, right: 0 },
  soil: { height: 22 },
  seedRow: { position: "absolute", bottom: 18, left: 16, right: 16, flexDirection: "row", justifyContent: "space-around" },
  seedCell: { alignItems: "center", width: SLOT_W - 4 },
  seedEmoji: { fontSize: 30 },
  seedDead: { opacity: 0.5 },
  thirstTrack: { width: "90%", height: 5, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 3, overflow: "hidden", marginTop: 2 },
  thirstFill: { height: "100%", borderRadius: 3 },
  overlay: {
    ...StyleSheet.absoluteFill, zIndex: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(240,249,255,0.88)", gap: 12, padding: 32,
  },
  bigEmoji: { fontSize: 72 },
  panelTitle: { fontSize: 24, fontWeight: "900", color: "#0c4a6e" },
  panelDesc: { fontSize: 12, color: "#0369a1", textAlign: "center", lineHeight: 18 },
  resultLine: { fontSize: 16, fontWeight: "800", color: "#0c4a6e" },
  earnedGP: { fontSize: 22, fontWeight: "900", color: "#f59e0b" },
  startBtn: { borderRadius: 14, overflow: "hidden", elevation: 3 },
  startGrad: { paddingHorizontal: 32, paddingVertical: 14 },
  startTxt: { fontSize: 16, fontWeight: "900", color: "#fff" },
  stormBtn: { backgroundColor: "#0c4a6e", paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", borderTopWidth: 1, borderTopColor: "#0369a1" },
  stormTxt: { fontSize: 12, fontWeight: "800", color: "#7dd3fc" },
  pressed: { opacity: 0.88 },
});
