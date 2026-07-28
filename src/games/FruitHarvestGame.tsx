import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  Vibration,
  Alert,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

const { width: W } = Dimensions.get("window");

type Basket = "sweet" | "citrus";
type FruitKind = "mango" | "apple" | "grape" | "peach" | "orange" | "lemon" | "avocado" | "melon";
type Phase = "idle" | "playing" | "gameover";

const SWEET: FruitKind[] = ["mango", "apple", "grape", "peach"];
const CITRUS: FruitKind[] = ["orange", "lemon", "avocado", "melon"];
const ALL_FRUITS: FruitKind[] = [...SWEET, ...CITRUS];
const basketOf = (kind: FruitKind): Basket => (SWEET.includes(kind) ? "sweet" : "citrus");

const BRANCH_SLOTS = [
  { xPct: 0.16, yPct: 0.25 },
  { xPct: 0.28, yPct: 0.16 },
  { xPct: 0.44, yPct: 0.19 },
  { xPct: 0.60, yPct: 0.15 },
  { xPct: 0.76, yPct: 0.22 },
  { xPct: 0.22, yPct: 0.35 },
  { xPct: 0.50, yPct: 0.32 },
  { xPct: 0.70, yPct: 0.33 },
];

const ROUND_SECS = 55;
const MAX_LIVES = 4;
const GAME_H = 520;
const FRUIT_SIZE = 58;

type FruitItem = {
  id: string;
  kind: FruitKind;
  xPct: number;
  yPct: number;
  fallAnim: Animated.Value;
  throwX: Animated.Value;
  throwY: Animated.Value;
  opacity: Animated.Value;
  fallTarget: number;
  fallDuration: number;
  thrown: boolean;
  missed: boolean;
};

const OrchardBackdrop = () => (
  <Svg width={W} height={GAME_H} viewBox={`0 0 ${W} ${GAME_H}`} style={StyleSheet.absoluteFill}>
    <Defs>
      <SvgLinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#fef3c7" />
        <Stop offset="55%" stopColor="#d9f99d" />
        <Stop offset="100%" stopColor="#86efac" />
      </SvgLinearGradient>
      <SvgLinearGradient id="canopy" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#4ade80" />
        <Stop offset="100%" stopColor="#166534" />
      </SvgLinearGradient>
      <SvgLinearGradient id="trunk" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#8b5a2b" />
        <Stop offset="100%" stopColor="#5b3416" />
      </SvgLinearGradient>
    </Defs>
    <Rect x="0" y="0" width={W} height={GAME_H} fill="url(#sky)" />
    <Circle cx={W - 70} cy={80} r={34} fill="rgba(253,224,71,0.6)" />
    <Path d={`M0 ${GAME_H - 80} C ${W * 0.22} ${GAME_H - 130}, ${W * 0.42} ${GAME_H - 40}, ${W * 0.62} ${GAME_H - 86} S ${W * 0.92} ${GAME_H - 110}, ${W} ${GAME_H - 58} L ${W} ${GAME_H} L 0 ${GAME_H} Z`} fill="#4ade80" opacity={0.9} />
    <Path d={`M0 ${GAME_H - 40} C ${W * 0.18} ${GAME_H - 66}, ${W * 0.4} ${GAME_H - 18}, ${W * 0.64} ${GAME_H - 44} S ${W * 0.9} ${GAME_H - 78}, ${W} ${GAME_H - 40} L ${W} ${GAME_H} L 0 ${GAME_H} Z`} fill="#166534" opacity={0.24} />
    <Rect x={W / 2 - 20} y={GAME_H - 196} width="40" height="184" rx="18" fill="url(#trunk)" />
    <Path d={`M${W / 2 - 8} ${GAME_H - 170} C ${W / 2 - 90} ${GAME_H - 212}, ${W / 2 - 126} ${GAME_H - 246}, ${W / 2 - 152} ${GAME_H - 258}`} stroke="#6d3e1d" strokeWidth="12" strokeLinecap="round" fill="none" />
    <Path d={`M${W / 2 + 8} ${GAME_H - 188} C ${W / 2 + 96} ${GAME_H - 232}, ${W / 2 + 132} ${GAME_H - 270}, ${W / 2 + 152} ${GAME_H - 250}`} stroke="#6d3e1d" strokeWidth="12" strokeLinecap="round" fill="none" />
    <Circle cx={W / 2} cy={GAME_H - 300} r="94" fill="url(#canopy)" />
    <Circle cx={W / 2 - 92} cy={GAME_H - 314} r="58" fill="#22c55e" />
    <Circle cx={W / 2 + 90} cy={GAME_H - 310} r="54" fill="#16a34a" />
    <Circle cx={W / 2 - 24} cy={GAME_H - 382} r="54" fill="#4ade80" />
    <Circle cx={W / 2 + 38} cy={GAME_H - 374} r="46" fill="#65a30d" opacity={0.9} />
    <Ellipse cx={W / 2} cy={GAME_H - 8} rx="118" ry="18" fill="rgba(21,128,61,0.2)" />
  </Svg>
);

