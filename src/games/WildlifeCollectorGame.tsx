/**
 * Wildlife Collector — wave 2: animal-specific capture mini-games
 *
 * BEFORE spending GP to unlock an animal, the player must complete a
 * physical capture challenge. Different animals require different gestures:
 *
 *   RAPID_TAP   (squirrel, butterfly, panda): tap 8× in 2.5s
 *   HOLD_STEADY (deer, elephant, whale):      hold still for 3s — moving
 *                                              ≥12px resets the hold timer
 *   RHYTHM_TAP  (bird, eagle):                4 beats shown; tap within 280ms window each
 *   SWIPE_3     (fox, monkey, leopard):       3 fast directional swipes (any dir) within 2s
 *   DOUBLE_TAP  (rabbit):                     2 taps within 300ms
 *   CIRCLE_SWIPE(rhino/hippo or generic):     one slow arc swipe (dx²+dy² > 70² px)
 *
 * On SUCCESS → unlock proceeds (spends GP)
 * On FAIL 3× → retry option or "skip with 20 GP extra"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Alert, Modal, Animated, PanResponder, Vibration,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
type CaptureType = "rapid_tap" | "hold_steady" | "rhythm_tap" | "swipe_3" | "double_tap";

type Animal = {
  id: string; emoji: string; name: string; rarity: Rarity; gp: number;
  habitat: string; fact: string; capture: CaptureType;
};

const RARITY_COLOR: Record<Rarity, [string, string]> = {
  Common:    ["#6b7280", "#4b5563"],
  Uncommon:  ["#16a34a", "#15803d"],
  Rare:      ["#2563eb", "#1d4ed8"],
  Epic:      ["#7c3aed", "#6d28d9"],
  Legendary: ["#d97706", "#b45309"],
};
const RARITY_STARS: Record<Rarity, string> = {
  Common: "⭐", Uncommon: "⭐⭐", Rare: "⭐⭐⭐", Epic: "⭐⭐⭐⭐", Legendary: "⭐⭐⭐⭐⭐",
};

const ANIMALS: Animal[] = [
  { id: "bird",     emoji: "🐦", name: "Sunbird",     rarity: "Common",    gp: 50,   capture: "rhythm_tap",  habitat: "Canopy", fact: "Sunbirds are vital pollinators in African forests." },
  { id: "butterfly",emoji: "🦋", name: "Morpho",      rarity: "Common",    gp: 60,   capture: "rapid_tap",   habitat: "Garden", fact: "Morpho butterflies feed on rotting fruit to fertilise soil." },
  { id: "squirrel", emoji: "🐿️", name: "Squirrel",    rarity: "Common",    gp: 70,   capture: "rapid_tap",   habitat: "Trees",  fact: "Squirrels plant thousands of trees by forgetting buried nuts." },
  { id: "rabbit",   emoji: "🐇", name: "Rabbit",      rarity: "Uncommon",  gp: 100,  capture: "double_tap",  habitat: "Meadow", fact: "Rabbits keep grass short, letting wildflowers thrive." },
  { id: "deer",     emoji: "🦌", name: "Bushbuck",    rarity: "Uncommon",  gp: 120,  capture: "hold_steady", habitat: "Savanna",fact: "Bushbuck spread seeds across vast distances each day." },
  { id: "fox",      emoji: "🦊", name: "Fennec Fox",  rarity: "Rare",      gp: 200,  capture: "swipe_3",     habitat: "Dunes",  fact: "Fennec foxes dig burrows that provide shelter for other species." },
  { id: "monkey",   emoji: "🐒", name: "Colobus",     rarity: "Rare",      gp: 220,  capture: "swipe_3",     habitat: "Canopy", fact: "Colobus monkeys are critical seed dispersers in tropical forests." },
  { id: "elephant", emoji: "🐘", name: "Elephant",    rarity: "Epic",      gp: 400,  capture: "hold_steady", habitat: "Plains", fact: "Elephants are keystone species — they shape entire ecosystems." },
  { id: "leopard",  emoji: "🐆", name: "Leopard",     rarity: "Epic",      gp: 450,  capture: "swipe_3",     habitat: "Forest", fact: "Leopards control prey populations, preventing overgrazing." },
  { id: "eagle",    emoji: "🦅", name: "Fish Eagle",  rarity: "Legendary", gp: 800,  capture: "rhythm_tap",  habitat: "Skies",  fact: "The Fish Eagle's cry is synonymous with the African wilderness." },
  { id: "panda",    emoji: "🐼", name: "Giant Panda", rarity: "Legendary", gp: 900,  capture: "rapid_tap",   habitat: "Bamboo", fact: "Pandas spread bamboo seeds and create habitat for many species." },
  { id: "whale",    emoji: "🐋", name: "Blue Whale",  rarity: "Legendary", gp: 1000, capture: "hold_steady", habitat: "Ocean",  fact: "Whale falls support entire ecosystems on the ocean floor." },
];

const CAPTURE_INSTRUCTIONS: Record<CaptureType, string> = {
  rapid_tap:  "TAP RAPIDLY — 8 taps in 2.5 seconds!",
  hold_steady:"HOLD STILL — keep your finger pressed for 3 seconds. Don't move!",
  rhythm_tap: "TAP TO THE BEAT — 4 pulses, tap each within 0.3s!",
  swipe_3:    "3 FAST SWIPES in any direction within 2 seconds!",
  double_tap: "DOUBLE TAP — 2 quick taps in 300ms!",
};

const STORAGE_PREFIX = "grove:wildlife:";

// ── Capture mini-game component ──────────────────────────────────────────────
const CaptureGame = ({
  animal, onSuccess, onFail,
}: { animal: Animal; onSuccess: () => void; onFail: () => void }) => {
  const [tapCount, setTapCount] = useState(0);
  const [holdPct, setHoldPct] = useState(0);
  const [beatIdx, setBeatIdx] = useState(-1);  // current beat index
  const [beatLit, setBeatLit] = useState(false);
  const [swipeCount, setSwipeCount] = useState(0);
  const [status, setStatus] = useState<"ready" | "active" | "success" | "fail">("ready");
  const [countdown, setCountdown] = useState(3);

  const tapRef = useRef(0);
  const swipeRef = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdSecs = useRef(0);
  const holdStartPos = useRef({ x: 0, y: 0 });
  const gameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastTapTime = useRef(0);
  const doubleTapWaiting = useRef(false);

  useEffect(() => {
    // Auto-start after brief delay
    const t = setTimeout(() => startChallenge(), 600);
    return () => {
      clearTimeout(t);
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    if (gameTimer.current) clearTimeout(gameTimer.current);
    beatTimers.current.forEach(clearTimeout);
  };

  const startChallenge = () => {
    setStatus("active");
    const c = animal.capture;

    if (c === "rapid_tap") {
      tapRef.current = 0;
      setTapCount(0);
      gameTimer.current = setTimeout(() => {
        if (tapRef.current < 8) { setStatus("fail"); onFail(); }
      }, 2500);
    } else if (c === "hold_steady") {
      holdSecs.current = 0;
      setHoldPct(0);
      // Timer handled by PanResponder press
    } else if (c === "rhythm_tap") {
      // Show 4 beats at 800ms intervals
      for (let i = 0; i < 4; i++) {
        const t1 = setTimeout(() => {
          setBeatIdx(i);
          setBeatLit(true);
          beatTimers.current.push(setTimeout(() => setBeatLit(false), 280));
        }, 500 + i * 800);
        beatTimers.current.push(t1);
      }
      tapRef.current = 0;
      gameTimer.current = setTimeout(() => {
        if (tapRef.current < 4) { setStatus("fail"); onFail(); }
      }, 4000);
    } else if (c === "swipe_3") {
      swipeRef.current = 0;
      setSwipeCount(0);
      gameTimer.current = setTimeout(() => {
        if (swipeRef.current < 3) { setStatus("fail"); onFail(); }
      }, 2000);
    }
  };

  const handleTap = () => {
    if (status !== "active") return;
    const c = animal.capture;

    if (c === "rapid_tap") {
      tapRef.current++;
      setTapCount(tapRef.current);
      if (tapRef.current >= 8) { clearTimeout(gameTimer.current!); setStatus("success"); Vibration.vibrate([0,30,20,30]); setTimeout(onSuccess, 600); }
    } else if (c === "rhythm_tap") {
      if (beatLit) {
        tapRef.current++;
        Vibration.vibrate(20);
        if (tapRef.current >= 4) { clearTimeout(gameTimer.current!); setStatus("success"); setTimeout(onSuccess, 600); }
      }
    } else if (c === "double_tap") {
      const now = Date.now();
      if (doubleTapWaiting.current && now - lastTapTime.current < 320) {
        doubleTapWaiting.current = false;
        setStatus("success"); Vibration.vibrate([0,20,15,20]); setTimeout(onSuccess, 500);
      } else {
        doubleTapWaiting.current = true;
        lastTapTime.current = now;
        setTimeout(() => {
          if (doubleTapWaiting.current) { doubleTapWaiting.current = false; setStatus("fail"); onFail(); }
        }, 350);
      }
    }
  };

  const holdPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => animal.capture === "hold_steady" && status === "active",
    onPanResponderGrant: (e) => {
      holdSecs.current = 0;
      holdStartPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      holdTimer.current = setInterval(() => {
        holdSecs.current += 0.1;
        setHoldPct(Math.min(100, holdSecs.current / 3 * 100));
        if (holdSecs.current >= 3) {
          clearInterval(holdTimer.current!);
          setStatus("success"); Vibration.vibrate([0,40,20,40]); onSuccess();
        }
      }, 100);
    },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.pageX - holdStartPos.current.x;
      const dy = e.nativeEvent.pageY - holdStartPos.current.y;
      if (Math.hypot(dx, dy) > 12) {
        clearInterval(holdTimer.current!);
        holdSecs.current = 0;
        setHoldPct(0);
        Vibration.vibrate(40);
        // Restart hold
        holdStartPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        holdTimer.current = setInterval(() => {
          holdSecs.current += 0.1;
          setHoldPct(Math.min(100, holdSecs.current / 3 * 100));
          if (holdSecs.current >= 3) {
            clearInterval(holdTimer.current!);
            setStatus("success"); Vibration.vibrate([0,40,20,40]); onSuccess();
          }
        }, 100);
      }
    },
    onPanResponderRelease: () => {
      clearInterval(holdTimer.current!);
      setHoldPct(0);
      holdSecs.current = 0;
    },
  })).current;

  const swipePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => animal.capture === "swipe_3" && status === "active",
    onPanResponderRelease: (_, g) => {
      const dist = Math.hypot(g.dx, g.dy);
      if (dist > 40) {
        swipeRef.current++;
        setSwipeCount(swipeRef.current);
        Vibration.vibrate(20);
        if (swipeRef.current >= 3) {
          clearTimeout(gameTimer.current!);
          setStatus("success"); setTimeout(onSuccess, 500);
        }
      }
    },
  })).current;

  const beatColors = ["#f59e0b", "#0ea5e9", "#22c55e", "#ec4899"];
  const c = animal.capture;

  return (
    <View style={cg.root}>
      <Text style={cg.animalEmoji}>{animal.emoji}</Text>
      <Text style={cg.instructions}>{CAPTURE_INSTRUCTIONS[c]}</Text>

      {status === "success" && (
        <View style={cg.resultBox}>
          <Text style={cg.resultEmoji}>✅</Text>
          <Text style={cg.resultTxt}>Captured!</Text>
        </View>
      )}

      {status === "fail" && (
        <View style={[cg.resultBox, cg.failBox]}>
          <Text style={cg.resultEmoji}>❌</Text>
          <Text style={cg.resultTxt}>Failed…</Text>
        </View>
      )}

      {status === "ready" && (
        <View style={cg.readyBox}>
          <Text style={cg.readyTxt}>Get ready…</Text>
        </View>
      )}

      {status === "active" && (
        <View style={cg.challengeArea}>
          {c === "rapid_tap" && (
            <Pressable onPress={handleTap} style={cg.bigTapBtn}>
              <Text style={cg.bigTapEmoji}>{animal.emoji}</Text>
              <Text style={cg.tapCounter}>{tapRef.current}/8</Text>
              <View style={cg.pipsRow}>
                {[...Array(8)].map((_, i) => (
                  <View key={i} style={[cg.pip, i < tapCount && cg.pipFilled]} />
                ))}
              </View>
            </Pressable>
          )}

          {c === "double_tap" && (
            <Pressable onPress={handleTap} style={cg.bigTapBtn}>
              <Text style={cg.bigTapEmoji}>{animal.emoji}</Text>
              <Text style={cg.tapHint}>Double tap!</Text>
            </Pressable>
          )}

          {c === "rhythm_tap" && (
            <View style={cg.rhythmArea}>
              <View style={cg.beatsRow}>
                {beatColors.map((col, i) => (
                  <View key={i} style={[cg.beatDot, {
                    backgroundColor: i <= beatIdx ? col : "rgba(255,255,255,0.15)",
                    transform: [{ scale: i === beatIdx && beatLit ? 1.5 : 1 }],
                  }]} />
                ))}
              </View>
              <Pressable onPress={handleTap} style={[cg.rhythmBtn, beatLit && cg.rhythmBtnLit]}>
                <Text style={cg.bigTapEmoji}>{animal.emoji}</Text>
                <Text style={cg.tapHint}>{beatLit ? "TAP!" : "wait…"}</Text>
              </Pressable>
              <Text style={cg.tapCounter}>{tapRef.current}/4 beats</Text>
            </View>
          )}

          {c === "hold_steady" && (
            <View {...holdPan.panHandlers} style={cg.holdArea}>
              <Text style={cg.bigTapEmoji}>{animal.emoji}</Text>
              <View style={cg.holdTrack}>
                <View style={[cg.holdFill, { width: `${holdPct}%` as any }]} />
              </View>
              <Text style={cg.tapHint}>PRESS & HOLD — don't move!</Text>
            </View>
          )}

          {c === "swipe_3" && (
            <View {...swipePan.panHandlers} style={cg.swipeArea}>
              <Text style={cg.bigTapEmoji}>{animal.emoji}</Text>
              <View style={cg.pipsRow}>
                {[0,1,2].map((i) => (
                  <View key={i} style={[cg.pip, cg.pipLarge, i < swipeCount && cg.pipFilled]} />
                ))}
              </View>
              <Text style={cg.tapHint}>Swipe in any direction!</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const cg = StyleSheet.create({
  root: { alignItems: "center", gap: 12, paddingVertical: 8 },
  animalEmoji: { fontSize: 64 },
  instructions: { fontSize: 13, fontWeight: "700", color: "#1a3328", textAlign: "center", paddingHorizontal: 16, lineHeight: 20 },
  resultBox: { alignItems: "center", backgroundColor: "#d1fae5", borderRadius: 14, padding: 16, gap: 4 },
  failBox: { backgroundColor: "#fee2e2" },
  resultEmoji: { fontSize: 36 },
  resultTxt: { fontSize: 15, fontWeight: "900", color: "#1a3328" },
  readyBox: { padding: 16 },
  readyTxt: { fontSize: 15, color: "#6b7280", fontStyle: "italic" },
  challengeArea: { width: "100%", alignItems: "center" },
  bigTapBtn: {
    width: 130, height: 130, borderRadius: 65, backgroundColor: "#dcfce7",
    borderWidth: 3, borderColor: "#22c55e", alignItems: "center", justifyContent: "center", gap: 4,
  },
  bigTapEmoji: { fontSize: 44 },
  tapCounter: { fontSize: 14, fontWeight: "900", color: "#15803d" },
  tapHint: { fontSize: 11, color: "#6b7280", fontWeight: "700" },
  pipsRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  pip: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.12)" },
  pipLarge: { width: 16, height: 16, borderRadius: 8 },
  pipFilled: { backgroundColor: "#22c55e" },
  beatsRow: { flexDirection: "row", gap: 14, marginBottom: 12 },
  beatDot: { width: 22, height: 22, borderRadius: 11 },
  rhythmArea: { alignItems: "center", gap: 8 },
  rhythmBtn: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: "#dbeafe",
    borderWidth: 3, borderColor: "#0ea5e9", alignItems: "center", justifyContent: "center",
  },
  rhythmBtnLit: { backgroundColor: "#f59e0b", borderColor: "#d97706" },
  holdArea: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: "#fef3c7",
    borderWidth: 3, borderColor: "#f59e0b", alignItems: "center", justifyContent: "center", gap: 8,
  },
  holdTrack: { width: 100, height: 10, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 5, overflow: "hidden" },
  holdFill: { height: "100%", backgroundColor: "#f59e0b", borderRadius: 5 },
  swipeArea: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: "#ede9fe",
    borderWidth: 3, borderColor: "#7c3aed", alignItems: "center", justifyContent: "center", gap: 8,
  },
});

// ── Main screen ──────────────────────────────────────────────────────────────
export const WildlifeCollectorGame = () => {
  const { session } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh, spend } = useGameGP(session);

  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Animal | null>(null);
  const [captureState, setCaptureState] = useState<"idle" | "capturing" | "captured">("idle");
  const [captureAttempts, setCaptureAttempts] = useState(0);
  const [unlocking, setUnlocking] = useState(false);

  const storageKey = session ? STORAGE_PREFIX + session.user.id : STORAGE_PREFIX + "anon";

  useFocusEffect(useCallback(() => {
    void refresh();
    AsyncStorage.getItem(storageKey).then((raw) => { if (raw) setCollected(new Set(JSON.parse(raw))); });
  }, [refresh]));

  const openAnimal = (a: Animal) => {
    setSelected(a);
    setCaptureState("idle");
    setCaptureAttempts(0);
  };

  const startCapture = () => setCaptureState("capturing");

  const onCaptureSuccess = () => {
    setCaptureState("captured");
  };

  const onCaptureFail = () => {
    const attempts = captureAttempts + 1;
    setCaptureAttempts(attempts);
    if (attempts >= 3) {
      setCaptureState("idle"); // fall back to offer skip
    } else {
      setTimeout(() => setCaptureState("capturing"), 800);
    }
  };

  const unlock = async (skipCapture = false) => {
    if (!selected || unlocking) return;
    setUnlocking(true);
    const cost = skipCapture ? selected.gp + 20 : selected.gp;
    const ok = await spend(cost, `unlock_${selected.id}`, "wildlife_collector");
    if (!ok) {
      Alert.alert("Not enough GP", `You need ${cost} GP.`);
      setUnlocking(false);
      return;
    }
    const next = new Set([...collected, selected.id]);
    setCollected(next);
    await AsyncStorage.setItem(storageKey, JSON.stringify([...next]));
    setUnlocking(false);
    setSelected(null);
  };

  const rarityGroups: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

  return (
    <View style={s.root}>
      <SystemBars style="light" />
      <LinearGradient colors={["#4a1d96", "#5b21b6", "#7c3aed"]} style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={s.headerTitle}>🦋 Wildlife Collector</Text>
          <View style={s.gpChip}><Text style={s.gpText}>🌿 {loading ? "—" : gpBalance}</Text></View>
        </View>
        <View style={s.progress}>
          <Text style={s.progressText}>{collected.size}/{ANIMALS.length} animals collected</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(collected.size / ANIMALS.length) * 100}%` as any }]} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}>
        {/* Habitat */}
        <View style={s.habitat}>
          <LinearGradient colors={["#bbf7d0", "#a7f3d0", "#6ee7b7"]} style={s.habitatBg}>
            {collected.size === 0
              ? <Text style={s.habitatEmpty}>Unlock animals to populate your habitat</Text>
              : <View style={s.habitatAnimals}>
                  {ANIMALS.filter((a) => collected.has(a.id)).map((a) => (
                    <Text key={a.id} style={s.habitatEmoji}>{a.emoji}</Text>
                  ))}
                </View>
            }
          </LinearGradient>
        </View>

        {rarityGroups.map((rarity) => {
          const group = ANIMALS.filter((a) => a.rarity === rarity);
          return (
            <View key={rarity} style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.stars}>{RARITY_STARS[rarity]}</Text>
                <Text style={s.rarityLabel}>{rarity}</Text>
                <Text style={s.rarityCount}>{group.filter((a) => collected.has(a.id)).length}/{group.length}</Text>
              </View>
              <View style={s.grid}>
                {group.map((animal) => {
                  const isCollected = collected.has(animal.id);
                  return (
                    <Pressable key={animal.id} onPress={() => openAnimal(animal)}
                      style={({ pressed }) => [s.card, pressed && s.pressed, isCollected && s.cardOwned]}>
                      <LinearGradient colors={isCollected ? RARITY_COLOR[animal.rarity] : ["#e5e7eb", "#d1d5db"]} style={s.cardGrad}>
                        <Text style={[s.cardEmoji, !isCollected && s.locked]}>
                          {isCollected ? animal.emoji : "🔒"}
                        </Text>
                        <Text style={[s.cardName, !isCollected && s.lockedTxt]}>
                          {isCollected ? animal.name : "???"}
                        </Text>
                        {!isCollected && (
                          <View style={s.costBadge}><Text style={s.costTxt}>{animal.gp} GP</Text></View>
                        )}
                        {isCollected && <Ionicons name="checkmark-circle" size={16} color="rgba(255,255,255,0.9)" />}
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Detail + capture modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelected(null)}>
          <View style={s.sheet} onStartShouldSetResponder={() => true}>
            {selected && (
              <>
                <View style={s.handle} />

                {captureState === "idle" && (
                  <>
                    <Text style={s.modalEmoji}>{collected.has(selected.id) ? selected.emoji : "🔒"}</Text>
                    <Text style={s.modalName}>{selected.name}</Text>
                    <View style={[s.rarityBadge, { backgroundColor: RARITY_COLOR[selected.rarity][0] }]}>
                      <Text style={s.rarityBadgeTxt}>{RARITY_STARS[selected.rarity]} {selected.rarity}</Text>
                    </View>
                    <Text style={s.habitatLine}>🏕️ Habitat: {selected.habitat}</Text>
                    <Text style={s.factLine}>{selected.fact}</Text>

                    {!collected.has(selected.id) && (
                      <>
                        <View style={s.captureHint}>
                          <Text style={s.captureHintTxt}>🎯 Complete the capture challenge to unlock!</Text>
                          <Text style={s.captureHintSub}>{CAPTURE_INSTRUCTIONS[selected.capture]}</Text>
                        </View>
                        {captureAttempts >= 3 && (
                          <Text style={s.failNote}>3 attempts used. Skip for +20 GP or try again.</Text>
                        )}
                        <View style={s.modalBtns}>
                          <Pressable onPress={startCapture}
                            style={({ pressed }) => [s.captureBtn, pressed && s.pressed]}>
                            <LinearGradient colors={RARITY_COLOR[selected.rarity]} style={s.captureBtnGrad}>
                              <Text style={s.captureBtnTxt}>
                                {captureAttempts >= 3 ? "↺ Retry Challenge" : "🎯 Start Capture"}
                              </Text>
                            </LinearGradient>
                          </Pressable>
                          {captureAttempts >= 3 && (
                            <Pressable onPress={() => unlock(true)}
                              style={({ pressed }) => [s.skipBtn, pressed && s.pressed]}>
                              <Text style={s.skipTxt}>Skip (+20 GP) = {selected.gp + 20} GP</Text>
                            </Pressable>
                          )}
                        </View>
                      </>
                    )}
                    {collected.has(selected.id) && (
                      <View style={s.ownedBanner}>
                        <Ionicons name="checkmark-circle" size={20} color="#2aa852" />
                        <Text style={s.ownedTxt}>In your habitat!</Text>
                      </View>
                    )}
                  </>
                )}

                {captureState === "capturing" && (
                  <CaptureGame animal={selected} onSuccess={onCaptureSuccess} onFail={onCaptureFail} />
                )}

                {captureState === "captured" && (
                  <>
                    <Text style={s.modalEmoji}>{selected.emoji}</Text>
                    <Text style={s.modalName}>{selected.name} — Captured!</Text>
                    <Text style={s.captureSuccessTxt}>
                      Amazing! Now spend {selected.gp} GP to add it to your habitat.
                    </Text>
                    <Pressable onPress={() => unlock(false)} disabled={unlocking}
                      style={({ pressed }) => [s.captureBtn, pressed && s.pressed]}>
                      <LinearGradient colors={RARITY_COLOR[selected.rarity]} style={s.captureBtnGrad}>
                        <Text style={s.captureBtnTxt}>
                          {unlocking ? "Unlocking…" : `✨ Unlock for ${selected.gp} GP`}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f3ff" },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "900", color: "#fff" },
  gpChip: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  gpText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  progress: { gap: 6 },
  progressText: { fontSize: 11, color: "rgba(255,255,255,0.8)" },
  progressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#f59e0b", borderRadius: 3 },
  scroll: { padding: 14, gap: 16 },
  habitat: { borderRadius: 16, overflow: "hidden", elevation: 2 },
  habitatBg: { height: 96, justifyContent: "center", alignItems: "center" },
  habitatEmpty: { fontSize: 12, color: "#35564a", fontStyle: "italic" },
  habitatAnimals: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4, padding: 6 },
  habitatEmoji: { fontSize: 28 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  stars: { fontSize: 12 },
  rarityLabel: { fontSize: 12, fontWeight: "800", color: "#1a3328" },
  rarityCount: { fontSize: 11, color: "#6b7280", marginLeft: "auto" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "30%", borderRadius: 14, overflow: "hidden", elevation: 2 },
  cardOwned: { elevation: 4 },
  cardGrad: { padding: 12, alignItems: "center", gap: 4, minHeight: 100 },
  cardEmoji: { fontSize: 34 },
  locked: { opacity: 0.35 },
  cardName: { fontSize: 10, fontWeight: "800", color: "#fff", textAlign: "center" },
  lockedTxt: { color: "#6b7280" },
  costBadge: { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  costTxt: { fontSize: 10, fontWeight: "800", color: "#fff" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: "center", gap: 10, maxHeight: "90%" },
  handle: { width: 40, height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, marginBottom: 6 },
  modalEmoji: { fontSize: 64 },
  modalName: { fontSize: 20, fontWeight: "900", color: "#1a3328" },
  rarityBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  rarityBadgeTxt: { fontSize: 12, fontWeight: "800", color: "#fff" },
  habitatLine: { fontSize: 13, color: "#35564a" },
  factLine: { fontSize: 13, color: "#374151", textAlign: "center", lineHeight: 20, fontStyle: "italic", paddingHorizontal: 8 },
  captureHint: { backgroundColor: "#f0fdf4", borderRadius: 12, padding: 12, alignItems: "center", gap: 4, width: "100%" },
  captureHintTxt: { fontSize: 13, fontWeight: "800", color: "#1a3328" },
  captureHintSub: { fontSize: 11, color: "#35564a", textAlign: "center" },
  failNote: { fontSize: 12, color: "#dc2626", textAlign: "center" },
  modalBtns: { width: "100%", gap: 8 },
  captureBtn: { width: "100%", borderRadius: 14, overflow: "hidden" },
  captureBtnGrad: { paddingVertical: 14, alignItems: "center" },
  captureBtnTxt: { fontSize: 15, fontWeight: "900", color: "#fff" },
  skipBtn: { width: "100%", backgroundColor: "#fef3c7", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#fcd34d" },
  skipTxt: { fontSize: 13, fontWeight: "700", color: "#b45309" },
  captureSuccessTxt: { fontSize: 13, color: "#15803d", textAlign: "center" },
  ownedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#d1fae5", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  ownedTxt: { fontSize: 14, fontWeight: "800", color: "#2aa852" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
