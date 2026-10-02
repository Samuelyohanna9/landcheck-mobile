import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";

const { width: W } = Dimensions.get("window");
const GRID_COLS = 7;
const GRID_ROWS = 6;
const CELL = Math.floor((W - 34) / GRID_COLS);
const BOARD_PAD = 10;
const MILESTONES = [120, 260, 480, 760, 1100];

type TileType = "empty" | "tree" | "river" | "rock" | "animal" | "school" | "flower" | "cabin";
type Tile = { type: TileType };
type SaveState = { grid: Tile[][]; claimedMilestones: number[] };

type ShopItem = {
  type: TileType;
  label: string;
  gp: number;
  color: string;
  description: string;
};

type AdjCombo = {
  a: TileType;
  b: TileType;
  bonus: number;
  label: string;
  icon: string;
};

const SHOP: ShopItem[] = [
  { type: "tree", label: "Tree", gp: 12, color: "#166534", description: "Plant the main canopy layer of your forest." },
  { type: "flower", label: "Flower", gp: 10, color: "#db2777", description: "Bring in pollinators and colour." },
  { type: "river", label: "River", gp: 18, color: "#0284c7", description: "A water line that feeds nearby life." },
  { type: "rock", label: "Rock", gp: 8, color: "#6b7280", description: "Add terrain texture and hardy habitat." },
  { type: "animal", label: "Wildlife", gp: 24, color: "#92400e", description: "Healthy forests welcome wildlife." },
  { type: "cabin", label: "Cabin", gp: 22, color: "#78350f", description: "A ranger post for care and protection." },
  { type: "school", label: "Eco School", gp: 35, color: "#4338ca", description: "Build an education anchor in your forest." },
];

const ITEM_BY_TYPE = SHOP.reduce<Record<TileType, ShopItem | null>>(
  (acc, item) => {
    acc[item.type] = item;
    return acc;
  },
  { empty: null, tree: null, river: null, rock: null, animal: null, school: null, flower: null, cabin: null },
);

const TILE_BG: Record<TileType, string> = {
  empty: "#ecfdf5",
  tree: "#dcfce7",
  river: "#dbeafe",
  rock: "#f3f4f6",
  animal: "#fef3c7",
  school: "#ede9fe",
  flower: "#fdf2f8",
  cabin: "#ffedd5",
};

const ADJACENCY: AdjCombo[] = [
  { a: "river", b: "tree", bonus: 40, label: "Life Source", icon: "Flow" },
  { a: "animal", b: "tree", bonus: 34, label: "Wildlife Haven", icon: "Habitat" },
  { a: "flower", b: "tree", bonus: 24, label: "Pollinator Garden", icon: "Bloom" },
  { a: "cabin", b: "tree", bonus: 26, label: "Forest Ranger", icon: "Care" },
  { a: "school", b: "tree", bonus: 42, label: "Eco Campus", icon: "Learn" },
  { a: "river", b: "animal", bonus: 30, label: "Watering Hole", icon: "Wild" },
  { a: "rock", b: "tree", bonus: 18, label: "Rocky Forest", icon: "Terrain" },
];

const emptyGrid = (): Tile[][] =>
  Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({ type: "empty" as TileType })),
  );

const milestoneReward = (score: number) => {
  switch (score) {
    case 120:
      return 8;
    case 260:
      return 12;
    case 480:
      return 20;
    case 760:
      return 28;
    case 1100:
      return 40;
    default:
      return 0;
  }
};

const calcAdjBonus = (grid: Tile[][]): { total: number; details: { combo: AdjCombo; count: number }[] } => {
  const counts = new Map<AdjCombo, number>();
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
  ];

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      for (const { dr, dc } of directions) {
        const nextRow = row + dr;
        const nextCol = col + dc;
        if (nextRow >= GRID_ROWS || nextCol >= GRID_COLS) continue;
        const a = grid[row][col].type;
        const b = grid[nextRow][nextCol].type;
        for (const combo of ADJACENCY) {
          if ((combo.a === a && combo.b === b) || (combo.a === b && combo.b === a)) {
            counts.set(combo, (counts.get(combo) ?? 0) + 1);
          }
        }
      }
    }
  }

  const details = [...counts.entries()].map(([combo, count]) => ({ combo, count }));
  const total = details.reduce((sum, entry) => sum + entry.combo.bonus * entry.count, 0);
  return { total, details };
};

const forestScore = (grid: Tile[][]) =>
  grid.flat().reduce((sum, tile) => sum + (ITEM_BY_TYPE[tile.type]?.gp ?? 0), 0) + calcAdjBonus(grid).total;