const FruitArt = ({ kind }: { kind: FruitKind }) => {
  const renderBody = () => {
    switch (kind) {
      case "mango":
        return (
          <>
            <Defs>
              <SvgLinearGradient id="mangoSkin" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#facc15" />
                <Stop offset="60%" stopColor="#fb923c" />
                <Stop offset="100%" stopColor="#f97316" />
              </SvgLinearGradient>
            </Defs>
            <Path d="M28 10 C40 10 48 20 46 32 C43 47 29 54 17 48 C8 44 5 34 8 25 C11 15 19 10 28 10 Z" fill="url(#mangoSkin)" />
          </>
        );
      case "apple":
        return (
          <>
            <Defs>
              <SvgLinearGradient id="appleSkin" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#fb7185" />
                <Stop offset="100%" stopColor="#dc2626" />
              </SvgLinearGradient>
            </Defs>
            <Path d="M28 14 C36 10 44 16 44 28 C44 42 35 49 28 49 C20 49 12 42 12 28 C12 16 20 10 28 14 Z" fill="url(#appleSkin)" />
          </>
        );
      case "grape":
        return (
          <>
            {[0, 1, 2].map((col) =>
              [0, 1, 2].map((row) => (
                <Circle
                  key={`${col}-${row}`}
                  cx={18 + col * 10 + (row === 2 ? 4 : 0)}
                  cy={18 + row * 10}
                  r="7.5"
                  fill={row === 0 ? "#8b5cf6" : row === 1 ? "#7c3aed" : "#6d28d9"}
                />
              )),
            )}
          </>
        );
      case "peach":
        return (
          <>
            <Defs>
              <SvgLinearGradient id="peachSkin" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#fde68a" />
                <Stop offset="100%" stopColor="#fb7185" />
              </SvgLinearGradient>
            </Defs>
            <Circle cx="27" cy="30" r="16" fill="url(#peachSkin)" />
            <Path d="M27 15 C32 19 33 22 31 29" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinecap="round" />
          </>
        );
      case "orange":
        return (
          <>
            <Circle cx="27" cy="29" r="16" fill="#fb923c" />
            <Circle cx="27" cy="29" r="10" fill="rgba(255,255,255,0.14)" />
          </>
        );
      case "lemon":
        return (
          <>
            <Path d="M12 29 C12 18 20 12 28 12 C36 12 44 18 44 29 C44 40 36 46 28 46 C20 46 12 40 12 29 Z" fill="#facc15" />
            <Path d="M12 29 L8 29 M44 29 L48 29" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
          </>
        );
      case "avocado":
        return (
          <>
            <Path d="M28 11 C39 11 46 21 44 32 C42 44 35 49 28 49 C20 49 12 42 12 31 C12 20 18 11 28 11 Z" fill="#65a30d" />
            <Ellipse cx="28" cy="34" rx="7" ry="8" fill="#92400e" />
            <Path d="M28 15 C34 16 38 22 37 29 C34 23 31 18 28 15 Z" fill="#a3e635" opacity={0.5} />
          </>
        );
      case "melon":
      default:
        return (
          <>
            <Circle cx="27" cy="29" r="16" fill="#86efac" />
            <Path d="M14 29 H40" stroke="#22c55e" strokeWidth="2" />
            <Path d="M27 14 V44" stroke="#22c55e" strokeWidth="2" />
            <Path d="M18 20 C24 23 30 35 36 38" stroke="#22c55e" strokeWidth="2" />
            <Path d="M18 38 C24 34 30 22 36 20" stroke="#22c55e" strokeWidth="2" />
          </>
        );
    }
  };

  return (
    <Svg width={FRUIT_SIZE - 6} height={FRUIT_SIZE - 6} viewBox="0 0 54 54">
      <Defs>
        <SvgLinearGradient id={`fruitHighlight-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.65)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </SvgLinearGradient>
      </Defs>
      <Ellipse cx="28" cy="46" rx="12" ry="4" fill="rgba(15,23,42,0.12)" />
      <Path d="M27 13 C28 9 30 7 33 6" stroke="#7c2d12" strokeWidth="3" strokeLinecap="round" />
      <Path d="M29 8 C34 6 38 8 41 11 C36 13 31 13 29 8 Z" fill="#22c55e" />
      {renderBody()}
      <Ellipse cx="20" cy="21" rx="6" ry="4" fill={`url(#fruitHighlight-${kind})`} />
    </Svg>
  );
};

const FruitNode = ({
  fruit,
  slowRef,
  onThrow,
  onMiss,
}: {
  fruit: FruitItem;
  slowRef: { current: boolean };
  onThrow: (id: string, basket: Basket, correct: boolean) => void;
  onMiss: (id: string) => void;
}) => {
  const currentFall = useRef(0);

  const resumeFall = useCallback(() => {
    const remainingDistance = Math.max(fruit.fallTarget - currentFall.current, 42);
    const duration = Math.max(
      320,
      Math.round((remainingDistance / Math.max(fruit.fallTarget, 1)) * fruit.fallDuration * (slowRef.current ? 1.8 : 1)),
    );
    Animated.parallel([
      Animated.spring(fruit.throwX, {
        toValue: 0,
        speed: 20,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.spring(fruit.throwY, {
        toValue: 0,
        speed: 20,
        bounciness: 6,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(fruit.fallAnim, {
        toValue: fruit.fallTarget,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !fruit.thrown) {
          fruit.missed = true;
          onMiss(fruit.id);
        }
      });
    });
  }, [fruit, onMiss, slowRef]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !fruit.thrown && !fruit.missed,
      onMoveShouldSetPanResponder: (_, gesture) => !fruit.thrown && !fruit.missed && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
      onPanResponderGrant: () => {
        fruit.fallAnim.stopAnimation((value) => {
          currentFall.current = value;
        });
        fruit.throwX.stopAnimation();
        fruit.throwY.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        if (fruit.thrown || fruit.missed) return;
        fruit.throwX.setValue(gesture.dx);
        fruit.throwY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (fruit.thrown || fruit.missed) return;

        const directionSignal = Math.abs(gesture.dx) >= Math.abs(gesture.vx * 68) ? gesture.dx : gesture.vx * 68;
        const strongHorizontalSwipe = Math.abs(directionSignal) > 28;
        const draggedDownWithoutIntent = gesture.dy > 86 && Math.abs(directionSignal) < 22;

        if (!strongHorizontalSwipe || draggedDownWithoutIntent) {
          resumeFall();
          return;
        }

        fruit.thrown = true;
        Vibration.vibrate(24);

        const targetBasket: Basket = directionSignal < 0 ? "sweet" : "citrus";
        const correct = targetBasket === basketOf(fruit.kind);
        const exitX = targetBasket === "sweet" ? -W * 0.48 : W * 0.48;
        const arcLift = gesture.dy < -20 || gesture.vy < -0.2 ? -GAME_H * 0.22 : -GAME_H * 0.12;

        Animated.parallel([
          Animated.timing(fruit.throwX, {
            toValue: exitX,
            duration: 340,
            useNativeDriver: true,
          }),
          Animated.timing(fruit.throwY, {
            toValue: arcLift,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(fruit.opacity, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
        ]).start(() => onThrow(fruit.id, targetBasket, correct));
      },
      onPanResponderTerminate: () => {
        if (!fruit.thrown && !fruit.missed) resumeFall();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.fruitWrap,
        {
          left: fruit.xPct * W - FRUIT_SIZE / 2,
          top: GAME_H * fruit.yPct - FRUIT_SIZE / 2,
          opacity: fruit.opacity,
          transform: [
            { translateY: Animated.add(fruit.fallAnim, fruit.throwY) },
            { translateX: fruit.throwX },
          ],
        },
      ]}
      {...pan.panHandlers}
    >
      <View style={styles.fruitBubble}>
        <FruitArt kind={fruit.kind} />
        <Text style={styles.fruitHint}>{basketOf(fruit.kind) === "sweet" ? "Swipe left" : "Swipe right"}</Text>
      </View>
    </Animated.View>
  );
};

export const FruitHarvestGame = () => {
  const { session } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh, earn, spend } = useGameGP(session);

  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECS);
  const [fruits, setFruits] = useState<FruitItem[]>([]);
  const [sweetBasket, setSweetBasket] = useState<string[]>([]);
  const [citrusBasket, setCitrusBasket] = useState<string[]>([]);
  const [combo, setCombo] = useState(0);
  const [earnedGP, setEarnedGP] = useState(0);
  const [slowActive, setSlowActive] = useState(false);
  const [lastThrow, setLastThrow] = useState<{ correct: boolean; label: string } | null>(null);

  const fruitsRef = useRef<FruitItem[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const comboRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const fruitIdRef = useRef(0);
  const slowRef = useRef(false);
  const spawnTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (spawnTimer.current) {
      clearInterval(spawnTimer.current);
      spawnTimer.current = null;
    }
    if (gameTimer.current) {
      clearInterval(gameTimer.current);
      gameTimer.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        clearTimers();
        phaseRef.current = "idle";
      };
    }, [clearTimers, refresh]),
  );

  const startGame = () => {
    clearTimers();
    phaseRef.current = "playing";
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    comboRef.current = 0;
    fruitsRef.current = [];
    slowRef.current = false;
    fruitIdRef.current = 0;

    setScore(0);
    setLives(MAX_LIVES);
    setCombo(0);
    setTimeLeft(ROUND_SECS);
    setFruits([]);
    setSweetBasket([]);
    setCitrusBasket([]);
    setEarnedGP(0);
    setSlowActive(false);
    setLastThrow(null);
    setPhase("playing");

    let elapsed = 0;
    gameTimer.current = setInterval(() => {
      elapsed += 1;
      setTimeLeft(ROUND_SECS - elapsed);
      if (elapsed >= ROUND_SECS) {
        void endGame();
      }
    }, 1000);

    spawnTimer.current = setInterval(() => {
      if (phaseRef.current === "playing") {
        spawnFruit();
      }
    }, 1150);
  };

  const spawnFruit = () => {
    const slot = BRANCH_SLOTS[Math.floor(Math.random() * BRANCH_SLOTS.length)];
    const kind = ALL_FRUITS[Math.floor(Math.random() * ALL_FRUITS.length)];
    const id = `f${fruitIdRef.current++}`;
    const fallAnim = new Animated.Value(0);
    const throwX = new Animated.Value(0);
    const throwY = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const fallTarget = GAME_H * (1 - slot.yPct) + 96;
    const fallDuration = 2900 + Math.random() * 900;

    const item: FruitItem = {
      id,
      kind,
      xPct: slot.xPct,
      yPct: slot.yPct,
      fallAnim,
      throwX,
      throwY,
      opacity,
      fallTarget,
      fallDuration,
      thrown: false,
      missed: false,
    };

    fruitsRef.current = [...fruitsRef.current, item];
    setFruits([...fruitsRef.current]);

    Animated.timing(fallAnim, {
      toValue: fallTarget,
      duration: Math.round(fallDuration * (slowRef.current ? 1.8 : 1)),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !item.thrown) {
        item.missed = true;
        handleMiss(id);
      }
    });
  };

  const handleMiss = (id: string) => {
    if (phaseRef.current !== "playing") return;
    comboRef.current = 0;
    setCombo(0);
    livesRef.current -= 1;
    setLives(livesRef.current);
    Vibration.vibrate([0, 38, 24, 38]);
    setLastThrow({ correct: false, label: "Missed harvest" });
    setTimeout(() => setLastThrow(null), 800);
    fruitsRef.current = fruitsRef.current.filter((fruit) => fruit.id !== id);
    setFruits([...fruitsRef.current]);
    if (livesRef.current <= 0) {
      void endGame();
    }
  };

  const handleThrow = (id: string, basket: Basket, correct: boolean) => {
    if (phaseRef.current !== "playing") return;

    fruitsRef.current = fruitsRef.current.filter((fruit) => fruit.id !== id);
    setFruits([...fruitsRef.current]);

    if (correct) {
      comboRef.current += 1;
      setCombo(comboRef.current);
      const pts = 18 * Math.min(comboRef.current, 5);
      scoreRef.current += pts;
      setScore(scoreRef.current);
      if (basket === "sweet") {
        setSweetBasket((prev) => [...prev.slice(-8), id.slice(-2)]);
      } else {
        setCitrusBasket((prev) => [...prev.slice(-8), id.slice(-2)]);
      }
      setLastThrow({ correct: true, label: `+${pts}${comboRef.current > 1 ? ` combo x${comboRef.current}` : ""}` });
      Vibration.vibrate(20);
    } else {
      comboRef.current = 0;
      setCombo(0);
      livesRef.current -= 1;
      setLives(livesRef.current);
      setLastThrow({ correct: false, label: "Wrong basket" });
      Vibration.vibrate([0, 45, 22, 45]);
      if (livesRef.current <= 0) {
        void endGame();
      }
    }
    setTimeout(() => setLastThrow(null), 950);
  };

  const endGame = useCallback(async () => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "gameover";
    clearTimers();
    setPhase("gameover");
    const gp = Math.min(28, Math.floor(scoreRef.current / 12));
    if (gp > 0) {
      const actual = await earn(gp, "harvest_win", "fruit_harvest");
      setEarnedGP(actual);
    }
  }, [clearTimers, earn]);

  const activateSlowTime = async () => {
    if (slowActive || phaseRef.current !== "playing") return;
    const ok = await spend(25, "slow_time", "fruit_harvest");
    if (!ok) {
      Alert.alert("Not enough GP", "Slow Time costs 25 GP.");
      return;
    }
    slowRef.current = true;
    setSlowActive(true);
    Vibration.vibrate([0, 32, 22, 32]);
    setTimeout(() => {
      slowRef.current = false;
      setSlowActive(false);
    }, 10000);
  };

  return (
    <View style={styles.root}>
      <SystemBars style="light" />
      <LinearGradient colors={["#7c2d12", "#b45309", "#f97316"]} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              clearTimers();
              phaseRef.current = "idle";
              navigation.goBack();
            }}
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Fruit Harvest</Text>
          <View style={styles.gp}>
            <Text style={styles.gpTxt}>🌿 {loading ? "—" : gpBalance}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Swipe each fruit into the correct basket before it drops.</Text>
        {phase === "playing" ? (
          <View style={styles.hud}>
            <Text style={styles.hudVal}>⭐ {score}</Text>
            <Text style={styles.hudVal}>⏱ {timeLeft}s</Text>
            <Text style={styles.hudVal}>{"❤️".repeat(lives)}{"🖤".repeat(MAX_LIVES - lives)}</Text>
            {combo > 1 ? <Text style={styles.comboTxt}>🔥 x{combo}</Text> : null}
          </View>
        ) : null}
      </LinearGradient>

      <View style={[styles.gameArea, { height: GAME_H }]}>
        <OrchardBackdrop />

        {phase === "playing" ? (
          <>
            <View style={styles.basketLabelLeft}>
              <Text style={styles.basketLabelTitle}>Sweet basket</Text>
              <Text style={styles.basketLabelHint}>mango · apple · grape · peach</Text>
            </View>
            <View style={styles.basketLabelRight}>
              <Text style={styles.basketLabelTitle}>Citrus basket</Text>
              <Text style={styles.basketLabelHint}>orange · lemon · avocado · melon</Text>
            </View>
          </>
        ) : null}

        {slowActive ? (
          <View style={styles.slowOverlay} pointerEvents="none">
            <Text style={styles.slowTxt}>SLOW TIME ACTIVE</Text>
          </View>
        ) : null}

        {lastThrow ? (
          <View style={[styles.flash, lastThrow.correct ? styles.flashGood : styles.flashBad]}>
            <Text style={styles.flashTxt}>{lastThrow.label}</Text>
          </View>
        ) : null}

        {fruits.map((fruit) => (
          <FruitNode
            key={fruit.id}
            fruit={fruit}
            slowRef={slowRef}
            onThrow={handleThrow}
            onMiss={handleMiss}
          />
        ))}

        {phase !== "playing" ? (
          <View style={styles.overlay}>
            <View style={styles.overlayCard}>
              <Text style={styles.panelEyebrow}>Orchard challenge</Text>
              <Text style={styles.panelTitle}>{phase === "idle" ? "Harvest season is open" : "Round complete"}</Text>
              <Text style={styles.panelDesc}>
                {phase === "idle"
                  ? "Touch a fruit, drag with your finger, and release toward the matching basket."
                  : `You scored ${score} points in this orchard run.`}
              </Text>
              {phase === "gameover" && earnedGP > 0 ? <Text style={styles.earnedGP}>+{earnedGP} GP earned</Text> : null}
              <View style={styles.legend}>
                <View style={styles.legendChip}>
                  <Text style={styles.legendChipText}>Sweet goes left</Text>
                </View>
                <View style={styles.legendChip}>
                  <Text style={styles.legendChipText}>Citrus goes right</Text>
                </View>
              </View>
              <Pressable onPress={startGame} style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]}>
                <LinearGradient colors={["#f97316", "#c2410c"]} style={styles.startGrad}>
                  <Text style={styles.startTxt}>{phase === "idle" ? "Start Harvest" : "Play Again"}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 10 }]}>
        <View style={[styles.basketCard, styles.basketSweet]}>
          <Text style={styles.basketTitle}>Sweet</Text>
          <Text style={styles.basketCount}>{sweetBasket.length}</Text>
          <Text style={styles.basketMeta}>Left basket</Text>
        </View>
        {phase === "playing" ? (
          <Pressable onPress={activateSlowTime} disabled={slowActive} style={({ pressed }) => [styles.powerCard, slowActive && styles.powerCardActive, pressed && !slowActive && styles.pressed]}>
            <Text style={styles.powerTitle}>{slowActive ? "Active boost" : "Slow Time"}</Text>
            <Text style={styles.powerMeta}>{slowActive ? "Fruit drop speed reduced" : "10s control for 25 GP"}</Text>
          </Pressable>
        ) : (
          <View style={styles.powerPlaceholder}>
            <Text style={styles.powerPlaceholderText}>Swipe left or right to sort</Text>
          </View>
        )}
        <View style={[styles.basketCard, styles.basketCitrus]}>
          <Text style={styles.basketTitle}>Citrus</Text>
          <Text style={styles.basketCount}>{citrusBasket.length}</Text>
          <Text style={styles.basketMeta}>Right basket</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fef7ed" },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { padding: 6 },
  title: { fontSize: 18, fontWeight: "900", color: "#fff" },
  subtitle: { fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.82)", marginTop: 10, marginBottom: 10 },
  gp: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gpTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  hud: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  hudVal: { fontSize: 13, fontWeight: "900", color: "#fff" },
  comboTxt: { fontSize: 13, fontWeight: "900", color: "#fde68a" },
  gameArea: { position: "relative", overflow: "hidden" },
  basketLabelLeft: {
    position: "absolute",
    left: 12,
    bottom: 92,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  basketLabelRight: {
    position: "absolute",
    right: 12,
    bottom: 92,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "flex-end",
  },
  basketLabelTitle: { fontSize: 11, fontWeight: "900", color: "#7c2d12" },
  basketLabelHint: { fontSize: 9, color: "#9a3412", marginTop: 2 },
  slowOverlay: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  slowTxt: { fontSize: 12, fontWeight: "900", color: "#7dd3fc" },
  flash: {
    position: "absolute",
    top: "44%",
    alignSelf: "center",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 30,
  },
  flashGood: { backgroundColor: "rgba(34,197,94,0.92)" },
  flashBad: { backgroundColor: "rgba(239,68,68,0.92)" },
  flashTxt: { fontSize: 15, fontWeight: "900", color: "#fff" },
  fruitWrap: { position: "absolute", zIndex: 12, width: FRUIT_SIZE, height: FRUIT_SIZE + 8 },
  fruitBubble: {
    width: FRUIT_SIZE,
    height: FRUIT_SIZE + 8,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.86)",
    shadowColor: "#14532d",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  fruitHint: { fontSize: 8, fontWeight: "800", color: "#35564a", marginTop: -3 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,248,235,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  overlayCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.18)",
    shadowColor: "#7c2d12",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    alignItems: "center",
  },
  panelEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#c2410c",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  panelTitle: { fontSize: 28, fontWeight: "900", color: "#7c2d12", textAlign: "center" },
  panelDesc: { fontSize: 13, lineHeight: 20, color: "#9a3412", textAlign: "center", marginTop: 10 },
  earnedGP: { fontSize: 24, fontWeight: "900", color: "#15803d", marginTop: 14 },
  legend: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 16, marginBottom: 20 },
  legendChip: {
    backgroundColor: "#ffedd5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  legendChipText: { fontSize: 11, fontWeight: "800", color: "#9a3412" },
  startBtn: { width: "100%", borderRadius: 18, overflow: "hidden" },
  startGrad: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  startTxt: { fontSize: 16, fontWeight: "900", color: "#fff" },
  bottomRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "#fff7ed",
    borderTopWidth: 1,
    borderTopColor: "#fed7aa",
  },
  basketCard: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  basketSweet: { backgroundColor: "#fff1f2", borderColor: "#fecdd3" },
  basketCitrus: { backgroundColor: "#fef3c7", borderColor: "#fcd34d" },
  basketTitle: { fontSize: 12, fontWeight: "900", color: "#1f2937" },
  basketCount: { fontSize: 24, fontWeight: "900", color: "#7c2d12", marginTop: 5 },
  basketMeta: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  powerCard: {
    flex: 1.2,
    backgroundColor: "#ecfeff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#a5f3fc",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "center",
  },
  powerCardActive: { backgroundColor: "#cffafe", borderColor: "#38bdf8" },
  powerTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a", textAlign: "center" },
  powerMeta: { fontSize: 10, color: "#0369a1", textAlign: "center", marginTop: 4, lineHeight: 14 },
  powerPlaceholder: {
    flex: 1.2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  powerPlaceholderText: { fontSize: 11, fontWeight: "700", color: "#9a3412", textAlign: "center" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
