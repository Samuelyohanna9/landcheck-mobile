/**
 * Ozone Defenders 🌍⚡
 * CO₂ monsters rise from the ground toward the atmosphere.
 * Answer environmental quiz questions correctly to grow trees that block them.
 *
 * Correct answer → trees grow, pushing CO₂ monster back down 🌲
 * Wrong answer   → monster grows and surges closer to the atmosphere ☠️
 *
 * GP earn: +3 per correct answer | +5 every 3-in-a-row streak | +15 round win
 * GP lose: -1 wrong answer (if balance > 0)
 * GP unlocks: Tree Shield (20 GP) | Hint (10 GP) | Rapid Reforestation (30 GP)
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, Vibration, ScrollView, Easing,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

const { width: W, height: H } = Dimensions.get("window");
const PLAY_H = H * 0.34;        // height of the animated game field
const QUESTIONS_PER_ROUND = 10;
const CO2_MONSTER_SPRITE = require("../../assets/games/co2-monster.png");
const MONSTER_PASSIVE_RISE_INTERVAL_MS = 950;
const MONSTER_PASSIVE_RISE_STEP = 4.1;
const MONSTER_MOVE_DURATION_MS = 260;
const MONSTER_FRAME_HEIGHT = 214;
const MONSTER_TOP_SAFE_Y = 18;
const MONSTER_BOTTOM_SAFE_MARGIN = 14;
const MISSILE_START_Y = -170;
const GROUND_DECOR_TREES = [
  { left: "8%", size: 28, bottom: 16, opacity: 0.42, icon: "🌲" },
  { left: "19%", size: 22, bottom: 22, opacity: 0.34, icon: "🌿" },
  { left: "33%", size: 30, bottom: 20, opacity: 0.4, icon: "🌳" },
  { left: "48%", size: 25, bottom: 14, opacity: 0.38, icon: "🌲" },
  { left: "62%", size: 21, bottom: 24, opacity: 0.3, icon: "🌿" },
  { left: "76%", size: 29, bottom: 18, opacity: 0.4, icon: "🌳" },
  { left: "87%", size: 23, bottom: 16, opacity: 0.34, icon: "🌲" },
];

const getMonsterTranslateY = (progress: number) => {
  const ratio = Math.max(0, Math.min(100, progress)) / 100;
  const floorY = Math.max(MONSTER_TOP_SAFE_Y, PLAY_H - MONSTER_FRAME_HEIGHT - MONSTER_BOTTOM_SAFE_MARGIN);
  return floorY + (MONSTER_TOP_SAFE_Y - floorY) * ratio;
};

// ── Quiz bank ────────────────────────────────────────────────────────────────
type QDef = { q: string; answer: string; wrong: [string, string, string] };

const QUIZ_BANK: QDef[] = [
  { q: "What does CO₂ stand for?", answer: "Carbon Dioxide", wrong: ["Carbon Monoxide", "Calcium Oxide", "Cobalt Dioxide"] },
  { q: "The ozone layer is found in which layer of the atmosphere?", answer: "Stratosphere", wrong: ["Troposphere", "Mesosphere", "Exosphere"] },
  { q: "Which chemical compound primarily destroys the ozone layer?", answer: "CFCs (Chlorofluorocarbons)", wrong: ["CO₂ (Carbon Dioxide)", "SO₂ (Sulfur Dioxide)", "H₂O (Water Vapor)"] },
  { q: "Trees help fight climate change by doing what with CO₂?", answer: "Absorbing (sequestering) it", wrong: ["Releasing it", "Reflecting it", "Converting it to methane"] },
  { q: "What international treaty protects the ozone layer?", answer: "Montreal Protocol (1987)", wrong: ["Kyoto Protocol", "Paris Agreement", "Geneva Convention"] },
  { q: "The Paris Agreement aims to limit warming to...", answer: "1.5–2°C above pre-industrial", wrong: ["0.5°C above pre-industrial", "3°C above pre-industrial", "5°C above pre-industrial"] },
  { q: "Deforestation increases atmospheric CO₂ because...", answer: "Trees release stored carbon when cut/burned", wrong: ["Trees absorb more oxygen", "Trees produce methane", "Trees reflect sunlight"] },
  { q: "Which human sector produces the most greenhouse gases globally?", answer: "Energy production (electricity & heat)", wrong: ["Aviation", "Agriculture", "Construction"] },
  { q: "Approximately what fraction of Earth's atmosphere is CO₂?", answer: "About 0.04% (420 ppm)", wrong: ["About 4%", "About 21%", "About 78%"] },
  { q: "Ocean acidification happens when oceans absorb...", answer: "CO₂ from the atmosphere", wrong: ["Sulfur pollutants", "Radioactive waste", "Salt from rivers"] },
  { q: "Which renewable energy source directly uses sunlight?", answer: "Solar (photovoltaic) power", wrong: ["Wind turbines", "Hydropower", "Geothermal energy"] },
  { q: "Global sea levels are rising mainly due to...", answer: "Melting ice caps & thermal expansion of water", wrong: ["Increased rainfall alone", "Tidal shifts", "Ocean floor sinking"] },
  { q: "Net-zero emissions means...", answer: "Emissions equal carbon removed from atmosphere", wrong: ["Zero electricity use", "No vehicles allowed", "Banning fossil fuels immediately"] },
  { q: "Which ecosystem stores the most carbon per unit area?", answer: "Tropical rainforests", wrong: ["Deserts", "Grasslands", "Tundra"] },
  { q: "Acid rain is mainly caused by which pollutant gas?", answer: "Sulfur dioxide (SO₂)", wrong: ["CO₂", "Oxygen (O₂)", "Nitrogen (N₂)"] },
  { q: "What does IPCC stand for?", answer: "Intergovernmental Panel on Climate Change", wrong: ["International Petroleum Carbon Council", "Independent Protocol on Carbon Credits", "International Panel for Climate Control"] },
  { q: "Melting permafrost releases large amounts of...", answer: "Methane (CH₄)", wrong: ["Oxygen", "Nitrogen", "CO₂ only"] },
  { q: "Which country has the highest TOTAL CO₂ emissions today?", answer: "China", wrong: ["United States", "India", "Russia"] },
  { q: "Carbon capture technology aims to...", answer: "Remove CO₂ from the atmosphere or industry stacks", wrong: ["Capture solar energy", "Filter ocean plastic", "Reduce noise pollution"] },
  { q: "Photosynthesis converts CO₂ into...", answer: "Oxygen and glucose (sugar)", wrong: ["Methane", "Water only", "Nitrogen gas"] },
  { q: "The Great Barrier Reef is threatened mainly by...", answer: "Ocean warming causing coral bleaching", wrong: ["Overfishing alone", "Oil drilling spills", "Freshwater flooding"] },
  { q: "Electric vehicles reduce carbon because they...", answer: "Don't burn fossil fuels directly", wrong: ["Produce zero emissions ever", "Recharge from the sun only", "Use hydrogen combustion"] },
  { q: "Which of these is the 'strongest' greenhouse gas per molecule?", answer: "SF₆ (Sulfur Hexafluoride)", wrong: ["CO₂", "Water vapor", "Oxygen"] },
  { q: "What natural phenomenon can cool the climate temporarily by blocking sunlight?", answer: "Volcanic eruptions (ash/SO₂ in stratosphere)", wrong: ["Heavy rainfall", "Earthquakes", "Hurricanes"] },
  { q: "A carbon footprint measures...", answer: "Total greenhouse gas emissions from an activity/person", wrong: ["How much carbon is in soil", "Fossil fuel reserves underground", "Ocean pH levels"] },
  { q: "COP in climate negotiations stands for...", answer: "Conference of the Parties", wrong: ["Carbon Output Protocol", "Climate Operations Plan", "Council of Polluters"] },
  { q: "Which transport is most carbon-efficient per passenger?", answer: "Train (rail)", wrong: ["Car", "Short-haul airplane", "Motorbike"] },
  { q: "The 'global carbon cycle' describes...", answer: "CO₂ moving between atmosphere, land, ocean & life", wrong: ["Recycling carbon products", "Cycling races powered by carbon", "Car fuel efficiency ratings"] },
  { q: "By how much have global average temperatures risen since pre-industrial?", answer: "About 1.1–1.2°C", wrong: ["About 0.1°C", "About 0.5°C", "About 3°C"] },
  { q: "Which household action saves the most personal CO₂ per year?", answer: "Switching from long-haul flights to train / going car-free", wrong: ["Using paper bags", "Turning off lights", "Recycling paper"] },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type ActiveQ = { q: string; opts: string[]; correct: number };

function pickQuestion(def: QDef): ActiveQ {
  const opts = shuffle([def.answer, ...def.wrong]);
  return { q: def.q, opts, correct: opts.indexOf(def.answer) };
}

type Phase = "idle" | "playing" | "answered" | "victory" | "over";
type Feedback = "correct" | "wrong" | null;

// ── Module-level tree row ────────────────────────────────────────────────────
type TreeRowProps = { count: number; pushAnim: Animated.Value };

const TreeRow = React.memo(({ count, pushAnim }: TreeRowProps) => {
  const maxTrees = 8;
  const shown = Math.min(count, maxTrees);
  return (
    <Animated.View style={[{
      flexDirection: "row", justifyContent: "center", alignItems: "flex-end",
      paddingBottom: 4, transform: [{ translateY: pushAnim }],
    }]}>
      {Array.from({ length: shown }, (_, i) => (
        <Text key={i} style={{ fontSize: 28 + (i % 2) * 4, marginHorizontal: 2 }}>🌲</Text>
      ))}
    </Animated.View>
  );
});

type GroundMistProps = { swirls: Animated.Value[] };

const GroundMist = React.memo(({ swirls }: GroundMistProps) => (
  <View pointerEvents="none" style={s.gasField}>
    {swirls.map((anim, idx) => {
      const travelX = idx % 2 === 0 ? 38 : -34;
      const translateX = anim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [travelX * -0.6, travelX, travelX * -0.45],
      });
      const translateY = anim.interpolate({
        inputRange: [0, 0.45, 1],
        outputRange: [14 + idx * 2, -26 - idx * 6, -8],
      });
      const scale = anim.interpolate({
        inputRange: [0, 0.55, 1],
        outputRange: [0.75, 1.18, 0.9],
      });
      const rotate = anim.interpolate({
        inputRange: [0, 1],
        outputRange: idx % 2 === 0 ? ["0deg", "180deg"] : ["0deg", "-180deg"],
      });
      const opacity = anim.interpolate({
        inputRange: [0, 0.35, 0.7, 1],
        outputRange: [0.15, 0.34, 0.24, 0.1],
      });
      return (
        <Animated.View
          key={`gas-${idx}`}
          style={[
            s.gasSwirl,
            idx % 2 === 0 ? s.gasSwirlLeft : s.gasSwirlRight,
            {
              opacity,
              transform: [{ translateX }, { translateY }, { scale }, { rotate }],
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(187,247,208,0.4)", "rgba(34,197,94,0.22)", "rgba(21,128,61,0.04)"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.15, y: 0.2 }}
            end={{ x: 0.9, y: 1 }}
          />
          <View style={s.gasSwirlHalo} />
        </Animated.View>
      );
    })}
  </View>
));

// ── Module-level Monster ─────────────────────────────────────────────────────
type MonsterProps = { posAnim: Animated.Value; scaleAnim: Animated.Value; hp: number };

const Monster = React.memo(({ posAnim, scaleAnim, hp }: MonsterProps) => {
  const monsterY = posAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [getMonsterTranslateY(0), getMonsterTranslateY(100)],
  });

  const hpColor = hp > 60 ? "#4ade80" : hp > 30 ? "#fbbf24" : "#f87171";

  // Split into two Animated.Views: outer uses non-native (translateY),
  // inner uses native driver (scale). Mixing drivers on the same View errors.
  return (
    <Animated.View style={{
      position: "absolute", left: 0, right: 0,
      alignItems: "center",
      transform: [{ translateY: monsterY }],
    }}>
      <Animated.View style={{
        alignItems: "center",
        transform: [{ scale: scaleAnim }],
      }}>
        <View style={s.monsterFrame}>
          <View style={s.monsterHeadHud}>
            <Text style={s.monsterHpText}>{Math.max(0, Math.round(hp))}%</Text>
            <View style={s.monsterHpTrack}>
              <View style={[s.monsterHpFill, { width: `${hp}%` as const, backgroundColor: hpColor }]} />
            </View>
          </View>
          <View style={s.monsterAura} />
          <Image source={CO2_MONSTER_SPRITE} style={s.monsterSprite} contentFit="contain" />
          <View style={s.monsterTag}>
            <Text style={s.monsterTagText}>CO2 MONSTER</Text>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

// ── Main game ────────────────────────────────────────────────────────────────
export const ClimateDefenderGame = () => {
  const { session } = useAuth();
  const { gpBalance, refresh: refreshGP, spend, earn } = useGameGP(session);
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState<ActiveQ | null>(null);
  const [queuedBank, setQueuedBank] = useState<QDef[]>([]);
  const [qNum, setQNum] = useState(0);             // current question #
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [treeCount, setTreeCount] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [feedbackIdx, setFeedbackIdx] = useState(-1);
  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const [shielded, setShielded] = useState(false);
  const [msg, setMsg] = useState("");
  const [monsterHP, setMonsterHP] = useState(100); // 0-100, percentage

  // Animated values
  const monsterPos = useRef(new Animated.Value(0)).current;  // 0=ground 100=atm
  const monsterScale = useRef(new Animated.Value(1)).current;
  const atmosphereShake = useRef(new Animated.Value(0)).current;
  const treePush = useRef(new Animated.Value(0)).current;
  const shieldPulse = useRef(new Animated.Value(1)).current;
  const missileY = useRef(new Animated.Value(MISSILE_START_Y)).current;
  const missileOpacity = useRef(new Animated.Value(0)).current;
  const impactY = useRef(new Animated.Value(MISSILE_START_Y)).current;
  const impactOpacity = useRef(new Animated.Value(0)).current;
  const impactScale = useRef(new Animated.Value(0.35)).current;
  const gasSwirls = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const monsterPosNum = useRef(0);
  const monsterHpRef = useRef(monsterHP);
  monsterHpRef.current = monsterHP;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shieldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const shieldedRef = useRef(shielded);
  shieldedRef.current = shielded;

  useFocusEffect(useCallback(() => { refreshGP(); }, [refreshGP]));

  // Monster passive rise timer
  useEffect(() => {
    if (phase !== "playing" && phase !== "answered") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      if (shieldedRef.current || phaseRef.current === "answered") return;
      moveMonster(monsterPosNum.current + MONSTER_PASSIVE_RISE_STEP);
    }, MONSTER_PASSIVE_RISE_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Shield pulse animation
  useEffect(() => {
    if (!shielded) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(shieldPulse, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(shieldPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [shielded]);

  useEffect(() => {
    const loops = gasSwirls.map((anim, idx) => {
      anim.setValue((idx * 0.18) % 1);
      const loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: 3000 + idx * 420,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        { resetBeforeIteration: true }
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(loop => loop.stop());
  }, [gasSwirls]);

  function moveMonster(pos: number, animated = true) {
    const clamped = Math.max(0, Math.min(100, pos));
    monsterPosNum.current = clamped;
    if (animated) {
      Animated.timing(monsterPos, { toValue: clamped, duration: MONSTER_MOVE_DURATION_MS, useNativeDriver: false }).start();
    } else {
      monsterPos.setValue(clamped);
    }
    if (clamped >= 100) {
      endGame(false);
    }
  }

  function flash(txt: string, ms = 2400) {
    setMsg(txt);
    if (msgRef.current) clearTimeout(msgRef.current);
    msgRef.current = setTimeout(() => setMsg(""), ms);
  }

  function triggerMissileStrike(targetPos: number) {
    return new Promise<void>(resolve => {
      const impactTargetY = getMonsterTranslateY(targetPos) + 72;
      missileY.setValue(MISSILE_START_Y);
      missileOpacity.setValue(1);
      impactY.setValue(impactTargetY);
      impactOpacity.setValue(0);
      impactScale.setValue(0.35);
      Animated.sequence([
        Animated.timing(missileY, {
          toValue: impactTargetY - 16,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(missileOpacity, {
            toValue: 0,
            duration: 70,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(impactOpacity, {
              toValue: 1,
              duration: 70,
              useNativeDriver: true,
            }),
            Animated.timing(impactOpacity, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(impactScale, {
              toValue: 1.08,
              duration: 110,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(impactScale, {
              toValue: 1.65,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(() => resolve());
    });
  }

  function startGame() {
    const bank = shuffle([...QUIZ_BANK]);
    setQueuedBank(bank);
    setQNum(0);
    setStreak(0);
    setScore(0);
    setTreeCount(1);
    setFeedback(null);
    setEliminated(new Set());
    setShielded(false);
    setMonsterHP(100);
    moveMonster(0, false);
    monsterScale.setValue(1);
    missileOpacity.setValue(0);
    impactOpacity.setValue(0);
    impactScale.setValue(0.35);
    setPhase("playing");
    setQuestion(pickQuestion(bank[0]));
  }

  function loadNextQuestion(bank: QDef[], idx: number) {
    // Don't restart if game already ended (endGame may have fired before this timeout)
    if (phaseRef.current === "over" || phaseRef.current === "victory") return;

    setFeedback(null);
    setFeedbackIdx(-1);
    setEliminated(new Set());

    if (idx >= QUESTIONS_PER_ROUND) {
      endGame(true);
      return;
    }
    const def = bank[idx % bank.length];
    setQuestion(pickQuestion(def));
    setPhase("playing");
  }

  async function handleAnswer(optIdx: number) {
    if (phase !== "playing" || !question) return;
    setPhase("answered");
    setFeedbackIdx(optIdx);

    if (optIdx === question.correct) {
      // Correct
      const newStreak = streak + 1;
      setStreak(newStreak);
      setFeedback("correct");
      Vibration.vibrate([0, 40, 40, 80]);
      await triggerMissileStrike(monsterPosNum.current);

      // Trees grow and push monster back
      const pushBack = 10 + treeCount * 1.5;
      setTreeCount(t => Math.min(t + 1, 12));
      moveMonster(monsterPosNum.current - pushBack);

      // Monster shrinks slightly
      Animated.sequence([
        Animated.timing(monsterScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
        Animated.timing(monsterScale, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      // Tree push animation
      Animated.sequence([
        Animated.timing(treePush, { toValue: -12, duration: 150, useNativeDriver: true }),
        Animated.timing(treePush, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      // Earn GP
      let gp = 3;
      if (newStreak % 3 === 0) gp += 5;
      await earn(gp, "correct_answer", "climate_defender");
      const newScore = score + gp;
      setScore(newScore);

      const hp = Math.max(0, monsterHpRef.current - 15);
      setMonsterHP(hp);
      if (hp <= 0) {
        flash("💥 Direct hit! CO₂ monster neutralized!");
        await endGame(true);
        return;
      }
      flash(
        newStreak % 3 === 0
          ? `🔥 ${newStreak}-streak! Missile hit! +${gp} GP`
          : `✅ Direct hit! +${gp} GP`
      );

    } else {
      // Wrong
      setStreak(0);
      setFeedback("wrong");
      Vibration.vibrate([0, 80, 80, 80]);

      // Monster surges forward and grows
      const surge = 14;
      moveMonster(monsterPosNum.current + surge);
      setMonsterHP(h => Math.min(100, h + 10));

      Animated.sequence([
        Animated.timing(monsterScale, { toValue: 1.35, duration: 200, useNativeDriver: true }),
        Animated.timing(atmosphereShake, { toValue: 6, duration: 80, useNativeDriver: true }),
        Animated.timing(atmosphereShake, { toValue: -6, duration: 80, useNativeDriver: true }),
        Animated.timing(atmosphereShake, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.timing(monsterScale, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      // Lose 1 GP if they have any
      if (gpBalance > 0) {
        await spend(1, "wrong_answer", "climate_defender");
      }
      flash("❌ Wrong! CO₂ surges upward! -1 GP");
    }

    // Advance to next question after delay
    setTimeout(() => {
      const nextIdx = qNum + 1;
      setQNum(nextIdx);
      loadNextQuestion(queuedBank, nextIdx);
    }, 1800);
  }

  async function endGame(won: boolean) {
    if (phaseRef.current === "victory" || phaseRef.current === "over") return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (won) {
      setPhase("victory");
      await earn(15, "round_win", "climate_defender");
      Vibration.vibrate([0, 100, 60, 100, 60, 200]);
    } else {
      setPhase("over");
      Vibration.vibrate([0, 200, 100, 200]);
    }
  }

  // ── Powerups ────────────────────────────────────────────────────────────
  async function useShield() {
    const ok = await spend(20, "tree_shield", "climate_defender");
    if (!ok) { flash("Need 20 GP for Tree Shield!"); return; }
    setShielded(true);
    flash("🛡️ Tree Shield active — monster paused 10s!");
    if (shieldRef.current) clearTimeout(shieldRef.current);
    shieldRef.current = setTimeout(() => {
      setShielded(false);
      flash("Shield expired!");
    }, 10000);
  }

  async function useHint() {
    if (!question) return;
    const ok = await spend(10, "hint", "climate_defender");
    if (!ok) { flash("Need 10 GP for a hint!"); return; }
    const wrongOpts = question.opts
      .map((_, i) => i)
      .filter(i => i !== question.correct && !eliminated.has(i));
    if (wrongOpts.length < 2) { flash("Not enough wrong answers to eliminate!"); return; }
    const toElim = shuffle(wrongOpts).slice(0, 2);
    setEliminated(new Set(toElim));
    flash("💡 2 wrong answers removed!");
  }

  async function useReforestation() {
    const ok = await spend(30, "rapid_reforestation", "climate_defender");
    if (!ok) { flash("Need 30 GP for Rapid Reforestation!"); return; }
    setTreeCount(t => Math.min(t + 3, 12));
    moveMonster(monsterPosNum.current - 25);
    const hp = Math.max(0, monsterHpRef.current - 25);
    setMonsterHP(hp);
    Animated.sequence([
      Animated.timing(treePush, { toValue: -20, duration: 200, useNativeDriver: true }),
      Animated.timing(treePush, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    flash("🌳🌳🌳 Rapid Reforestation! Monster pushed back!");
    Vibration.vibrate([0, 80, 50, 80, 50, 80]);
    if (hp <= 0) {
      await endGame(true);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const dangerLevel = monsterPosNum.current;
  const skyColor1 = dangerLevel < 40 ? "#0ea5e9" : dangerLevel < 70 ? "#f59e0b" : "#ef4444";
  const skyColor2 = dangerLevel < 40 ? "#38bdf8" : dangerLevel < 70 ? "#fbbf24" : "#dc2626";

  return (
    <View style={s.root}>
      <LinearGradient colors={["#0f172a", "#1e3a5f", "#134e4a"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.title}>🌍 Ozone Defenders</Text>
          {phase !== "idle" && (
            <Text style={s.subtitle}>Q{qNum}/{QUESTIONS_PER_ROUND} · Streak {streak} 🔥</Text>
          )}
        </View>
        <View style={s.gpBadge}>
          <Text style={s.gpText}>🟢 {gpBalance} GP</Text>
        </View>
      </View>

      {/* Flash message */}
      {msg !== "" && (
        <View style={s.msgBar}><Text style={s.msgText}>{msg}</Text></View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* IDLE screen */}
        {phase === "idle" && (
          <View style={s.card}>
            <Text style={s.bigEmoji}>🌍</Text>
            <Text style={s.cardTitle}>Ozone Defenders</Text>
            <Text style={s.cardBody}>
              CO₂ monsters are rising toward the atmosphere! Answer climate questions to grow trees that block them.
            </Text>
            <View style={s.divider} />
            <Text style={[s.cardBody, { fontWeight: "700", color: "#7dd3fc" }]}>How to play</Text>
            <Text style={s.ruleRow}>✅ Correct answer → Trees grow, CO₂ pushed back</Text>
            <Text style={s.ruleRow}>❌ Wrong answer → Monster surges forward</Text>
            <Text style={s.ruleRow}>🏆 Answer {QUESTIONS_PER_ROUND} questions to win a round</Text>
            <Text style={s.ruleRow}>💀 Don't let CO₂ reach the atmosphere!</Text>
            <View style={s.divider} />
            <Text style={[s.cardBody, { fontWeight: "700", color: "#86efac" }]}>GP Rewards</Text>
            <Text style={s.ruleRow}>+3 GP per correct answer</Text>
            <Text style={s.ruleRow}>+5 GP bonus every 3-in-a-row streak</Text>
            <Text style={s.ruleRow}>+15 GP for completing a full round</Text>
            <Text style={s.ruleRow}>-1 GP for each wrong answer</Text>
            <TouchableOpacity style={s.ctaBtn} onPress={startGame}>
              <Text style={s.ctaBtnText}>🌿 Start Game — Free!</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Game field — shown during play, answered, victory, over */}
        {phase !== "idle" && (
          <>
            {/* Atmosphere bar */}
            <Animated.View style={[s.atmosphereBar, { transform: [{ translateX: atmosphereShake }] }]}>
              <LinearGradient
                colors={[skyColor1, skyColor2]}
                style={s.atmosphereGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={s.atmosphereLabel}>🌤️ ATMOSPHERE</Text>
                <View style={s.dangerRow}>
                  <View style={[s.dangerFill, { width: `${dangerLevel}%` as any }]} />
                </View>
                <Text style={s.atmosphereSub}>CO₂ proximity: {Math.round(dangerLevel)}%</Text>
              </LinearGradient>
            </Animated.View>

            {/* Game field */}
            <View style={[s.gameField, { height: PLAY_H }]}>
              <LinearGradient
                colors={["rgba(14,165,233,0.15)", "rgba(22,101,52,0.4)"]}
                style={StyleSheet.absoluteFill}
              />
              {/* Monster */}
              {(phase === "playing" || phase === "answered") && (
                <Monster posAnim={monsterPos} scaleAnim={monsterScale} hp={monsterHP} />
              )}
              <Animated.View
                pointerEvents="none"
                style={[
                  s.missileLane,
                  {
                    opacity: missileOpacity,
                    transform: [{ translateY: missileY }],
                  },
                ]}
              >
                <View style={s.missileBody}>
                  <View style={s.missileTip} />
                  <View style={s.missileShell} />
                  <LinearGradient
                    colors={["rgba(250,204,21,0.95)", "rgba(249,115,22,0.12)"]}
                    style={s.missileFlame}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                </View>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  s.impactBurst,
                  {
                    opacity: impactOpacity,
                    transform: [{ translateY: impactY }, { scale: impactScale }],
                  },
                ]}
              >
                <View style={s.impactRing} />
                <View style={s.impactSpark} />
              </Animated.View>
              {/* Shield overlay */}
              {shielded && (
                <Animated.View style={[s.shieldOverlay, { transform: [{ scale: shieldPulse }] }]}>
                  <Text style={{ fontSize: 24 }}>🛡️</Text>
                </Animated.View>
              )}
              {/* Ground + trees */}
              <View style={s.groundRow}>
                <LinearGradient colors={["#14532d", "#15803d", "#166534"]} style={s.ground}>
                  <GroundMist swirls={gasSwirls} />
                  <View pointerEvents="none" style={s.groundBackdropTrees}>
                    {GROUND_DECOR_TREES.map(tree => (
                      <Text
                        key={`${tree.left}-${tree.icon}`}
                        style={[
                          s.decorTree,
                          {
                            left: tree.left as any,
                            bottom: tree.bottom,
                            fontSize: tree.size,
                            opacity: tree.opacity,
                          },
                        ]}
                      >
                        {tree.icon}
                      </Text>
                    ))}
                  </View>
                  <TreeRow count={treeCount} pushAnim={treePush} />
                </LinearGradient>
              </View>
            </View>

            {/* Score bar */}
            <View style={s.statsBar}>
              <View style={s.stat}><Text style={s.statVal}>{score}</Text><Text style={s.statLbl}>Score GP</Text></View>
              <View style={s.stat}><Text style={s.statVal}>{streak}</Text><Text style={s.statLbl}>Streak 🔥</Text></View>
              <View style={s.stat}><Text style={s.statVal}>{treeCount}</Text><Text style={s.statLbl}>Trees 🌲</Text></View>
            </View>

            {/* Quiz panel */}
            {(phase === "playing" || phase === "answered") && question && (
              <View style={s.quizCard}>
                <Text style={s.questionNum}>Question {qNum + 1} / {QUESTIONS_PER_ROUND}</Text>
                <Text style={s.questionText}>{question.q}</Text>
                <View style={s.optionsGrid}>
                  {question.opts.map((opt, i) => {
                    const isElim = eliminated.has(i);
                    const isSelected = feedbackIdx === i;
                    const isCorrect = i === question.correct;
                    let bg = "rgba(255,255,255,0.08)";
                    let borderColor = "rgba(255,255,255,0.15)";
                    if (phase === "answered" && isSelected && feedback === "correct") {
                      bg = "rgba(34,197,94,0.3)"; borderColor = "#22c55e";
                    } else if (phase === "answered" && isSelected && feedback === "wrong") {
                      bg = "rgba(239,68,68,0.3)"; borderColor = "#ef4444";
                    } else if (phase === "answered" && isCorrect && feedback === "wrong") {
                      bg = "rgba(34,197,94,0.2)"; borderColor = "#86efac";
                    }
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.optBtn, { backgroundColor: bg, borderColor, opacity: isElim ? 0.2 : 1 }]}
                        onPress={() => !isElim && handleAnswer(i)}
                        disabled={phase === "answered" || isElim}
                        activeOpacity={0.75}
                      >
                        <Text style={s.optLabel}>{["A", "B", "C", "D"][i]}</Text>
                        <Text style={[s.optText, isElim && { textDecorationLine: "line-through" }]}>{opt}</Text>
                        {phase === "answered" && isCorrect && (
                          <Text style={{ fontSize: 14 }}> ✅</Text>
                        )}
                        {phase === "answered" && isSelected && feedback === "wrong" && (
                          <Text style={{ fontSize: 14 }}> ❌</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* GP Powerups */}
            {(phase === "playing" || phase === "answered") && (
              <View style={s.powerupRow}>
                <TouchableOpacity style={[s.powerBtn, shielded && s.powerBtnActive]} onPress={useShield} disabled={shielded}>
                  <Text style={s.powerIcon}>🛡️</Text>
                  <Text style={s.powerLabel}>Shield</Text>
                  <Text style={s.powerCost}>20 GP</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.powerBtn} onPress={useHint}>
                  <Text style={s.powerIcon}>💡</Text>
                  <Text style={s.powerLabel}>Hint</Text>
                  <Text style={s.powerCost}>10 GP</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.powerBtn} onPress={useReforestation}>
                  <Text style={s.powerIcon}>🌳</Text>
                  <Text style={s.powerLabel}>Reforest</Text>
                  <Text style={s.powerCost}>30 GP</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Victory */}
            {phase === "victory" && (
              <View style={s.card}>
                <Text style={s.bigEmoji}>🏆</Text>
                <Text style={s.cardTitle}>Atmosphere Defended!</Text>
                <Text style={s.cardBody}>You answered {QUESTIONS_PER_ROUND} questions and saved the ozone layer!</Text>
                <Text style={[s.cardBody, { color: "#4ade80", fontWeight: "800", fontSize: 18 }]}>+15 GP Round Bonus!</Text>
                <View style={s.treeRow}>
                  {Array.from({ length: Math.min(treeCount, 8) }, (_, i) => (
                    <Text key={i} style={{ fontSize: 28 }}>🌲</Text>
                  ))}
                </View>
                <TouchableOpacity style={s.ctaBtn} onPress={startGame}>
                  <Text style={s.ctaBtnText}>🌍 Play Again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ctaBtn, { backgroundColor: "rgba(255,255,255,0.1)", marginTop: 8 }]} onPress={() => setPhase("idle")}>
                  <Text style={[s.ctaBtnText, { color: "#94a3b8" }]}>Back to Menu</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Game Over */}
            {phase === "over" && (
              <View style={s.card}>
                <Text style={s.bigEmoji}>💀</Text>
                <Text style={s.cardTitle}>CO₂ Reached the Atmosphere!</Text>
                <Text style={s.cardBody}>
                  The ozone layer has been breached. You answered {qNum} out of {QUESTIONS_PER_ROUND} questions.
                </Text>
                <Text style={[s.cardBody, { color: "#fca5a5" }]}>
                  Study up on climate science and try again!
                </Text>
                <TouchableOpacity style={s.ctaBtn} onPress={startGame}>
                  <Text style={s.ctaBtnText}>🌿 Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ctaBtn, { backgroundColor: "rgba(255,255,255,0.08)", marginTop: 8 }]} onPress={() => setPhase("idle")}>
                  <Text style={[s.ctaBtnText, { color: "#94a3b8" }]}>Back to Menu</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  backBtn: { padding: 6, marginRight: 4 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  subtitle: { color: "#7dd3fc", fontSize: 11, marginTop: 1 },
  gpBadge: {
    backgroundColor: "rgba(22,163,74,0.3)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "#16a34a",
  },
  gpText: { color: "#4ade80", fontSize: 13, fontWeight: "700" },
  msgBar: {
    backgroundColor: "rgba(2,132,199,0.85)", marginHorizontal: 16,
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14,
    marginBottom: 4, alignItems: "center",
  },
  msgText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16,
    padding: 20, marginTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  bigEmoji: { fontSize: 52, textAlign: "center", marginBottom: 8 },
  cardTitle: { color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  cardBody: { color: "#e2e8f0", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 4 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 12 },
  ruleRow: { color: "#94a3b8", fontSize: 13, marginBottom: 4, textAlign: "center" },
  ctaBtn: {
    backgroundColor: "#16a34a", borderRadius: 12,
    paddingVertical: 14, alignItems: "center", marginTop: 12,
  },
  ctaBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  atmosphereBar: { marginTop: 8, borderRadius: 12, overflow: "hidden" },
  atmosphereGrad: { padding: 10, alignItems: "center" },
  atmosphereLabel: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  dangerRow: {
    width: "100%", height: 6, backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 3, marginVertical: 5, overflow: "hidden",
  },
  dangerFill: { height: 6, backgroundColor: "#ef4444", borderRadius: 3 },
  atmosphereSub: { color: "rgba(255,255,255,0.8)", fontSize: 10 },
  gameField: {
    marginTop: 6, borderRadius: 14, overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "flex-end",
  },
  shieldOverlay: {
    position: "absolute", top: 6, right: 10,
    backgroundColor: "rgba(99,102,241,0.3)", borderRadius: 20,
    padding: 6, borderWidth: 1, borderColor: "#818cf8",
  },
  monsterFrame: {
    width: 188,
    height: MONSTER_FRAME_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  monsterHeadHud: {
    position: "absolute",
    top: 2,
    zIndex: 3,
    alignItems: "center",
  },
  monsterHpText: {
    color: "#f8fafc",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: 0.7,
  },
  monsterAura: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(132,204,22,0.2)",
    shadowColor: "#84cc16",
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  monsterSprite: {
    width: 184,
    height: 198,
  },
  monsterTag: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.8)",
    borderWidth: 1,
    borderColor: "rgba(163,230,53,0.55)",
  },
  monsterTagText: {
    color: "#d9f99d",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  monsterHpTrack: {
    width: 124,
    height: 10,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
  },
  monsterHpFill: {
    height: "100%",
    borderRadius: 999,
  },
  missileLane: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  missileBody: {
    alignItems: "center",
  },
  missileTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#f8fafc",
  },
  missileShell: {
    width: 16,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 2,
    borderColor: "#cbd5e1",
    marginTop: -2,
  },
  missileFlame: {
    width: 20,
    height: 34,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    marginTop: -4,
  },
  impactBurst: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 6,
  },
  impactRing: {
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: "rgba(250,204,21,0.9)",
    backgroundColor: "rgba(254,240,138,0.18)",
  },
  impactSpark: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#fff7ed",
    shadowColor: "#fde047",
    shadowOpacity: 0.8,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  groundRow: {
    justifyContent: "flex-end",
  },
  ground: {
    minHeight: 82,
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
    borderTopWidth: 1,
    borderTopColor: "rgba(187,247,208,0.12)",
  },
  gasField: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  gasSwirl: {
    position: "absolute",
    bottom: 10,
    width: 110,
    height: 58,
    borderRadius: 999,
    overflow: "hidden",
  },
  gasSwirlLeft: {
    left: 28,
  },
  gasSwirlRight: {
    right: 24,
  },
  gasSwirlHalo: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 12,
    bottom: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(187,247,208,0.14)",
  },
  groundBackdropTrees: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  decorTree: {
    position: "absolute",
  },
  statsBar: {
    flexDirection: "row", justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12,
    paddingVertical: 8, marginTop: 8,
  },
  stat: { alignItems: "center" },
  statVal: { color: "#4ade80", fontSize: 20, fontWeight: "800" },
  statLbl: { color: "#94a3b8", fontSize: 10 },
  quizCard: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16,
    padding: 16, marginTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  questionNum: { color: "#7dd3fc", fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  questionText: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center", lineHeight: 22, marginBottom: 14 },
  optionsGrid: { gap: 8 },
  optBtn: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 12,
  },
  optLabel: {
    color: "#7dd3fc", fontSize: 13, fontWeight: "800",
    width: 22, marginRight: 8,
  },
  optText: { color: "#e2e8f0", fontSize: 13, flex: 1, lineHeight: 18 },
  powerupRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 10, marginTop: 10, flexWrap: "wrap",
  },
  powerBtn: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", minWidth: 80,
  },
  powerBtnActive: { borderColor: "#818cf8", backgroundColor: "rgba(99,102,241,0.2)" },
  powerIcon: { fontSize: 22 },
  powerLabel: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 2 },
  powerCost: { color: "#4ade80", fontSize: 10, marginTop: 1 },
  treeRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", marginVertical: 10 },
});