const STORAGE_PREFIX = "grove:forest_builder:v3:";

const ForestBackdrop = () => (
  <Svg width="100%" height="100%" viewBox="0 0 360 180" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
    <Defs>
      <SvgLinearGradient id="heroSky" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#ecfeff" />
        <Stop offset="100%" stopColor="#bbf7d0" />
      </SvgLinearGradient>
    </Defs>
    <Rect x="0" y="0" width="360" height="180" fill="url(#heroSky)" />
    <Circle cx="302" cy="38" r="24" fill="rgba(253,224,71,0.65)" />
    <Path d="M0 132 C55 95 115 154 180 123 S310 94 360 126 L360 180 L0 180 Z" fill="#86efac" />
    <Path d="M0 148 C58 120 130 174 206 144 S310 122 360 150 L360 180 L0 180 Z" fill="#22c55e" opacity="0.32" />
    <Rect x="98" y="64" width="18" height="72" rx="8" fill="#8b5a2b" />
    <Rect x="244" y="78" width="15" height="58" rx="7" fill="#8b5a2b" />
    <Circle cx="108" cy="56" r="34" fill="#16a34a" />
    <Circle cx="88" cy="50" r="22" fill="#22c55e" />
    <Circle cx="126" cy="44" r="20" fill="#4ade80" />
    <Circle cx="252" cy="70" r="28" fill="#15803d" />
    <Circle cx="236" cy="64" r="18" fill="#22c55e" />
    <Circle cx="268" cy="60" r="16" fill="#65a30d" />
    <Path d="M160 132 C175 112 205 108 221 132" stroke="#38bdf8" strokeWidth="10" strokeLinecap="round" fill="none" />
  </Svg>
);

