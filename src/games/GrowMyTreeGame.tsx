/**
 * Grow My Tree — disease attack system + real regression
 * Diseases appear at SPECIFIC locations on the tree SVG.
 * Each requires a different gesture to cure:
 *   🪲 Bark Beetle (trunk)  → SCRUB: rapid left-right swipe ≥ 4 passes
 *   🍂 Crown Wilt (leaves)  → TRIPLE TAP: 3 taps within 1.5s
 *   🦠 Root Rot (roots)     → HOLD: 2.5 seconds press
 *   🐛 Branch Blight (limb) → SWIPE UP ≥ 50 px
 *
 * FAIL STATE: health 0 → stage regresses. Stage 0 at health 0 → tree DIES (resets).
 * GP power-ups: Emergency Cure (40 GP), Sunshine Elixir (30 GP = no decay 12h).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Animated, Alert,
  TextInput, Dimensions, ScrollView, PanResponder, Vibration,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

const { width: W } = Dimensions.get("window");
const CANVAS = Math.min(W - 32, 300);

const SceneShell = ({ children, glow = false }: { children: any; glow?: boolean }) => (
  <Svg width={CANVAS} height={CANVAS} viewBox="0 0 200 200">
    <Defs>
      <SvgLinearGradient id="growSky" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#f7fee7" />
        <Stop offset="45%" stopColor="#dcfce7" />
        <Stop offset="100%" stopColor="#bbf7d0" />
      </SvgLinearGradient>
      <SvgLinearGradient id="growHill" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#65a30d" />
        <Stop offset="100%" stopColor="#15803d" />
      </SvgLinearGradient>
      <SvgLinearGradient id="growTrunk" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#9a6b34" />
        <Stop offset="100%" stopColor="#6f451e" />
      </SvgLinearGradient>
      <RadialGradient id="canopyGlow" cx="50%" cy="32%" r="65%">
        <Stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
        <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </RadialGradient>
    </Defs>
    <Rect x="0" y="0" width="200" height="200" rx="26" fill="url(#growSky)" />
    <Circle cx="154" cy="38" r="18" fill="rgba(253,224,71,0.7)" />
    <Path d="M0 148 C40 126 75 150 108 132 C142 114 174 126 200 142 L200 200 L0 200 Z" fill="#86efac" />
    <Path d="M0 162 C38 144 82 176 126 152 C154 136 178 142 200 154 L200 200 L0 200 Z" fill="url(#growHill)" opacity="0.85" />
    <Ellipse cx="100" cy="172" rx="62" ry="12" fill="rgba(15,23,42,0.12)" />
    <Path d="M42 168 C58 152 78 148 100 150 C124 151 146 156 158 168 L42 168 Z" fill="#8b5a2b" opacity="0.8" />
    {glow ? <Circle cx="100" cy="70" r="66" fill="url(#canopyGlow)" /> : null}
    {children}
  </Svg>
);

const SeedSvg = () => (
  <SceneShell>
    <Ellipse cx="100" cy="150" rx="24" ry="16" fill="#8b5a2b" />
    <Path d="M100 149 C95 142 95 127 100 119 C106 128 106 142 100 149 Z" fill="#6f451e" />
    <Circle cx="86" cy="142" r="3" fill="rgba(255,255,255,0.22)" />
  </SceneShell>
);

const SeedlingSvg = () => (
  <SceneShell>
    <Rect x="97" y="116" width="7" height="50" rx="3.5" fill="url(#growTrunk)" />
    <Path d="M100 132 C78 120 73 98 78 88 C90 90 101 104 100 121 Z" fill="#22c55e" />
    <Path d="M101 123 C122 106 129 84 124 76 C111 80 98 96 100 118 Z" fill="#4ade80" />
    <Circle cx="100" cy="110" r="5" fill="#16a34a" opacity="0.5" />
  </SceneShell>
);

const YoungTreeSvg = () => (
  <SceneShell>
    <Rect x="92" y="102" width="16" height="68" rx="8" fill="url(#growTrunk)" />
    <Path d="M96 124 C84 116 77 110 69 98" stroke="#7c4a22" strokeWidth="6" strokeLinecap="round" fill="none" />
    <Path d="M104 118 C116 110 126 102 134 92" stroke="#7c4a22" strokeWidth="6" strokeLinecap="round" fill="none" />
    <Circle cx="100" cy="90" r="38" fill="#15803d" />
    <Circle cx="76" cy="82" r="25" fill="#22c55e" />
    <Circle cx="124" cy="80" r="24" fill="#22c55e" />
    <Circle cx="101" cy="64" r="28" fill="#4ade80" />
    <Circle cx="116" cy="56" r="10" fill="rgba(255,255,255,0.22)" />
  </SceneShell>
);

const MatureTreeSvg = () => (
  <SceneShell glow>
    <Rect x="86" y="88" width="28" height="86" rx="12" fill="url(#growTrunk)" />
    <Path d="M88 124 C68 118 55 112 42 104" stroke="#6f451e" strokeWidth="10" strokeLinecap="round" fill="none" />
    <Path d="M112 116 C130 106 144 98 158 96" stroke="#6f451e" strokeWidth="10" strokeLinecap="round" fill="none" />
    <Circle cx="100" cy="76" r="56" fill="#166534" />
    <Circle cx="66" cy="64" r="36" fill="#15803d" />
    <Circle cx="136" cy="63" r="34" fill="#15803d" />
    <Circle cx="102" cy="40" r="40" fill="#22c55e" />
    <Circle cx="78" cy="44" r="25" fill="#4ade80" />
    <Circle cx="122" cy="44" r="24" fill="#4ade80" />
    <Circle cx="92" cy="58" r="4" fill="#fbbf24" />
    <Circle cx="118" cy="54" r="4" fill="#ef4444" />
    <Circle cx="73" cy="76" r="3.5" fill="#fde68a" />
  </SceneShell>
);

const GiantTreeSvg = () => (
  <SceneShell glow>
    <Rect x="80" y="78" width="40" height="100" rx="15" fill="url(#growTrunk)" />
    <Path d="M82 118 C56 108 36 102 22 98" stroke="#6f451e" strokeWidth="13" strokeLinecap="round" fill="none" />
    <Path d="M118 108 C145 96 164 90 178 88" stroke="#6f451e" strokeWidth="13" strokeLinecap="round" fill="none" />
    <Path d="M88 144 C72 150 56 156 44 158" stroke="#6f451e" strokeWidth="9" strokeLinecap="round" fill="none" />
    <Path d="M116 140 C134 146 148 152 162 154" stroke="#6f451e" strokeWidth="9" strokeLinecap="round" fill="none" />
    <Circle cx="100" cy="62" r="72" fill="#14532d" />
    <Circle cx="52" cy="48" r="46" fill="#166534" />
    <Circle cx="148" cy="46" r="44" fill="#166534" />
    <Circle cx="98" cy="22" r="50" fill="#15803d" />
    <Circle cx="66" cy="24" r="34" fill="#22c55e" />
    <Circle cx="136" cy="22" r="32" fill="#22c55e" />
    <Circle cx="100" cy="0" r="38" fill="#4ade80" />
    <Circle cx="58" cy="70" r="5" fill="#ef4444" />
    <Circle cx="84" cy="18" r="4" fill="#fde68a" />
    <Circle cx="122" cy="32" r="4.5" fill="#f97316" />
    <Circle cx="142" cy="56" r="5" fill="#ef4444" />
    <Circle cx="116" cy="12" r="4" fill="#fde68a" />
  </SceneShell>
);

const TreeVisual = ({ stage }: { stage: number }) => {
  switch (stage) {
    case 0: return <SeedSvg />;
    case 1: return <SeedlingSvg />;
    case 2: return <YoungTreeSvg />;
    case 3: return <MatureTreeSvg />;
    default: return <GiantTreeSvg />;
  }
};

type DiseaseType = "beetle" | "wilt" | "rot" | "blight";
type Disease = {
  id: string;
  type: DiseaseType;
  xPct: number;   // 0–1 position on canvas
  yPct: number;
  countdown: number;
  tapCount: number;
  anim: Animated.Value;
};

const DISEASE_META: Record<DiseaseType, { emoji: string; name: string; gesture: string; color: string }> = {
  beetle: { emoji: "🪲", name: "Bark Beetle", gesture: "SCRUB ↔",    color: "#92400e" },
  wilt:   { emoji: "🍂", name: "Crown Wilt",  gesture: "TAP ×3",     color: "#f97316" },
  rot:    { emoji: "🦠", name: "Root Rot",    gesture: "HOLD 2.5s",  color: "#7c3aed" },
  blight: { emoji: "🐛", name: "Branch Blight", gesture: "SWIPE UP", color: "#dc2626" },
};

const DISEASE_SPAWN: Record<number, { type: DiseaseType; xPct: number; yPct: number }[]> = {
  0: [{ type: "rot",    xPct: 0.45, yPct: 0.78 }],
  1: [{ type: "beetle", xPct: 0.45, yPct: 0.62 }, { type: "rot", xPct: 0.42, yPct: 0.82 }],
  2: [{ type: "wilt",   xPct: 0.40, yPct: 0.28 }, { type: "beetle", xPct: 0.44, yPct: 0.58 }, { type: "rot", xPct: 0.40, yPct: 0.82 }],
  3: [{ type: "blight", xPct: 0.68, yPct: 0.48 }, { type: "wilt", xPct: 0.38, yPct: 0.22 }, { type: "rot", xPct: 0.38, yPct: 0.82 }],
  4: [{ type: "blight", xPct: 0.72, yPct: 0.42 }, { type: "wilt", xPct: 0.30, yPct: 0.16 }, { type: "beetle", xPct: 0.42, yPct: 0.54 }, { type: "rot", xPct: 0.38, yPct: 0.82 }],
};

type TreeState = {
  name: string; stage: number; health: number; water: number;
  fertilizer: number; shield: number; totalWaters: number;
  lastWatered: number; born: number; elixirUntil: number;
};

const DEFAULT: TreeState = {
  name: "My Tree", stage: 0, health: 80, water: 40, fertilizer: 30,
  shield: 20, totalWaters: 0, lastWatered: 0, born: Date.now(), elixirUntil: 0,
};

const STAGE_NAMES = ["Seed", "Seedling", "Young Tree", "Mature Tree", "Giant Tree"];
const KEY = "grove:grow_tree:v2:";

// Module-level component so React identity is stable across parent re-renders
const DiseaseNode = ({ d, onCure }: { d: Disease; onCure: (id: string) => void }) => {
  const meta = DISEASE_META[d.type];
  const scrubCountRef = useRef(0);
  const lastXRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapRef = useRef(0);
  const holdAnim = useRef(new Animated.Value(0)).current;
  const [tapCount, setTapCount] = useState(0);
  // Use a ref so PanResponder closure always calls the latest callback
  const onCureRef = useRef(onCure);
  onCureRef.current = onCure;
  const dIdRef = useRef(d.id);
  dIdRef.current = d.id;
  const dTypeRef = useRef(d.type);
  dTypeRef.current = d.type;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      lastXRef.current = e.nativeEvent.locationX;
      if (dTypeRef.current === "rot") {
        Animated.timing(holdAnim, { toValue: 1, duration: 2500, useNativeDriver: false }).start(({ finished }) => {
          if (finished) onCureRef.current(dIdRef.current);
        });
      }
      if (dTypeRef.current === "wilt") {
        tapRef.current++;
        setTapCount(tapRef.current);
        if (tapRef.current >= 3) {
          onCureRef.current(dIdRef.current);
          if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        } else {
          if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
          tapTimerRef.current = setTimeout(() => { tapRef.current = 0; setTapCount(0); }, 1500);
        }
      }
    },
    onPanResponderMove: (e, g) => {
      if (dTypeRef.current === "beetle") {
        const dx = e.nativeEvent.locationX - lastXRef.current;
        if (Math.abs(dx) > 25) {
          scrubCountRef.current++;
          lastXRef.current = e.nativeEvent.locationX;
          if (scrubCountRef.current >= 4) onCureRef.current(dIdRef.current);
        }
      }
      if (dTypeRef.current === "blight" && g.dy < -50) onCureRef.current(dIdRef.current);
    },
    onPanResponderRelease: () => {
      holdAnim.stopAnimation();
      Animated.timing(holdAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    },
  })).current;

  const holdW = holdAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const urgency = d.countdown <= 8;

  return (
    <View
      style={[dn.wrap, { left: d.xPct * CANVAS - 26, top: d.yPct * CANVAS - 26 }]}
      {...pan.panHandlers}
    >
      <View style={[dn.bubble, urgency && dn.bubbleUrgent, { borderColor: meta.color }]}>
        {d.type === "rot" && (
          <Animated.View style={[dn.holdFill, { width: holdW, backgroundColor: meta.color }]} />
        )}
        <Animated.Text style={[dn.emoji, { transform: [{ scale: d.anim }] }]}>{meta.emoji}</Animated.Text>
        <Text style={[dn.gesture, { color: meta.color }]}>{meta.gesture}</Text>
        {d.type === "wilt" && (
          <View style={dn.wiltPips}>
            {[0,1,2].map((i) => <View key={i} style={[dn.pip, { backgroundColor: i < tapCount ? meta.color : "#e5e7eb" }]} />)}
          </View>
        )}
        <Text style={[dn.countdown, urgency && { color: "#ef4444" }]}>{d.countdown}s</Text>
      </View>
    </View>
  );
};

export const GrowMyTreeGame = () => {
  const { session } = useAuth();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh, spend } = useGameGP(session);

  const [tree, setTree] = useState<TreeState>(DEFAULT);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [deadAlert, setDeadAlert] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const storageKey = KEY + (session?.user.id ?? "anon");

  useFocusEffect(useCallback(() => {
    void refresh();
    void loadTree();
    const timer = setInterval(() => spawnDiseaseIfDue(), 12000);
    return () => clearInterval(timer);
  }, [refresh]));

  const loadTree = async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) { setTree(DEFAULT); return; }
    const saved: TreeState = JSON.parse(raw);
    const now = Date.now();
    const protected_ = now < (saved.elixirUntil || 0);
    const hours = (now - (saved.lastWatered || now)) / 3_600_000;
    const decayedWater = protected_ ? saved.water : Math.max(0, saved.water - hours * 5);
    const updated = { ...saved, water: decayedWater };
    setTree(updated);
  };

  const saveTree = async (t: TreeState) => {
    await AsyncStorage.setItem(storageKey, JSON.stringify(t));
  };

  const spawnDiseaseIfDue = () => {
    setDiseases((prev) => {
      if (prev.length >= 2) return prev;
      setTree((t) => {
        const pool = (DISEASE_SPAWN[t.stage] || []).filter(
          (d) => !prev.find((p) => p.type === d.type)
        );
        if (!pool.length) return t;
        const d = pool[Math.floor(Math.random() * pool.length)];
        const pulse = new Animated.Value(1);
        Animated.loop(Animated.sequence([
          Animated.timing(pulse, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])).start();
        const newDisease: Disease = { id: `d_${Date.now()}`, type: d.type, xPct: d.xPct, yPct: d.yPct, countdown: 20, tapCount: 0, anim: pulse };
        setDiseases((dd) => [...dd, newDisease]);
        return t;
      });
      return prev;
    });
  };

  // Disease countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setDiseases((prev) => {
        const next = prev.filter((d) => {
          if (d.countdown <= 1) {
            // Disease expired — damage tree
            applyDiseaseDamage();
            return false;
          }
          return true;
        }).map((d) => ({ ...d, countdown: d.countdown - 1 }));
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const applyDiseaseDamage = () => {
    Vibration.vibrate([0, 60, 40, 60]);
    setTree((prev) => {
      const newHealth = prev.health - 25;
      if (newHealth <= 0) {
        if (prev.stage === 0) {
          // TREE DIES
          setDeadAlert(true);
          const dead = { ...DEFAULT, name: prev.name };
          void saveTree(dead);
          return dead;
        } else {
          shakeTreeAnim();
          const regressed = { ...prev, stage: prev.stage - 1, health: 70, water: 30 };
          void saveTree(regressed);
          setMsg(`💔 Tree weakened! Stage dropped to ${STAGE_NAMES[regressed.stage]}`);
          setTimeout(() => setMsg(null), 3000);
          return regressed;
        }
      }
      const updated = { ...prev, health: newHealth };
      void saveTree(updated);
      return updated;
    });
  };

  const shakeTreeAnim = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const cureDisease = (diseaseId: string) => {
    Vibration.vibrate(50);
    setDiseases((prev) => prev.filter((d) => d.id !== diseaseId));
    setMsg("✅ Disease cured!");
    setTimeout(() => setMsg(null), 1500);
    setTree((prev) => {
      const healed = { ...prev, health: Math.min(100, prev.health + 15) };
      void saveTree(healed);
      return healed;
    });
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.1, useNativeDriver: true, speed: 50 }),
      Animated.spring(scaleAnim, { toValue: 1.0, useNativeDriver: true, speed: 30 }),
    ]).start();
  };

  const doAction = async (action: "water" | "fertilize" | "shield") => {
    if (acting) return;
    const costs = { water: 10, fertilize: 15, shield: 20 };
    setActing(action);
    const ok = await spend(costs[action], action, "grow_tree");
    if (!ok) { Alert.alert("Not enough GP", `You need ${costs[action]} GP.`); setActing(null); return; }
    Vibration.vibrate(30);
    setTree((prev) => {
      let next = { ...prev };
      if (action === "water") { next.water = Math.min(100, prev.water + 25); next.lastWatered = Date.now(); next.totalWaters++; next.health = Math.min(100, prev.health + 5); setMsg("💧 +25% water"); }
      else if (action === "fertilize") { next.fertilizer = Math.min(100, prev.fertilizer + 30); next.health = Math.min(100, prev.health + 8); setMsg("🌱 +30% fertility"); }
      else { next.shield = Math.min(100, prev.shield + 40); setMsg("🛡️ +40% shield"); }
      const waterPts = next.totalWaters * 5;
      const thresholds = [0, 20, 45, 70, 90];
      if (next.stage < 4 && next.water >= 70 && next.fertilizer >= 50 && waterPts >= thresholds[next.stage + 1]) {
        next.stage++;
        setMsg(`🎉 Stage up! Now: ${STAGE_NAMES[next.stage]}`);
        Vibration.vibrate([0, 50, 30, 50, 30, 50]);
      }
      void saveTree(next);
      return next;
    });
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.07, useNativeDriver: true, speed: 40 }),
      Animated.spring(scaleAnim, { toValue: 1.0, useNativeDriver: true, speed: 30 }),
    ]).start();
    setTimeout(() => setMsg(null), 2000);
    setActing(null);
  };

  const emergencyCure = async () => {
    const ok = await spend(40, "emergency_cure", "grow_tree");
    if (!ok) { Alert.alert("Not enough GP", "Emergency Cure costs 40 GP."); return; }
    diseases.forEach((d) => d.anim.stopAnimation());
    setDiseases([]);
    setTree((prev) => {
      const healed = { ...prev, health: Math.min(100, prev.health + 30) };
      void saveTree(healed);
      return healed;
    });
    Vibration.vibrate([0, 40, 20, 40]);
    setMsg("💊 All diseases cured!");
    setTimeout(() => setMsg(null), 2000);
  };

  const sunshineElixir = async () => {
    const ok = await spend(30, "sunshine_elixir", "grow_tree");
    if (!ok) { Alert.alert("Not enough GP", "Sunshine Elixir costs 30 GP."); return; }
    setTree((prev) => {
      const updated = { ...prev, elixirUntil: Date.now() + 12 * 3600000 };
      void saveTree(updated);
      return updated;
    });
    setMsg("☀️ No decay for 12 hours!");
    setTimeout(() => setMsg(null), 2000);
  };

  const isElixirActive = Date.now() < (tree.elixirUntil || 0);
  const healthColor = tree.health > 60 ? "#22c55e" : tree.health > 30 ? "#f59e0b" : "#ef4444";
  const skyGrad: [string, string] = tree.stage >= 4 ? ["#0c4a6e", "#0ea5e9"] : ["#166534", "#22c55e"];

  return (
    <View style={s.root}>
      <SystemBars style="light" />
      <LinearGradient colors={skyGrad} style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => nav.goBack()} style={s.back}><Ionicons name="arrow-back" size={22} color="#fff" /></Pressable>
          <Pressable onPress={() => { setNameInput(tree.name); setNaming(true); }} style={s.nameRow}>
            <Text style={s.nameTxt}>{tree.name}</Text>
            <Ionicons name="pencil" size={13} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <View style={s.gp}><Text style={s.gpTxt}>🌿 {loading ? "—" : gpBalance}</Text></View>
        </View>
        {/* Health bar */}
        <View style={s.healthRow}>
          <Text style={s.healthLbl}>❤️ Health</Text>
          <View style={s.healthTrack}>
            <Animated.View style={[s.healthFill, { width: `${tree.health}%` as any, backgroundColor: healthColor }]} />
          </View>
          <Text style={[s.healthVal, { color: "#fff" }]}>{Math.round(tree.health)}%</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 100 }]}>
        {/* Stage */}
        <View style={s.stageBadge}>
          <Text style={s.stageTxt}>Stage {tree.stage + 1}: {STAGE_NAMES[tree.stage]}</Text>
          {isElixirActive && <Text style={s.elixirBadge}>☀️ Protected</Text>}
          {diseases.length > 0 && <Text style={s.diseaseBadge}>⚠️ {diseases.length} Disease{diseases.length > 1 ? "s" : ""}!</Text>}
        </View>

        {/* Tree canvas with disease overlays */}
        <View style={s.treeContainer}>
          <LinearGradient colors={["#f0fdf4", "#dcfce7", "#bbf7d0"]} style={s.treeSky}>
            <Animated.View style={[s.treeWrap, { transform: [{ scale: scaleAnim }, { translateX: shakeAnim }] }]}>
              <TreeVisual stage={tree.stage} />
            </Animated.View>
            {diseases.map((d) => <DiseaseNode key={d.id} d={d} onCure={cureDisease} />)}
            {msg && (
              <View style={s.msgBubble}>
                <Text style={s.msgTxt}>{msg}</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Stat bars */}
        <View style={s.statsCard}>
          {([
            { val: tree.water, color: "#0ea5e9", icon: "💧", label: "Water" },
            { val: tree.fertilizer, color: "#22c55e", icon: "🌱", label: "Fertile" },
            { val: tree.shield, color: "#f59e0b", icon: "🛡️", label: "Shield" },
          ] as const).map((bar) => (
            <View key={bar.label} style={s.barRow}>
              <Text style={s.barIcon}>{bar.icon}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${bar.val}%` as any, backgroundColor: bar.color }]} />
              </View>
              <Text style={s.barVal}>{Math.round(bar.val)}%</Text>
            </View>
          ))}
        </View>

        {/* Care actions */}
        <View style={s.actions}>
          {([
            { a: "water" as const,     emoji: "💧", label: "Water",     cost: 10, colors: ["#0ea5e9","#0369a1"] as [string,string] },
            { a: "fertilize" as const, emoji: "🌱", label: "Fertilize", cost: 15, colors: ["#22c55e","#15803d"] as [string,string] },
            { a: "shield" as const,    emoji: "🛡️", label: "Protect",   cost: 20, colors: ["#f59e0b","#b45309"] as [string,string] },
          ]).map((btn) => (
            <Pressable key={btn.a} onPress={() => doAction(btn.a)} disabled={!!acting}
              style={({ pressed }) => [s.actionBtn, pressed && s.pressed]}>
              <LinearGradient colors={btn.colors} style={s.actionGrad}>
                <Text style={s.actionEmoji}>{btn.emoji}</Text>
                <Text style={s.actionLabel}>{btn.label}</Text>
                <View style={s.costBadge}><Text style={s.costTxt}>{btn.cost} GP</Text></View>
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        {/* GP power-ups */}
        <View style={s.puRow}>
          <Pressable onPress={emergencyCure} style={({ pressed }) => [s.puBtn, pressed && s.pressed]}>
            <Text style={s.puTxt}>💊 Emergency Cure — 40 GP</Text>
          </Pressable>
          {!isElixirActive && (
            <Pressable onPress={sunshineElixir} style={({ pressed }) => [s.puBtn2, pressed && s.pressed]}>
              <Text style={s.puTxt2}>☀️ No Decay 12h — 30 GP</Text>
            </Pressable>
          )}
        </View>

        <Text style={s.tip}>
          {diseases.length > 0
            ? `⚠️ Treat diseases before they damage your tree!`
            : tree.health < 40
              ? "❗ Tree health is critical — use Emergency Cure!"
              : "Keep water, fertility and shield above 60% to grow to the next stage."}
        </Text>
      </ScrollView>

      {/* Name modal */}
      {naming && (
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Name your tree</Text>
            <TextInput style={s.input} value={nameInput} onChangeText={setNameInput} maxLength={24} autoFocus placeholder="e.g. Grandma Oak" placeholderTextColor="#9ca3af" />
            <View style={s.modalBtns}>
              <Pressable onPress={() => setNaming(false)} style={s.cancelBtn}><Text style={s.cancelTxt}>Cancel</Text></Pressable>
              <Pressable onPress={() => { const t2 = { ...tree, name: nameInput.trim() || "My Tree" }; setTree(t2); void saveTree(t2); setNaming(false); }} style={s.saveBtn}><Text style={s.saveTxt}>Save</Text></Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Death alert */}
      {deadAlert && (
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: "#1a0000" }]}>
            <Text style={{ fontSize: 64 }}>💀</Text>
            <Text style={[s.modalTitle, { color: "#ef4444" }]}>Your tree died...</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 22 }}>
              It couldn't survive the diseases. A new seed awaits — this time, care for it better.
            </Text>
            <Pressable onPress={() => setDeadAlert(false)} style={[s.saveBtn, { width: "100%" }]}>
              <Text style={[s.saveTxt, { textAlign: "center" }]}>🌱 Plant a new seed</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const dn = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 20, width: 52, height: 52 },
  bubble: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center",
    overflow: "hidden", elevation: 5, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4,
  },
  bubbleUrgent: { borderWidth: 3 },
  holdFill: { position: "absolute", bottom: 0, left: 0, height: 5 },
  emoji: { fontSize: 22 },
  gesture: { fontSize: 7, fontWeight: "800", letterSpacing: 0.2 },
  wiltPips: { flexDirection: "row", gap: 2, marginTop: 1 },
  pip: { width: 5, height: 5, borderRadius: 2.5 },
  countdown: { fontSize: 8, fontWeight: "900", color: "#6b7280", position: "absolute", top: 2, right: 3 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f6f1" },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  back: { padding: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  nameTxt: { fontSize: 17, fontWeight: "900", color: "#fff" },
  gp: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  gpTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  healthLbl: { fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: "700" },
  healthTrack: { flex: 1, height: 8, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4, overflow: "hidden" },
  healthFill: { height: "100%", borderRadius: 4 },
  healthVal: { fontSize: 11, fontWeight: "800", width: 36, textAlign: "right" },
  body: { padding: 14, gap: 14 },
  stageBadge: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  stageTxt: { fontSize: 14, fontWeight: "800", color: "#1a3328", backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, elevation: 2 },
  elixirBadge: { fontSize: 11, fontWeight: "700", color: "#b45309", backgroundColor: "#fef3c7", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  diseaseBadge: { fontSize: 11, fontWeight: "900", color: "#ef4444", backgroundColor: "#fee2e2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  treeContainer: {
    borderRadius: 26,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#14532d",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.82)",
  },
  treeSky: { height: 280, alignItems: "center", justifyContent: "center", position: "relative" },
  treeWrap: { marginBottom: 0 },
  msgBubble: { position: "absolute", top: 12, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  msgTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  statsCard: { backgroundColor: "#fff", borderRadius: 16, padding: 14, gap: 8, elevation: 2 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barIcon: { fontSize: 16, width: 24 },
  barTrack: { flex: 1, height: 10, backgroundColor: "#f3f4f6", borderRadius: 5, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 5 },
  barVal: { fontSize: 11, fontWeight: "700", color: "#35564a", width: 36, textAlign: "right" },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 14, overflow: "hidden", elevation: 3 },
  actionGrad: { alignItems: "center", paddingVertical: 14, gap: 4 },
  actionEmoji: { fontSize: 26 },
  actionLabel: { fontSize: 12, fontWeight: "800", color: "#fff" },
  costBadge: { backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  costTxt: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.9)" },
  puRow: { gap: 8 },
  puBtn: { backgroundColor: "#fee2e2", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: "#fca5a5" },
  puTxt: { fontSize: 13, fontWeight: "700", color: "#dc2626", textAlign: "center" },
  puBtn2: { backgroundColor: "#fef3c7", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: "#fcd34d" },
  puTxt2: { fontSize: 13, fontWeight: "700", color: "#b45309", textAlign: "center" },
  tip: { fontSize: 12, color: "#35564a", textAlign: "center", lineHeight: 18 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", zIndex: 100 },
  modal: { backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "82%", gap: 14, alignItems: "center" },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#1a3328", textAlign: "center" },
  input: { borderWidth: 1.5, borderColor: "#d1fae5", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1a3328", width: "100%" },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelTxt: { fontSize: 14, fontWeight: "700", color: "#6b7280" },
  saveBtn: { flex: 1, backgroundColor: "#2aa852", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveTxt: { fontSize: 14, fontWeight: "900", color: "#fff" },
});
