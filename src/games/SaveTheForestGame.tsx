/**
 * Save the Forest — "Eco-Match" 🌿
 *
 * Swipe gestures, beam destruction animations, and synthesised sound.
 *
 * Gesture fix notes:
 *  - The board sits in a plain <View>, not a ScrollView, so no scroll
 *    responder fights vertical swipes.
 *  - boardViewRef.measure() gives true page coordinates; we subtract them
 *    from gestureState.x0/y0 so hit-testing is accurate regardless of which
 *    child view received the touch.
 *  - onStartShouldSetPanResponderCapture always claims the touch when playing
 *    so animations can never prevent a new gesture from registering.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  PanResponder, Vibration, Dimensions, ScrollView, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";
import { initGameAudio, playSound } from "../utils/gameAudio";

// ── Layout constants ──────────────────────────────────────────────────────────
const { width: W } = Dimensions.get("window");
const COLS = 5;
const ROWS = 7;
const GAP  = 3;
const CELL = Math.floor((W - 32) / COLS);
const TILE = CELL - GAP * 2;

// ── Tile data ─────────────────────────────────────────────────────────────────
const TILE_EMOJI = ["💧","☀️","🪵","🌱","🍃"];
const TILE_LABEL = ["Water","Sun","Soil","Seed","Leaf"];
const TILE_BG    = ["#1e40af","#b45309","#78350f","#15803d","#047857"];
const TILE_LT    = ["#93c5fd","#fcd34d","#d97706","#4ade80","#34d399"];
const POLLUTED   = 5;
const LIGHTNING  = 6;
const EMPTY      = -1;

const WITHER_KEY = "eco_match_wither_v3";
const WITHER_MS  = 4 * 60 * 60 * 1000;

const LEVELS = [
  { polluted: 3,  moves: 24, vines: 2, label: "Seedling Forest" },
  { polluted: 5,  moves: 24, vines: 3, label: "Misty Grove"     },
  { polluted: 7,  moves: 22, vines: 4, label: "Acid Marshes"    },
  { polluted: 9,  moves: 22, vines: 5, label: "Dark Canopy"     },
  { polluted: 12, moves: 20, vines: 7, label: "Toxic Wasteland" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type Cell  = { type: number; vine: boolean; acid: number; isNew: boolean };
type Phase = "idle" | "playing" | "withered" | "victory" | "over";
type CellAnim = { scale: Animated.Value; opacity: Animated.Value; dx: Animated.Value; dy: Animated.Value };
type Popup = { id: number; text: string; x: number; y: number; ty: Animated.Value; op: Animated.Value };
type MatchGroup = { dir: "h"|"v"; r: number; c: number; len: number; tileType: number };
type Beam = {
  id: number; dir: "h"|"v"; color: string;
  left: number; top: number; w: number; h: number;
  scaleAnim: Animated.Value; opacityAnim: Animated.Value;
};

// ── Board helpers ─────────────────────────────────────────────────────────────
function rnd() { return Math.floor(Math.random() * 5); }

function makeBoard(lvl: number): Cell[] {
  const cfg = LEVELS[Math.min(lvl, LEVELS.length - 1)];
  const b: Cell[] = Array.from({ length: ROWS * COLS }, () =>
    ({ type: rnd(), vine: false, acid: 0, isNew: false }));
  const used = new Set<number>();
  while (used.size < cfg.polluted) {
    const i = Math.floor(Math.random() * ROWS * COLS);
    if (!used.has(i)) { used.add(i); b[i].type = POLLUTED; }
  }
  let vc = 0;
  for (let t = 0; t < cfg.vines * 10 && vc < cfg.vines; t++) {
    const i = Math.floor(Math.random() * ROWS * COLS);
    if (!used.has(i) && !b[i].vine) { b[i].vine = true; vc++; }
  }
  return b;
}

function canMatch(c: Cell) { return c.type >= 0 && c.type < 5 && !c.vine && c.acid === 0; }

function findMatches(b: Cell[]): Set<number> {
  const m = new Set<number>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      const i0 = r * COLS + c;
      if (!canMatch(b[i0])) continue;
      const t = b[i0].type; let len = 1;
      while (c + len < COLS && canMatch(b[r * COLS + c + len]) && b[r * COLS + c + len].type === t) len++;
      if (len >= 3) for (let k = 0; k < len; k++) m.add(r * COLS + c + k);
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 3; r++) {
      const i0 = r * COLS + c;
      if (!canMatch(b[i0])) continue;
      const t = b[i0].type; let len = 1;
      while (r + len < ROWS && canMatch(b[(r + len) * COLS + c]) && b[(r + len) * COLS + c].type === t) len++;
      if (len >= 3) for (let k = 0; k < len; k++) m.add((r + k) * COLS + c);
    }
  }
  return m;
}

function findMatchGroups(b: Cell[]): MatchGroup[] {
  const groups: MatchGroup[] = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      if (!canMatch(b[r * COLS + c])) { c++; continue; }
      const t = b[r * COLS + c].type; let len = 1;
      while (c + len < COLS && canMatch(b[r * COLS + c + len]) && b[r * COLS + c + len].type === t) len++;
      if (len >= 3) groups.push({ dir: "h", r, c, len, tileType: t });
      c += len;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      if (!canMatch(b[r * COLS + c])) { r++; continue; }
      const t = b[r * COLS + c].type; let len = 1;
      while (r + len < ROWS && canMatch(b[(r + len) * COLS + c]) && b[(r + len) * COLS + c].type === t) len++;
      if (len >= 3) groups.push({ dir: "v", r, c, len, tileType: t });
      r += len;
    }
  }
  return groups;
}

function findPollutedAdj(b: Cell[], matched: Set<number>): Set<number> {
  const p = new Set<number>();
  for (const idx of matched) {
    const r = Math.floor(idx / COLS), c = idx % COLS;
    for (const n of [
      r > 0           ? (r-1)*COLS+c : -1,
      r < ROWS-1      ? (r+1)*COLS+c : -1,
      c > 0           ? r*COLS+c-1   : -1,
      c < COLS-1      ? r*COLS+c+1   : -1,
    ]) {
      if (n >= 0 && b[n].type === POLLUTED) p.add(n);
    }
  }
  return p;
}

function applyGravity(b: Cell[]): Cell[] {
  const next = b.map(c => ({ ...c, isNew: false }));
  for (let c = 0; c < COLS; c++) {
    const col: Cell[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (next[r * COLS + c].type !== EMPTY) col.push(next[r * COLS + c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      next[r * COLS + c] = col.length > 0
        ? col.shift()!
        : { type: rnd(), vine: false, acid: 0, isNew: true };
    }
  }
  return next;
}

function activateLightningRow(b: Cell[], idx: number): Cell[] {
  const row = Math.floor(idx / COLS);
  return b.map((c, i) =>
    Math.floor(i / COLS) === row && c.type !== POLLUTED
      ? { type: EMPTY, vine: false, acid: 0, isNew: false } : c);
}

function find4Match(b: Cell[]): number | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const i0 = r * COLS + c;
      if (!canMatch(b[i0])) continue;
      const t = b[i0].type;
      if ([1,2,3].every(k => b[r*COLS+c+k].type === t && canMatch(b[r*COLS+c+k])))
        return r * COLS + c + 1;
    }
  }
  return null;
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function wait(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

// ── Score Popup (module-level, stable) ───────────────────────────────────────
const ScorePopupView = React.memo(({ p }: { p: Popup }) => (
  <Animated.View pointerEvents="none" style={{
    position: "absolute", left: p.x - 36, top: p.y,
    transform: [{ translateY: p.ty }], opacity: p.op, zIndex: 99,
  }}>
    <Text style={{
      color: "#fde68a", fontSize: 15, fontWeight: "900",
      textShadowColor: "#000", textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 1 },
    }}>
      {p.text}
    </Text>
  </Animated.View>
));

// ── Beam (module-level, stable) ───────────────────────────────────────────────
const BeamView = React.memo(({ b }: { b: Beam }) => (
  <Animated.View pointerEvents="none" style={{
    position: "absolute", left: b.left, top: b.top, width: b.w, height: b.h,
    backgroundColor: b.color, borderRadius: b.h / 2,
    transform: b.dir === "h" ? [{ scaleX: b.scaleAnim }] : [{ scaleY: b.scaleAnim }],
    opacity: b.opacityAnim,
    shadowColor: b.color, shadowOpacity: 1, shadowRadius: 10, elevation: 12,
  }} />
));

// ── Tile (module-level, stable) ───────────────────────────────────────────────
type TileProps = { cell: Cell; idx: number; selected: boolean; anim: CellAnim };

const TileView = React.memo(({ cell, idx, selected, anim }: TileProps) => {
  const col = idx % COLS, row = Math.floor(idx / COLS);
  if (cell.type === EMPTY) {
    return (
      <View style={{
        position: "absolute",
        left: col * CELL + GAP, top: row * CELL + GAP,
        width: TILE, height: TILE,
      }} />
    );
  }

  const isPoll = cell.type === POLLUTED;
  const isLght = cell.type === LIGHTNING;
  const bg = isPoll ? "#374151" : isLght ? "#7c3aed" : TILE_BG[cell.type] ?? "#1e293b";
  const lt = isPoll ? "#9ca3af" : isLght ? "#c4b5fd" : TILE_LT[cell.type] ?? "#94a3b8";

  return (
    <Animated.View style={{
      position: "absolute",
      left: col * CELL + GAP, top: row * CELL + GAP,
      width: TILE, height: TILE, borderRadius: 12,
      transform: [{ translateX: anim.dx }, { translateY: anim.dy }, { scale: anim.scale }],
      opacity: anim.opacity,
      shadowColor: selected ? "#fbbf24" : "#000",
      shadowOpacity: selected ? 1 : 0.25,
      shadowRadius: selected ? 12 : 4,
      elevation: selected ? 12 : 4,
    }}>
      <LinearGradient
        colors={[lt, bg]}
        style={{ flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center",
          borderWidth: selected ? 2.5 : 0, borderColor: "#fbbf24", overflow: "hidden" }}
        start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
      >
        <Text style={{ fontSize: TILE * 0.40 }}>
          {isPoll ? "☠️" : isLght ? "⚡" : TILE_EMOJI[cell.type]}
        </Text>
        {cell.vine && (
          <Text style={{ position: "absolute", top: 2, right: 3, fontSize: 11 }}>🌿</Text>
        )}
        {cell.acid > 0 && (
          <>
            <Text style={{ position: "absolute", bottom: 2, right: 3, fontSize: 10 }}>⚗️</Text>
            <View style={{ position: "absolute", inset: 0, borderRadius: 12,
              backgroundColor: "rgba(239,68,68,0.18)" }} />
          </>
        )}
      </LinearGradient>
    </Animated.View>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
export const SaveTheForestGame = () => {
  const { session } = useAuth();
  const { gpBalance, refresh: refreshGP, spend, earn } = useGameGP(session);
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [board, setBoard]               = useState<Cell[]>(() => makeBoard(0));
  const [movesLeft, setMovesLeft]       = useState(LEVELS[0].moves);
  const [pollutedLeft, setPollutedLeft] = useState(LEVELS[0].polluted);
  const [score, setScore]               = useState(0);
  const [phase, setPhase]               = useState<Phase>("idle");
  const [level, setLevel]               = useState(0);
  const [msg, setMsg]                   = useState("");
  const [witherSecs, setWitherSecs]     = useState(0);
  const [popups, setPopups]             = useState<Popup[]>([]);
  const [beams, setBeams]               = useState<Beam[]>([]);
  const [comboText, setComboText]       = useState("");
  const [selected, setSelected]         = useState<number | null>(null);

  // Stable per-cell animation values
  const cellAnims = useRef<CellAnim[]>(
    Array.from({ length: ROWS * COLS }, () => ({
      scale:   new Animated.Value(1),
      opacity: new Animated.Value(1),
      dx:      new Animated.Value(0),
      dy:      new Animated.Value(0),
    }))
  ).current;

  const boardShake   = useRef(new Animated.Value(0)).current;
  const boardScale   = useRef(new Animated.Value(1)).current;
  const comboOpacity = useRef(new Animated.Value(0)).current;
  const comboScaleA  = useRef(new Animated.Value(0.5)).current;

  // Refs that are always current inside PanResponder callbacks
  const isAnimating = useRef(false);
  const boardRef    = useRef(board);        boardRef.current    = board;
  const phaseRef    = useRef(phase);        phaseRef.current    = phase;
  const movesRef    = useRef(movesLeft);    movesRef.current    = movesLeft;
  const pollRef     = useRef(pollutedLeft); pollRef.current     = pollutedLeft;
  const selectedRef = useRef(selected);     selectedRef.current = selected;

  // Board view ref — used to get accurate page coordinates for hit-testing
  const boardViewRef = useRef<View>(null);
  const boardPagePos = useRef({ x: 0, y: 0 });

  // Swipe tracking
  const swipeFromRef = useRef(-1);

  const popupCounter = useRef(0);
  const beamCounter  = useRef(0);
  const acidTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimerRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const witherRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { initGameAudio(); }, []);
  useFocusEffect(useCallback(() => { refreshGP(); }, [refreshGP]));

  // Wither check on mount
  useEffect(() => {
    AsyncStorage.getItem(WITHER_KEY).then(v => {
      if (!v) return;
      const until = parseInt(v, 10);
      if (Date.now() < until) { setPhase("withered"); startWitherTick(until); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Acid rain interval
  useEffect(() => {
    if (phase !== "playing") {
      if (acidTimerRef.current) clearInterval(acidTimerRef.current);
      return;
    }
    acidTimerRef.current = setInterval(() => {
      setBoard(prev => {
        const cands = prev.reduce<number[]>((a, c, i) => {
          if (c.type >= 0 && c.type < 5 && !c.vine && c.acid === 0) a.push(i);
          return a;
        }, []);
        if (!cands.length) return prev;
        const pick = cands[Math.floor(Math.random() * cands.length)];
        return prev.map((c, i) => i === pick ? { ...c, acid: 3 } : c);
      });
    }, 11000);
    return () => { if (acidTimerRef.current) clearInterval(acidTimerRef.current); };
  }, [phase]);

  function startWitherTick(until: number) {
    if (witherRef.current) clearInterval(witherRef.current);
    witherRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setWitherSecs(left);
      if (left <= 0) { clearInterval(witherRef.current!); setPhase("idle"); }
    }, 1000);
    setWitherSecs(Math.ceil((until - Date.now()) / 1000));
  }

  function flash(txt: string) {
    setMsg(txt);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setMsg(""), 2400);
  }

  function resetAllAnims() {
    for (const a of cellAnims) {
      a.scale.setValue(1); a.opacity.setValue(1);
      a.dx.setValue(0);    a.dy.setValue(0);
    }
  }

  // ── Score popup ──────────────────────────────────────────────────────────
  function addPopup(text: string, idx: number) {
    const x = (idx % COLS) * CELL + CELL / 2;
    const y = Math.floor(idx / COLS) * CELL - 8;
    const ty = new Animated.Value(0);
    const op = new Animated.Value(1);
    const id = ++popupCounter.current;
    setPopups(ps => [...ps.slice(-8), { id, text, x, y, ty, op }]);
    Animated.parallel([
      Animated.timing(ty, { toValue: -55, duration: 850, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(op, { toValue: 0, duration: 430, useNativeDriver: true }),
      ]),
    ]).start(() => setPopups(ps => ps.filter(p => p.id !== id)));
  }

  // ── Beam spawn ───────────────────────────────────────────────────────────
  function spawnBeams(groups: MatchGroup[]) {
    const newBeams: Beam[] = groups.map(g => {
      const color       = TILE_LT[g.tileType] ?? "#fff";
      const scaleAnim   = new Animated.Value(0);
      const opacityAnim = new Animated.Value(1);
      const id = ++beamCounter.current;
      return g.dir === "h"
        ? { id, dir: "h" as const, color,
            left: g.c * CELL, top: g.r * CELL + TILE * 0.3 + GAP,
            w: g.len * CELL, h: TILE * 0.38, scaleAnim, opacityAnim }
        : { id, dir: "v" as const, color,
            left: g.c * CELL + TILE * 0.3 + GAP, top: g.r * CELL,
            w: TILE * 0.38, h: g.len * CELL, scaleAnim, opacityAnim };
    });
    setBeams(prev => [...prev, ...newBeams]);
    newBeams.forEach(b => {
      Animated.sequence([
        Animated.timing(b.scaleAnim,   { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(80),
        Animated.timing(b.opacityAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(() => setBeams(prev => prev.filter(x => x.id !== b.id)));
    });
  }

  // ── Combo burst ──────────────────────────────────────────────────────────
  function showComboBurst(n: number) {
    setComboText(n === 2 ? "COMBO! 🔥" : n === 3 ? "SUPER! 🔥🔥" : `×${n} MEGA! 🌟`);
    comboOpacity.setValue(1); comboScaleA.setValue(0.5);
    Animated.spring(comboScaleA, { toValue: 1.1, useNativeDriver: true, damping: 8 }).start();
    setTimeout(() => {
      Animated.timing(comboOpacity, { toValue: 0, duration: 350, useNativeDriver: true })
        .start(() => setComboText(""));
    }, 700);
  }

  // ── Start level ──────────────────────────────────────────────────────────
  async function startLevel(lvl: number) {
    const cfg = LEVELS[Math.min(lvl, LEVELS.length - 1)];
    const ok = await spend(5, "enter_level", "save_forest");
    if (!ok) { Alert.alert("Not enough GP", "You need 5 GP to play."); return; }
    resetAllAnims();
    setBoard(makeBoard(lvl));
    setSelected(null);
    setMovesLeft(cfg.moves);
    setPollutedLeft(cfg.polluted);
    setScore(0); setLevel(lvl);
    setPhase("playing");
    setPopups([]); setBeams([]);
    flash(`Level ${lvl + 1}: ${cfg.label} 🌿`);
  }

  async function handleVictory() {
    setPhase("victory");
    const gp = Math.min(10 + Math.floor(score / 100), 40);
    earn(gp, "level_complete", "save_forest").catch(() => {});
    playSound("victory");
    Vibration.vibrate([0, 80, 50, 80, 50, 200]);
    Animated.sequence([
      Animated.timing(boardScale, { toValue: 1.04, duration: 200, useNativeDriver: true }),
      Animated.spring(boardScale, { toValue: 1, useNativeDriver: true, damping: 8 }),
    ]).start();
  }

  async function handleGameOver() {
    setPhase("withered");
    const until = Date.now() + WITHER_MS;
    await AsyncStorage.setItem(WITHER_KEY, String(until));
    startWitherTick(until);
    playSound("invalid");
    Vibration.vibrate([0, 100, 80, 100]);
  }

  // ── Cascade engine ────────────────────────────────────────────────────────
  async function runCascades(startBoard: Cell[]) {
    let cur = startBoard;
    let combo = 0, totalPolluted = 0;
    const newMoves = movesRef.current - 1;

    while (true) {
      // Lightning activation
      const lightIdx = cur.findIndex(c => c.type === LIGHTNING);
      if (lightIdx >= 0) {
        playSound("lightning");
        addPopup("⚡ ZAP!", lightIdx);
        cur = activateLightningRow(cur, lightIdx);
        cur = cur.map((c, i) => i === lightIdx ? { type: EMPTY, vine: false, acid: 0, isNew: false } : c);
      }

      const matched  = findMatches(cur);
      if (matched.size === 0 && lightIdx < 0) break;

      const groups     = findMatchGroups(cur);
      const pollRemove = findPollutedAdj(cur, matched);
      combo++;
      totalPolluted += pollRemove.size;
      const roundGain = matched.size * 8 + pollRemove.size * 20 + (combo > 1 ? combo * 5 : 0);

      if (groups.length) spawnBeams(groups);

      // Pop animation
      const allRemove = [...matched, ...pollRemove];
      if (lightIdx >= 0) allRemove.push(lightIdx);

      await new Promise<void>(res =>
        Animated.parallel(allRemove.map(i =>
          Animated.parallel([
            Animated.sequence([
              Animated.timing(cellAnims[i].scale,   { toValue: 1.3, duration: 95,  useNativeDriver: true }),
              Animated.timing(cellAnims[i].scale,   { toValue: 0,   duration: 115, useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.delay(75),
              Animated.timing(cellAnims[i].opacity, { toValue: 0,   duration: 135, useNativeDriver: true }),
            ]),
          ])
        )).start(() => res())
      );

      playSound(combo > 1 ? "cascade" : "match");
      if (pollRemove.size > 0) addPopup(`+${pollRemove.size * 2} GP 💚`, [...pollRemove][0]);
      else if (roundGain > 20) addPopup(`+${roundGain}`, [...matched][Math.floor(matched.size / 2)]);

      allRemove.forEach(i => { cellAnims[i].scale.setValue(1); cellAnims[i].opacity.setValue(1); });

      // Gravity
      let next = cur.map((c, i) =>
        allRemove.includes(i) ? { type: EMPTY, vine: false, acid: 0, isNew: false } : c
      );
      next = applyGravity(next);

      const lIdx = find4Match(next);
      if (lIdx !== null) next[lIdx] = { type: LIGHTNING, vine: false, acid: 0, isNew: false };

      next.forEach((c, i) => {
        if (c.isNew) {
          cellAnims[i].scale.setValue(0);
          cellAnims[i].dy.setValue(-(Math.floor(i / COLS) + 2) * CELL);
        }
      });

      cur = next;
      setBoard(next);
      setScore(s => s + roundGain);
      if (combo > 1) showComboBurst(combo);

      await wait(40);

      // Spring-in new tiles
      const newIdxs = next.map((c, i) => c.isNew ? i : -1).filter(i => i >= 0);
      if (newIdxs.length) {
        await new Promise<void>(res =>
          Animated.parallel([
            ...newIdxs.map(i => Animated.spring(cellAnims[i].dy,
              { toValue: 0, damping: 14, stiffness: 220, useNativeDriver: true })),
            ...newIdxs.map(i => Animated.spring(cellAnims[i].scale,
              { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true })),
          ]).start(() => res())
        );
        newIdxs.forEach(i => { cellAnims[i].dy.setValue(0); cellAnims[i].scale.setValue(1); });
      }
      await wait(70);
    }

    if (totalPolluted > 0)
      earn(totalPolluted * 2, "cleared_polluted", "save_forest").catch(() => {});

    const newPoll = pollRef.current - totalPolluted;
    setPollutedLeft(Math.max(0, newPoll));
    setMovesLeft(newMoves);

    if (newPoll <= 0)      await handleVictory();
    else if (newMoves <= 0) await handleGameOver();

    isAnimating.current = false;
  }

  // ── doMove (swap two adjacent tiles) ─────────────────────────────────────
  async function doMove(aIdx: number, bIdx: number) {
    if (isAnimating.current || phaseRef.current !== "playing") return;
    isAnimating.current = true;
    setSelected(null);

    const ar = Math.floor(aIdx / COLS), ac = aIdx % COLS;
    const br = Math.floor(bIdx / COLS), bc = bIdx % COLS;
    const dx = (bc - ac) * CELL, dy = (br - ar) * CELL;

    playSound("swipe");

    await new Promise<void>(res =>
      Animated.parallel([
        Animated.timing(cellAnims[aIdx].dx, { toValue:  dx, duration: 160, useNativeDriver: true }),
        Animated.timing(cellAnims[aIdx].dy, { toValue:  dy, duration: 160, useNativeDriver: true }),
        Animated.timing(cellAnims[bIdx].dx, { toValue: -dx, duration: 160, useNativeDriver: true }),
        Animated.timing(cellAnims[bIdx].dy, { toValue: -dy, duration: 160, useNativeDriver: true }),
      ]).start(() => res())
    );

    const swapped = boardRef.current.map(c => ({ ...c }));
    [swapped[aIdx], swapped[bIdx]] = [{ ...swapped[bIdx] }, { ...swapped[aIdx] }];

    if (findMatches(swapped).size === 0) {
      // No match — bounce back
      playSound("invalid");
      Vibration.vibrate([0, 30, 30, 30]);
      Animated.sequence([
        Animated.timing(boardShake, { toValue:  7, duration: 50, useNativeDriver: true }),
        Animated.timing(boardShake, { toValue: -7, duration: 50, useNativeDriver: true }),
        Animated.timing(boardShake, { toValue:  0, duration: 50, useNativeDriver: true }),
      ]).start();
      await new Promise<void>(res =>
        Animated.parallel([
          Animated.timing(cellAnims[aIdx].dx, { toValue: 0, duration: 140, useNativeDriver: true }),
          Animated.timing(cellAnims[aIdx].dy, { toValue: 0, duration: 140, useNativeDriver: true }),
          Animated.timing(cellAnims[bIdx].dx, { toValue: 0, duration: 140, useNativeDriver: true }),
          Animated.timing(cellAnims[bIdx].dy, { toValue: 0, duration: 140, useNativeDriver: true }),
        ]).start(() => res())
      );
      flash("No match — swipe another tile ❌");
      isAnimating.current = false;
      return;
    }

    // Commit swap
    cellAnims[aIdx].dx.setValue(0); cellAnims[aIdx].dy.setValue(0);
    cellAnims[bIdx].dx.setValue(0); cellAnims[bIdx].dy.setValue(0);

    let withAcid = swapped.map(c => ({ ...c, acid: c.acid > 0 ? c.acid - 1 : 0 }));
    const lIdx = find4Match(withAcid);
    if (lIdx !== null) withAcid[lIdx] = { type: LIGHTNING, vine: false, acid: 0, isNew: false };

    setBoard(withAcid);
    await runCascades(withAcid);
  }

  // ── handleTap ────────────────────────────────────────────────────────────
  function handleTap(idx: number) {
    if (isAnimating.current || phaseRef.current !== "playing") return;
    const cell = boardRef.current[idx];
    if (cell.type === EMPTY) return;

    if (cell.type === LIGHTNING) {
      isAnimating.current = true;
      setSelected(null);
      playSound("lightning");
      addPopup("⚡ ZAP!", idx);
      const lit = activateLightningRow(boardRef.current, idx);
      const cleared = lit.map((c, i) =>
        i === idx || (Math.floor(i/COLS)===Math.floor(idx/COLS) && c.type===EMPTY)
          ? { type: EMPTY, vine: false, acid: 0, isNew: false } : c
      );
      const afterG = applyGravity(cleared);
      afterG.forEach((c, i) => {
        if (c.isNew) {
          cellAnims[i].scale.setValue(0);
          cellAnims[i].dy.setValue(-(Math.floor(i/COLS)+2)*CELL);
        }
      });
      setBoard(afterG);
      setTimeout(async () => {
        const nw = afterG.map((c, i) => c.isNew ? i : -1).filter(i => i >= 0);
        if (nw.length) {
          await new Promise<void>(r =>
            Animated.parallel([
              ...nw.map(i => Animated.spring(cellAnims[i].dy,   { toValue: 0, damping: 14, stiffness: 220, useNativeDriver: true })),
              ...nw.map(i => Animated.spring(cellAnims[i].scale, { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true })),
            ]).start(() => r())
          );
          nw.forEach(i => { cellAnims[i].dy.setValue(0); cellAnims[i].scale.setValue(1); });
        }
        isAnimating.current = false;
      }, 40);
      return;
    }

    if (cell.vine) {
      setBoard(prev => prev.map((c, i) => i === idx ? { ...c, vine: false } : c));
      Vibration.vibrate(40); playSound("snap");
      flash("Vine cleared! 🌿"); return;
    }
    if (cell.acid > 0) { flash("Acid tile — neutralise it first ⚗️"); return; }
    if (cell.type === POLLUTED) { flash("Match adjacent tiles to clear ☠️"); return; }

    // Selection toggle
    if (selectedRef.current === idx) {
      cellAnims[idx].scale.setValue(1);
      setSelected(null);
    } else {
      if (selectedRef.current !== null) cellAnims[selectedRef.current].scale.setValue(1);
      setSelected(idx);
      Animated.sequence([
        Animated.timing(cellAnims[idx].scale, { toValue: 1.13, duration: 90, useNativeDriver: true }),
        Animated.spring(cellAnims[idx].scale,  { toValue: 1.0,  useNativeDriver: true, damping: 8 }),
      ]).start();
    }
  }

  // ── PanResponder — board gesture handler ─────────────────────────────────
  //
  // Key design decisions:
  //  1. onStartShouldSetPanResponderCapture = true always claims the touch
  //     so neither parent ScrollViews (idle screen) nor child tile views
  //     can steal it while the game is in "playing" phase.
  //  2. We use gestureState.x0/y0 (page coordinates) and subtract the board's
  //     measured page position so hit-testing is always correct regardless of
  //     which child View absorbed the native touch event.
  //  3. isAnimating is checked only in the release handler, not at claim time,
  //     so fast successive gestures are queued rather than silently dropped.
  //
  const boardPan = useRef(
    PanResponder.create({
      // Always capture when playing — prevents ScrollView / child competition
      onStartShouldSetPanResponder:        () => phaseRef.current === "playing",
      onStartShouldSetPanResponderCapture: () => phaseRef.current === "playing",
      onMoveShouldSetPanResponder:         () => phaseRef.current === "playing",
      onMoveShouldSetPanResponderCapture:  () => phaseRef.current === "playing",

      onPanResponderGrant: (_e, g) => {
        // Page coords minus board page origin = reliable local coords
        const localX = g.x0 - boardPagePos.current.x;
        const localY = g.y0 - boardPagePos.current.y;
        const col = Math.min(COLS - 1, Math.max(0, Math.floor(localX / CELL)));
        const row = Math.min(ROWS - 1, Math.max(0, Math.floor(localY / CELL)));
        swipeFromRef.current = row * COLS + col;
      },

      onPanResponderRelease: (_e, g) => {
        const from = swipeFromRef.current;
        swipeFromRef.current = -1;
        if (from < 0) return;
        if (isAnimating.current) return;   // queue was empty; discard

        const { dx, dy } = g;
        const SWIPE_THRESH = 12;

        if (Math.abs(dx) < SWIPE_THRESH && Math.abs(dy) < SWIPE_THRESH) {
          handleTap(from);
          return;
        }

        const cell = boardRef.current[from];
        if (cell.vine)                  { handleTap(from); return; }
        if (cell.acid > 0)              { flash("Acid tile — neutralise first ⚗️"); return; }
        if (cell.type === POLLUTED)     { flash("Match adjacent tiles to clear ☠️"); return; }
        if (cell.type === LIGHTNING)    { handleTap(from); return; }

        let toIdx = -1;
        if (Math.abs(dx) >= Math.abs(dy)) {
          // Horizontal
          if (dx > 0 && from % COLS < COLS - 1) toIdx = from + 1;
          else if (dx < 0 && from % COLS > 0)   toIdx = from - 1;
        } else {
          // Vertical
          if (dy > 0 && from + COLS < ROWS * COLS) toIdx = from + COLS;
          else if (dy < 0 && from - COLS >= 0)     toIdx = from - COLS;
        }

        if (toIdx >= 0) doMove(from, toIdx);
      },

      onPanResponderTerminate: () => { swipeFromRef.current = -1; },
    })
  ).current;

  // ── Boosters ──────────────────────────────────────────────────────────────
  async function boosterMoves() {
    if (isAnimating.current) return;
    const ok = await spend(10, "buy_moves", "save_forest");
    if (!ok) { flash("Need 10 GP for +5 moves!"); return; }
    setMovesLeft(m => m + 5); flash("+5 Moves! 🎯");
  }

  async function boosterBomb() {
    if (isAnimating.current) return;
    const si = selectedRef.current;
    if (si === null) { flash("Select a tile first to set bomb centre!"); return; }
    const ok = await spend(15, "bomb_booster", "save_forest");
    if (!ok) { flash("Need 15 GP for bomb!"); return; }
    isAnimating.current = true;

    const r = Math.floor(si / COLS), c = si % COLS;
    const explode: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) explode.push(nr * COLS + nc);
      }

    await new Promise<void>(res =>
      Animated.parallel(explode.map(i =>
        Animated.parallel([
          Animated.sequence([
            Animated.timing(cellAnims[i].scale,   { toValue: 1.5, duration: 75,  useNativeDriver: true }),
            Animated.timing(cellAnims[i].scale,   { toValue: 0,   duration: 110, useNativeDriver: true }),
          ]),
          Animated.timing(cellAnims[i].opacity, { toValue: 0, duration: 185, useNativeDriver: true }),
        ])
      )).start(() => res())
    );

    playSound("bomb"); Vibration.vibrate([0, 80, 50, 150]);
    explode.forEach(i => { cellAnims[i].scale.setValue(1); cellAnims[i].opacity.setValue(1); });

    const origPoll = boardRef.current.filter(c => c.type === POLLUTED).length;
    let bombed = boardRef.current.map((cell, i) =>
      explode.includes(i) ? { type: EMPTY, vine: false, acid: 0, isNew: false } : { ...cell }
    );
    bombed = applyGravity(bombed);
    const cleared = origPoll - bombed.filter(c => c.type === POLLUTED).length;

    bombed.forEach((c, i) => {
      if (c.isNew) {
        cellAnims[i].scale.setValue(0);
        cellAnims[i].dy.setValue(-(Math.floor(i/COLS)+2)*CELL);
      }
    });
    setBoard(bombed); setSelected(null);
    setPollutedLeft(p => Math.max(0, p - cleared));
    if (cleared > 0) earn(cleared * 2, "cleared_polluted", "save_forest").catch(() => {});
    addPopup(`💥 +${cleared * 2} GP`, si);

    await wait(40);
    const newIdxs = bombed.map((c, i) => c.isNew ? i : -1).filter(i => i >= 0);
    if (newIdxs.length) {
      await new Promise<void>(res =>
        Animated.parallel([
          ...newIdxs.map(i => Animated.spring(cellAnims[i].dy,
            { toValue: 0, damping: 14, stiffness: 220, useNativeDriver: true })),
          ...newIdxs.map(i => Animated.spring(cellAnims[i].scale,
            { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true })),
        ]).start(() => res())
      );
      newIdxs.forEach(i => { cellAnims[i].dy.setValue(0); cellAnims[i].scale.setValue(1); });
    }

    if (pollRef.current - cleared <= 0) handleVictory();
    isAnimating.current = false;
  }

  async function boosterNeutralise() {
    const ok = await spend(8, "neutralise_acid", "save_forest");
    if (!ok) { flash("Need 8 GP!"); return; }
    setBoard(prev => prev.map(c => ({ ...c, acid: 0 })));
    flash("Acid neutralised! 🧪✅");
  }

  async function bypassWither() {
    const ok = await spend(20, "bypass_wither", "save_forest");
    if (!ok) { Alert.alert("Not enough GP", "You need 20 GP to revive the forest."); return; }
    if (witherRef.current) clearInterval(witherRef.current);
    await AsyncStorage.removeItem(WITHER_KEY);
    setPhase("idle"); setWitherSecs(0);
    flash("Forest revived! 🌲✨");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const cfg         = LEVELS[Math.min(level, LEVELS.length - 1)];
  const progressPct = cfg.polluted > 0 ? (cfg.polluted - pollutedLeft) / cfg.polluted : 1;
  const acidPresent = board.some(c => c.acid > 0);
  const isPlaying   = phase === "playing" || phase === "victory" || phase === "over";

  return (
    <View style={s.root}>
      <LinearGradient colors={["#020c04","#052e16","#14532d"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.title}>🌿 Eco-Match</Text>
          {phase === "playing" && <Text style={s.subtitle}>{cfg.label} · Lv {level + 1}</Text>}
        </View>
        <View style={s.gpBadge}><Text style={s.gpText}>🟢 {gpBalance}</Text></View>
      </View>

      {/* Flash message */}
      {msg !== "" && (
        <View style={s.msgBar}><Text style={s.msgText}>{msg}</Text></View>
      )}

      {/* ── NON-PLAYING: idle / withered — scrollable ── */}
      {!isPlaying && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {phase === "withered" && (
            <View style={s.card}>
              <Text style={s.bigEmoji}>🍂</Text>
              <Text style={s.cardTitle}>Forest Withered</Text>
              <Text style={s.cardBody}>The ecosystem needs time to recover.</Text>
              <Text style={s.witherTimer}>{formatTime(witherSecs)}</Text>
              <Text style={s.cardSub}>Sponsor a tree to bypass instantly</Text>
              <TouchableOpacity style={[s.ctaBtn,{marginTop:12}]} onPress={bypassWither}>
                <Text style={s.ctaBtnText}>🌳 Bypass Cooldown · 20 GP</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === "idle" && (
            <View style={s.card}>
              <Text style={s.bigEmoji}>🌍</Text>
              <Text style={s.cardTitle}>Eco-Match</Text>
              <Text style={s.cardBody}>
                SWIPE tiles in any direction to match 3+ in a row or column.
                Clear all ☠️ Polluted Blocks before moves run out!
              </Text>
              <View style={s.divider} />
              {[
                ...TILE_EMOJI.map((e, i) => `${e} ${TILE_LABEL[i]}`),
                "⚡ Lightning — match 4 in a row to create",
                "☠️ Polluted — clear with adjacent match",
                "🌿 Vine — tap to break first",
                "⚗️ Acid Rain — wears off after 3 moves",
              ].map((row, i) => <Text key={i} style={s.ruleRow}>{row}</Text>)}
              <View style={s.divider} />
              {LEVELS.map((lv, i) => (
                <TouchableOpacity key={i} style={s.levelBtn} onPress={() => startLevel(i)}>
                  <View>
                    <Text style={s.levelTitle}>Level {i+1}: {lv.label}</Text>
                    <Text style={s.levelSub}>{lv.polluted} blocks · {lv.moves} moves · 5 GP</Text>
                  </View>
                  <Ionicons name="leaf" size={20} color="#86efac" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── PLAYING: flat View, NO ScrollView competing with swipes ── */}
      {isPlaying && (
        <View style={s.playArea}>
          {/* Stats */}
          <View style={s.statsBar}>
            <View style={s.stat}>
              <Text style={s.statVal}>{movesLeft}</Text>
              <Text style={s.statLbl}>Moves</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statVal}>{pollutedLeft}</Text>
              <Text style={s.statLbl}>Blocks</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statVal}>{score}</Text>
              <Text style={s.statLbl}>Score</Text>
            </View>
          </View>

          {/* Progress */}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
            <Text style={s.progressLabel}>{cfg.polluted - pollutedLeft}/{cfg.polluted} cleared</Text>
          </View>

          {/* Board wrapper — measure gives exact page position for hit-testing */}
          <Animated.View
            style={[s.boardShakeWrap, {
              transform: [{ translateX: boardShake }, { scale: boardScale }],
            }]}
          >
            <View
              ref={boardViewRef}
              style={s.boardInner}
              onLayout={() => {
                boardViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
                  boardPagePos.current = { x: pageX, y: pageY };
                });
              }}
              {...boardPan.panHandlers}
            >
              {board.map((cell, idx) => (
                <TileView
                  key={idx} cell={cell} idx={idx}
                  selected={selected === idx} anim={cellAnims[idx]}
                />
              ))}
              {beams.map(b  => <BeamView key={b.id} b={b} />)}
              {popups.map(p => <ScorePopupView key={p.id} p={p} />)}
              {comboText !== "" && (
                <Animated.View pointerEvents="none" style={{
                  position: "absolute", left: 0, right: 0,
                  top: ROWS * CELL / 2 - 20, alignItems: "center",
                  transform: [{ scale: comboScaleA }], opacity: comboOpacity,
                }}>
                  <Text style={s.comboText}>{comboText}</Text>
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {phase === "playing" && (
            <Text style={s.hintText}>SWIPE any tile • Tap vines/lightning ⚡</Text>
          )}

          {/* Boosters */}
          {phase === "playing" && (
            <View style={s.boosterRow}>
              <TouchableOpacity style={s.boosterBtn} onPress={boosterMoves}>
                <Text style={s.bIcon}>🎯</Text>
                <Text style={s.bLabel}>+5 Moves</Text>
                <Text style={s.bCost}>10 GP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.boosterBtn} onPress={boosterBomb}>
                <Text style={s.bIcon}>💥</Text>
                <Text style={s.bLabel}>Bomb</Text>
                <Text style={s.bCost}>15 GP</Text>
              </TouchableOpacity>
              {acidPresent && (
                <TouchableOpacity style={[s.boosterBtn,{borderColor:"#fca5a5"}]} onPress={boosterNeutralise}>
                  <Text style={s.bIcon}>🧪</Text>
                  <Text style={s.bLabel}>Neutralise</Text>
                  <Text style={s.bCost}>8 GP</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Victory / Over overlays */}
          {phase === "victory" && (
            <View style={s.card}>
              <Text style={s.bigEmoji}>🎉</Text>
              <Text style={s.cardTitle}>Forest Saved!</Text>
              <Text style={s.cardBody}>Score: {score}</Text>
              <TouchableOpacity style={s.ctaBtn} onPress={() => setPhase("idle")}>
                <Text style={s.ctaBtnText}>🌿 Play Again</Text>
              </TouchableOpacity>
            </View>
          )}
          {phase === "over" && (
            <View style={s.card}>
              <Text style={s.bigEmoji}>🍂</Text>
              <Text style={s.cardTitle}>Forest Withered!</Text>
              <Text style={s.cardBody}>{pollutedLeft} block{pollutedLeft !== 1 ? "s" : ""} remained.</Text>
              <TouchableOpacity style={s.ctaBtn} onPress={bypassWither}>
                <Text style={s.ctaBtnText}>🌳 Bypass Cooldown · 20 GP</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backBtn:  { padding: 6, marginRight: 4 },
  title:    { color: "#fff", fontSize: 18, fontWeight: "800" },
  subtitle: { color: "#86efac", fontSize: 12, marginTop: 1 },
  gpBadge: {
    backgroundColor: "rgba(22,163,74,0.3)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "#16a34a",
  },
  gpText: { color: "#4ade80", fontSize: 13, fontWeight: "700" },

  msgBar: {
    backgroundColor: "rgba(22,163,74,0.9)", marginHorizontal: 16,
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14,
    marginBottom: 4, alignItems: "center",
  },
  msgText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // Playing area is a plain flex column — no ScrollView
  playArea: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },

  statsBar: {
    flexDirection: "row", justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12,
    paddingVertical: 8, marginTop: 8,
  },
  stat:    { alignItems: "center" },
  statVal: { color: "#4ade80", fontSize: 22, fontWeight: "800" },
  statLbl: { color: "#86efac", fontSize: 11 },

  progressTrack: {
    height: 10, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 5,
    marginTop: 6, overflow: "hidden", justifyContent: "center",
  },
  progressFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    backgroundColor: "#16a34a", borderRadius: 5,
  },
  progressLabel: {
    color: "#fff", fontSize: 9, fontWeight: "700", textAlign: "center",
    position: "absolute", left: 0, right: 0,
    textShadowColor: "#000", textShadowRadius: 2,
  },

  // The Animated.View that carries shake/scale — does NOT receive touch events
  boardShakeWrap: { alignSelf: "center", marginTop: 10 },

  // The plain View that receives all touch events via PanResponder
  boardInner: {
    width: COLS * CELL, height: ROWS * CELL,
    overflow: "visible",
  },

  comboText: {
    color: "#fbbf24", fontSize: 24, fontWeight: "900",
    textShadowColor: "#000", textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },

  hintText: {
    color: "rgba(255,255,255,0.4)", fontSize: 11,
    textAlign: "center", marginTop: 6,
  },

  boosterRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 10, marginTop: 10, flexWrap: "wrap",
  },
  boosterBtn: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", minWidth: 80,
  },
  bIcon:  { fontSize: 22 },
  bLabel: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 2 },
  bCost:  { color: "#4ade80", fontSize: 10, marginTop: 1 },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16,
    padding: 20, marginTop: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  bigEmoji:  { fontSize: 52, textAlign: "center", marginBottom: 8 },
  cardTitle: { color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  cardBody:  { color: "#d1fae5", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 4 },
  cardSub:   { color: "#86efac", fontSize: 13, textAlign: "center" },
  divider:   { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 12 },
  ruleRow:   { color: "#a7f3d0", fontSize: 13, marginBottom: 4, textAlign: "center" },
  witherTimer: {
    color: "#fca5a5", fontSize: 36, fontWeight: "800",
    textAlign: "center", marginVertical: 8,
  },
  ctaBtn:    { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  ctaBtnText:{ color: "#fff", fontSize: 15, fontWeight: "800" },
  levelBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 12,
    padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  levelTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  levelSub:   { color: "#86efac", fontSize: 12, marginTop: 2 },
});