const TileArt = ({ type, size = CELL - 14 }: { type: TileType; size?: number }) => {
  if (type === "empty") return null;

  const renderArt = () => {
    switch (type) {
      case "tree":
        return (
          <>
            <Rect x="26" y="38" width="12" height="24" rx="5" fill="#8b5a2b" />
            <Circle cx="32" cy="30" r="18" fill="#15803d" />
            <Circle cx="20" cy="32" r="12" fill="#22c55e" />
            <Circle cx="44" cy="30" r="10" fill="#4ade80" />
          </>
        );
      case "river":
        return (
          <>
            <Path d="M16 18 C26 12 34 22 42 18 C48 16 52 20 54 26 C50 30 44 28 40 32 C34 38 28 38 22 34 C18 32 14 26 16 18 Z" fill="#38bdf8" />
            <Path d="M18 22 C24 18 31 24 38 21 C44 18 47 24 48 28" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        );
      case "rock":
        return (
          <>
            <Path d="M14 42 L24 20 L42 18 L52 34 L40 50 L22 50 Z" fill="#9ca3af" />
            <Path d="M24 20 L33 28 L42 18" stroke="#d1d5db" strokeWidth="2" fill="none" />
          </>
        );
      case "animal":
        return (
          <>
            <Path d="M20 42 C18 32 24 22 34 22 C44 22 49 30 48 42 Z" fill="#b45309" />
            <Circle cx="28" cy="26" r="7" fill="#d97706" />
            <Circle cx="41" cy="28" r="6" fill="#d97706" />
            <Path d="M24 18 L20 11 M29 18 L26 10 M39 20 L41 12 M44 22 L49 16" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
          </>
        );
      case "school":
        return (
          <>
            <Rect x="16" y="22" width="34" height="28" rx="6" fill="#818cf8" />
            <Path d="M14 24 L33 12 L52 24" fill="#4338ca" />
            <Rect x="28" y="34" width="10" height="16" rx="3" fill="#e0e7ff" />
            <Rect x="20" y="30" width="6" height="6" rx="2" fill="#eef2ff" />
            <Rect x="40" y="30" width="6" height="6" rx="2" fill="#eef2ff" />
          </>
        );
      case "flower":
        return (
          <>
            <Path d="M32 26 V48" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" />
            <Circle cx="32" cy="22" r="7" fill="#facc15" />
            <Circle cx="22" cy="22" r="6" fill="#f472b6" />
            <Circle cx="42" cy="22" r="6" fill="#f472b6" />
            <Circle cx="28" cy="14" r="6" fill="#ec4899" />
            <Circle cx="36" cy="14" r="6" fill="#ec4899" />
            <Path d="M30 36 C24 32 18 33 16 38" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        );
      case "cabin":
      default:
        return (
          <>
            <Path d="M16 30 L32 16 L48 30" fill="#92400e" />
            <Rect x="18" y="30" width="28" height="22" rx="5" fill="#d97706" />
            <Rect x="28" y="36" width="8" height="16" rx="3" fill="#fef3c7" />
            <Rect x="22" y="36" width="5" height="6" rx="2" fill="#fff7ed" />
            <Rect x="38" y="36" width="5" height="6" rx="2" fill="#fff7ed" />
          </>
        );
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {renderArt()}
    </Svg>
  );
};

export const ForestBuilderGame = () => {
  const { session } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh, spend, earn } = useGameGP(session);

  const [grid, setGrid] = useState<Tile[][]>(emptyGrid());
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [placing, setPlacing] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [comboFlash, setComboFlash] = useState<string | null>(null);
  const [claimedMilestones, setClaimedMilestones] = useState<number[]>([]);

  const gridRef = useRef<Tile[][]>(emptyGrid());
  const selectedRef = useRef<ShopItem | null>(null);
  const claimedMilestonesRef = useRef<number[]>([]);
  const dragAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const boardRef = useRef<any>(null);
  const boardBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const storageKey = session ? STORAGE_PREFIX + session.user.id : STORAGE_PREFIX + "anon";

  const captureBoardBounds = useCallback(() => {
    requestAnimationFrame(() => {
      boardRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
        boardBoundsRef.current = { x, y, width, height };
      });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadState();
      captureBoardBounds();
    }, [captureBoardBounds, refresh]),
  );

  const loadState = async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      gridRef.current = emptyGrid();
      claimedMilestonesRef.current = [];
      setGrid(emptyGrid());
      setClaimedMilestones([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      let loadedGrid = emptyGrid();
      let loadedMilestones: number[] = [];

      if (Array.isArray(parsed)) {
        loadedGrid = parsed;
        loadedMilestones = MILESTONES.filter((score) => forestScore(loadedGrid) >= score);
      } else if (parsed && Array.isArray(parsed.grid)) {
        loadedGrid = parsed.grid;
        loadedMilestones = Array.isArray(parsed.claimedMilestones)
          ? parsed.claimedMilestones.filter((value: number) => MILESTONES.includes(value))
          : MILESTONES.filter((score) => forestScore(loadedGrid) >= score);
      }

      gridRef.current = loadedGrid;
      claimedMilestonesRef.current = loadedMilestones;
      setGrid(loadedGrid);
      setClaimedMilestones(loadedMilestones);
      await AsyncStorage.setItem(storageKey, JSON.stringify({ grid: loadedGrid, claimedMilestones: loadedMilestones }));
    } catch {
      const fallback = emptyGrid();
      gridRef.current = fallback;
      claimedMilestonesRef.current = [];
      setGrid(fallback);
      setClaimedMilestones([]);
    }
  };

  const saveState = async (nextGrid: Tile[][], nextMilestones: number[] = claimedMilestonesRef.current) => {
    await AsyncStorage.setItem(storageKey, JSON.stringify({ grid: nextGrid, claimedMilestones: nextMilestones }));
  };

  const pageToCell = (pageX: number, pageY: number): { row: number; col: number } | null => {
    const bounds = boardBoundsRef.current;
    if (!bounds) return null;
    const col = Math.floor((pageX - bounds.x - BOARD_PAD) / CELL);
    const row = Math.floor((pageY - bounds.y - BOARD_PAD) / CELL);
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null;
    return { row, col };
  };

  const placeAt = async (row: number, col: number, item: ShopItem) => {
    if (placing) return;
    if (gridRef.current[row][col].type !== "empty") {
      Vibration.vibrate(60);
      return;
    }

    setPlacing(true);
    const ok = await spend(item.gp, `place_${item.type}`, "forest_builder");
    if (!ok) {
      Alert.alert("Not enough GP", `You need ${item.gp} GP to place ${item.label.toLowerCase()}.`);
      setPlacing(false);
      return;
    }

    Vibration.vibrate(26);
    const nextGrid = gridRef.current.map((gridRow, gridRowIndex) =>
      gridRow.map((cell, gridColIndex) => (gridRowIndex === row && gridColIndex === col ? { type: item.type } : cell)),
    );
    gridRef.current = nextGrid;
    setGrid([...nextGrid]);

    const { details } = calcAdjBonus(nextGrid);
    const newCombos = details.filter((detail) => detail.count > 0);
    if (newCombos.length > 0) {
      const bestCombo = newCombos.sort((a, b) => b.combo.bonus - a.combo.bonus)[0];
      setComboFlash(`${bestCombo.combo.label} +${bestCombo.combo.bonus * bestCombo.count}`);
      Vibration.vibrate([0, 26, 18, 26]);
      setTimeout(() => setComboFlash(null), 1800);
    }

    const score = forestScore(nextGrid);
    const newlyClaimed = MILESTONES.filter(
      (milestone) => score >= milestone && !claimedMilestonesRef.current.includes(milestone),
    );
    if (newlyClaimed.length > 0) {
      const updatedMilestones = [...claimedMilestonesRef.current, ...newlyClaimed].sort((a, b) => a - b);
      claimedMilestonesRef.current = updatedMilestones;
      setClaimedMilestones(updatedMilestones);
      await saveState(nextGrid, updatedMilestones);
      const totalReward = newlyClaimed.reduce((sum, milestone) => sum + milestoneReward(milestone), 0);
      const actual = await earn(totalReward, `forest_milestone_${newlyClaimed.join("_")}`, "forest_builder");
      setComboFlash(`Milestone reward +${actual} GP`);
      setTimeout(() => setComboFlash(null), 2400);
    } else {
      await saveState(nextGrid);
    }

    setPlacing(false);
  };

  const dragPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!selectedRef.current,
      onMoveShouldSetPanResponder: () => !!selectedRef.current,
      onPanResponderGrant: (event) => {
        if (!selectedRef.current) return;
        captureBoardBounds();
        const { pageX, pageY } = event.nativeEvent;
        dragAnim.setValue({ x: pageX - 28, y: pageY - 28 });
        setDragActive(true);
        setHoverCell(pageToCell(pageX, pageY));
      },
      onPanResponderMove: (event) => {
        if (!selectedRef.current) return;
        const { pageX, pageY } = event.nativeEvent;
        dragAnim.setValue({ x: pageX - 28, y: pageY - 28 });
        setHoverCell(pageToCell(pageX, pageY));
      },
      onPanResponderRelease: (event) => {
        const item = selectedRef.current;
        setDragActive(false);
        const { pageX, pageY } = event.nativeEvent;
        const cell = pageToCell(pageX, pageY);
        setHoverCell(null);
        if (item && cell) {
          void placeAt(cell.row, cell.col, item);
        }
      },
      onPanResponderTerminate: () => {
        setDragActive(false);
        setHoverCell(null);
      },
    }),
  ).current;

  const selectItem = (item: ShopItem) => {
    const next = selected?.type === item.type ? null : item;
    setSelected(next);
    selectedRef.current = next;
  };

  const clearCell = async (row: number, col: number) => {
    if (gridRef.current[row][col].type === "empty") return;
    const nextGrid = gridRef.current.map((gridRow, gridRowIndex) =>
      gridRow.map((cell, gridColIndex) => (gridRowIndex === row && gridColIndex === col ? { type: "empty" as TileType } : cell)),
    );
    gridRef.current = nextGrid;
    setGrid([...nextGrid]);
    await saveState(nextGrid);
    Vibration.vibrate(34);
  };

  const tapCell = async (row: number, col: number) => {
    if (!selected || placing) return;
    await placeAt(row, col, selected);
  };

  const { total: adjBonus, details: adjDetails } = calcAdjBonus(grid);
  const tileScore = grid.flat().reduce((sum, tile) => sum + (ITEM_BY_TYPE[tile.type]?.gp ?? 0), 0);
  const totalScore = tileScore + adjBonus;
  const tileCount = grid.flat().filter((tile) => tile.type !== "empty").length;
  const nextMilestone = MILESTONES.find((milestone) => milestone > totalScore) ?? null;
  const previousMilestone = [...MILESTONES].reverse().find((milestone) => milestone <= totalScore) ?? 0;
  const progressToNext = nextMilestone
    ? ((totalScore - previousMilestone) / Math.max(nextMilestone - previousMilestone, 1)) * 100
    : 100;
  const ecosystemLevel = Math.min(5, 1 + Math.floor(totalScore / 220));

  const boardSummary = useMemo(
    () => [
      { label: "Tiles", value: String(tileCount) },
      { label: "Score", value: totalScore.toLocaleString() },
      { label: "Level", value: `E${ecosystemLevel}` },
    ],
    [ecosystemLevel, tileCount, totalScore],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={["#ecfeff", "#dcfce7", "#f0fdf4"]} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <ForestBackdrop />
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>Creative Grove</Text>
            <Text style={styles.title}>Forest Builder</Text>
            <Text style={styles.subtitle}>Place habitat pieces, trigger combos, and grow your ecosystem.</Text>
          </View>
          <View style={styles.gpBadge}>
            <Text style={styles.gpValue}>{loading ? "—" : gpBalance}</Text>
            <Text style={styles.gpLabel}>GP</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          {boardSummary.map((item) => (
            <View key={item.label} style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{item.value}</Text>
              <Text style={styles.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Milestone progress</Text>
            <Text style={styles.progressMeta}>
              {nextMilestone ? `${Math.max(nextMilestone - totalScore, 0)} pts to ${nextMilestone}` : "All milestone rewards claimed"}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(progressToNext, 100))}%` as const }]} />
          </View>
        </View>
      </LinearGradient>

      <View style={styles.boardWrap}>
        <View style={styles.boardCard} ref={boardRef} onLayout={captureBoardBounds} {...dragPan.panHandlers}>
          <LinearGradient colors={["#ffffff", "#f6fff9"]} style={styles.boardGradient}>
            {grid.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((cell, colIndex) => {
                  const isHover = hoverCell?.row === rowIndex && hoverCell?.col === colIndex;
                  const isEmpty = cell.type === "empty";
                  const canPlace = Boolean(selected) && isEmpty;

                  return (
                    <Pressable
                      key={`${rowIndex}-${colIndex}`}
                      onPress={() => tapCell(rowIndex, colIndex)}
                      onLongPress={() => clearCell(rowIndex, colIndex)}
                      style={[
                        styles.cell,
                        { backgroundColor: isHover && canPlace ? "#d1fae5" : TILE_BG[cell.type] },
                        canPlace && !isHover ? styles.cellSelectable : null,
                        isHover && canPlace ? styles.cellHover : null,
                      ]}
                    >
                      {!isEmpty ? (
                        <TileArt type={cell.type} />
                      ) : selected ? (
                        <View style={styles.placeholderTile}>
                          {isHover ? <TileArt type={selected.type} size={CELL - 20} /> : <Ionicons name="add" size={18} color="#16a34a" />}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}

            {dragActive && selected ? (
              <Animated.View
                style={[styles.ghost, { transform: [{ translateX: dragAnim.x }, { translateY: dragAnim.y }] }]}
                pointerEvents="none"
              >
                <TileArt type={selected.type} size={50} />
              </Animated.View>
            ) : null}

            {comboFlash ? (
              <View style={styles.comboFlash} pointerEvents="none">
                <Text style={styles.comboTxt}>{comboFlash}</Text>
              </View>
            ) : null}

            {!selected ? (
              <View style={styles.hintWrap} pointerEvents="none">
                <Text style={styles.hintTxt}>Choose a habitat piece below, then tap or drag it onto the board.</Text>
              </View>
            ) : null}
          </LinearGradient>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{adjBonus}</Text>
            <Text style={styles.metricLabel}>Combo bonus</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{claimedMilestones.length}</Text>
            <Text style={styles.metricLabel}>Rewards unlocked</Text>
          </View>
        </View>
      </View>

      {adjDetails.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.combosStrip} contentContainerStyle={styles.comboStripContent}>
          {adjDetails.map(({ combo, count }) => (
            <View key={combo.label} style={styles.comboChip}>
              <Text style={styles.comboChipIcon}>{combo.icon}</Text>
              <View style={styles.comboChipBody}>
                <Text style={styles.comboChipTitle}>{combo.label}</Text>
                <Text style={styles.comboChipSub}>x{count} chain</Text>
              </View>
              <Text style={styles.comboChipBonus}>+{combo.bonus * count}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.shop, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.shopHeader}>
          <View>
            <Text style={styles.shopTitle}>Habitat Nursery</Text>
            <Text style={styles.shopSub}>Long-press a tile to clear it. GP prices are tuned for sponsor play.</Text>
          </View>
          {selected ? (
            <Pressable
              onPress={() => {
                setSelected(null);
                selectedRef.current = null;
              }}
              style={styles.clearSelectionBtn}
            >
              <Text style={styles.clearSelectionTxt}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shopScroll}>
          {SHOP.map((item) => (
            <Pressable
              key={item.type}
              onPress={() => selectItem(item)}
              style={({ pressed }) => [
                styles.shopCard,
                selected?.type === item.type ? styles.shopCardSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={[styles.shopArt, { backgroundColor: `${item.color}15` }]}>
                <TileArt type={item.type} size={44} />
              </View>
              <Text style={styles.shopLabel}>{item.label}</Text>
              <Text style={styles.shopDesc} numberOfLines={2}>
                {item.description}
              </Text>
              <View style={[styles.shopCostBadge, { backgroundColor: item.color }]}>
                <Text style={styles.shopCostTxt}>{item.gp} GP</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {selected ? (
          <View style={styles.selectedBanner}>
            <Text style={styles.selectedBannerTitle}>{selected.label} selected</Text>
            <Text style={styles.selectedBannerText}>{selected.description}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#effcf4" },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    overflow: "hidden",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.86)",
  },
  titleWrap: { flex: 1, paddingTop: 2 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#15803d",
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.8,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#35564a",
    marginTop: 6,
    maxWidth: 220,
  },
  gpBadge: {
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.88)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gpValue: { fontSize: 18, fontWeight: "900", color: "#fff" },
  gpLabel: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.72)", marginTop: 1 },
  summaryRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  summaryCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.84)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  summaryValue: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  summaryLabel: { fontSize: 11, fontWeight: "700", color: "#4b5563", marginTop: 3 },
  progressCard: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
  },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  progressTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a" },
  progressMeta: { flex: 1, fontSize: 10, color: "#4b5563", textAlign: "right" },
  progressTrack: {
    height: 10,
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#16a34a",
  },
  boardWrap: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  boardCard: {
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: "#14532d",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  boardGradient: { padding: BOARD_PAD },
  row: { flexDirection: "row", gap: 4, marginBottom: 4 },
  cell: {
    width: CELL - 3,
    height: CELL - 3,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  cellSelectable: { borderColor: "#22c55e", borderStyle: "dashed", borderWidth: 1.5 },
  cellHover: { borderColor: "#16a34a", borderWidth: 2 },
  placeholderTile: { alignItems: "center", justifyContent: "center" },
  ghost: {
    position: "absolute",
    zIndex: 40,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.36)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  comboFlash: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    backgroundColor: "rgba(15,118,110,0.92)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  comboTxt: { fontSize: 12, fontWeight: "900", color: "#fff" },
  hintWrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    alignItems: "center",
  },
  hintTxt: {
    fontSize: 11,
    lineHeight: 16,
    color: "#35564a",
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metricsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#dcfce7",
  },
  metricValue: { fontSize: 20, fontWeight: "900", color: "#166534" },
  metricLabel: { fontSize: 11, fontWeight: "700", color: "#4b5563", marginTop: 4 },
  combosStrip: { maxHeight: 70, marginTop: 10 },
  comboStripContent: { paddingHorizontal: 14, gap: 10, paddingRight: 24 },
  comboChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff7ed",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  comboChipIcon: {
    fontSize: 11,
    fontWeight: "900",
    color: "#9a3412",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  comboChipBody: { justifyContent: "center" },
  comboChipTitle: { fontSize: 12, fontWeight: "900", color: "#7c2d12" },
  comboChipSub: { fontSize: 10, color: "#9a3412", marginTop: 2 },
  comboChipBonus: { fontSize: 14, fontWeight: "900", color: "#ea580c" },
  shop: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 14,
    shadowColor: "#14532d",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  shopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    gap: 14,
  },
  shopTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  shopSub: { fontSize: 11, color: "#4b5563", marginTop: 4, lineHeight: 16, maxWidth: 240 },
  clearSelectionBtn: {
    backgroundColor: "#fee2e2",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearSelectionTxt: { fontSize: 11, fontWeight: "900", color: "#dc2626" },
  shopScroll: { paddingHorizontal: 14, gap: 10, paddingTop: 14, paddingRight: 22 },
  shopCard: {
    width: 140,
    backgroundColor: "#f8fffb",
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  shopCardSelected: {
    borderColor: "#22c55e",
    borderWidth: 2,
    backgroundColor: "#ecfdf5",
  },
  shopArt: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  shopLabel: { fontSize: 13, fontWeight: "900", color: "#0f172a", marginTop: 12 },
  shopDesc: { fontSize: 10, lineHeight: 14, color: "#4b5563", marginTop: 6, minHeight: 28 },
  shopCostBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },
  shopCostTxt: { fontSize: 10, fontWeight: "900", color: "#fff" },
  selectedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#effcf4",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  selectedBannerTitle: { fontSize: 12, fontWeight: "900", color: "#166534" },
  selectedBannerText: { fontSize: 11, lineHeight: 16, color: "#35564a", marginTop: 4 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
});
