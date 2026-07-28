import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EmptyState } from "../../components/EmptyState";
import type { SponsorAppStackParamList } from "../../types/navigation";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { SelectSheet, type SelectOption } from "../../components/SelectSheet";
import {
  fetchSponsorOrders,
  fetchSponsorTrees,
  fetchSponsorAchievements,
  fetchSponsorPoints,
  updateSponsorProfileSettings,
  updateSponsorAppearance,
  updateSponsorProfilePhoto,
  type SponsorAchievements,
  type SponsorPointsInfo,
} from "../../api/sponsor";
import { uploadGreenPhoto } from "../../api/green";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import {
  getSponsorAvatarBorderMeta,
  getSponsorMapIconCelebration,
  getSponsorMapIconMeta,
  normalizeSponsorAvatarBorder,
  normalizeSponsorMapIcon,
  SPONSOR_AVATAR_BORDERS,
} from "../../sponsor/appearance";
import { getSponsorFirstName, getSponsorGreeting, getSponsorGreetingIcon } from "../../sponsor/presentation";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatCurrencyAmount } from "../../utils/currency";
import { formatDateTime, toTitle } from "../../utils/format";
import { resolveGreenAssetUrl } from "../../utils/assets";
import type { DraftPhoto, SponsorOrderSummary, SponsorTreeSummary } from "../../types/domain";

const sponsorHeroBackground = require("../../../assets/background-sponsor.png");

const categoryOptions: SelectOption[] = [
  { value: "individual", label: "Individual", description: "Sponsoring as a private individual." },
  { value: "school", label: "School", description: "Sponsoring as an educational institution." },
  { value: "community", label: "Community", description: "Sponsoring as a neighborhood or social group." },
  { value: "company", label: "Company", description: "Sponsoring as a business or corporation." },
];

const visibilityOptions: SelectOption[] = [
  { value: "public", label: "Public", description: "Show your name and monthly trees on the public leaderboard." },
  { value: "anonymous", label: "Anonymous", description: "Hide your account from the public leaderboard." },
];

const STORAGE_PHOTO_KEY = (id: number) => `lc_sphoto_${id}`;
const STORAGE_BORDER_KEY = (id: number) => `lc_sborder_${id}`;

const isLocalPhotoUri = (value?: string | null) => /^(file|content|ph|assets-library):/i.test(String(value || "").trim());

export const SponsorProfileScreen = () => {
  const { session, signOut, updateSessionUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<SponsorAppStackParamList>>();
  const [orders, setOrders] = useState<SponsorOrderSummary[]>([]);
  const [trees, setTrees] = useState<SponsorTreeSummary[]>([]);
  const [achievements, setAchievements] = useState<SponsorAchievements | null>(null);
  const [pointsInfo, setPointsInfo] = useState<SponsorPointsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [entityCategory, setEntityCategory] = useState(session?.user?.entity_category || "individual");
  const [leaderboardVisibility, setLeaderboardVisibility] = useState(session?.user?.leaderboard_visibility || "public");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [visibilityPickerOpen, setVisibilityPickerOpen] = useState(false);

  // Local avatar state (persisted to AsyncStorage, synced with API best-effort)
  const [localPhotoUri, setLocalPhotoUri] = useState<string>("");
  const [localBorder, setLocalBorder] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Pulse animation for golden/emerald borders
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const hydrateLocalIdentity = useCallback(async () => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const [storedPhoto, storedBorder] = await Promise.all([
      AsyncStorage.getItem(STORAGE_PHOTO_KEY(uid)).catch(() => null),
      AsyncStorage.getItem(STORAGE_BORDER_KEY(uid)).catch(() => null),
    ]);
    const sessionPhoto = String(session.user.profile_photo_url || "").trim();
    const nextPhoto = String(storedPhoto || "").trim();
    setLocalPhotoUri(
      isLocalPhotoUri(nextPhoto)
        ? nextPhoto
        : sessionPhoto || nextPhoto || "",
    );
    setLocalBorder(normalizeSponsorAvatarBorder(storedBorder));
  }, [session?.user?.id, session?.user?.profile_photo_url]);

  useEffect(() => {
    void hydrateLocalIdentity();
  }, [hydrateLocalIdentity]);

  useFocusEffect(
    useCallback(() => {
      void hydrateLocalIdentity();
    }, [hydrateLocalIdentity]),
  );

  // Animate when border changes
  const displayBorder = normalizeSponsorAvatarBorder(localBorder ?? pointsInfo?.current_avatar_border);
  useEffect(() => {
    const meta = getSponsorAvatarBorderMeta(displayBorder);
    const shouldPulse = Boolean(meta);
    if (pulseRef.current) { pulseRef.current.stop(); pulseRef.current = null; }
    if (!shouldPulse) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.07, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1100, useNativeDriver: true }),
      ])
    );
    pulseRef.current = loop;
    loop.start();
    return () => { loop.stop(); };
  }, [displayBorder, pulseAnim]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    setError("");
    try {
      const [orderRows, treeRows, achs, points] = await Promise.all([
        fetchSponsorOrders(session),
        fetchSponsorTrees(session),
        fetchSponsorAchievements(session),
        fetchSponsorPoints(session),
      ]);
      setOrders(orderRows);
      setTrees(treeRows);
      setAchievements(achs);
      setPointsInfo(points);
      if (session.user.entity_category) setEntityCategory(session.user.entity_category);
      if (session.user.leaderboard_visibility) setLeaderboardVisibility(session.user.leaderboard_visibility);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load your sponsor profile."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const handleUpdateCategory = async (value: string) => {
    if (!session) return;
    setEntityCategory(value);
    try {
      await updateSponsorProfileSettings(session, { entity_category: value });
      await updateSessionUser({ entity_category: value });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update category."));
    }
  };

  const handleUpdateVisibility = async (value: string) => {
    if (!session) return;
    setLeaderboardVisibility(value);
    try {
      await updateSponsorProfileSettings(session, { leaderboard_visibility: value });
      await updateSessionUser({ leaderboard_visibility: value });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update visibility."));
    }
  };

  const handlePickPhoto = async () => {
    if (!session) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow access to your photo library to set a profile photo.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      setLocalPhotoUri(uri);
      await AsyncStorage.setItem(STORAGE_PHOTO_KEY(session.user.id), uri);
      const photo: DraftPhoto = {
        uri,
        fileName: asset.fileName || `sponsor-profile-${session.user.id}-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        fileSize: asset.fileSize,
      };
      const uploadedUrl = await uploadGreenPhoto({ photo, folder: "sponsor-profiles" });
      if (!uploadedUrl) {
        throw new Error("Profile photo upload did not return a file URL.");
      }
      await updateSponsorProfilePhoto(session, uploadedUrl);
      await updateSessionUser({ profile_photo_url: uploadedUrl });
      setPointsInfo((prev) => (prev ? { ...prev, profile_photo_url: uploadedUrl } : prev));
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Could not load the selected photo."));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleEquipBorder = async (borderName: string | null) => {
    if (!session) return;
    const nextBorder = normalizeSponsorAvatarBorder(borderName);
    const previousBorder = displayBorder;
    setLocalBorder(nextBorder);
    setPointsInfo((prev) => prev ? { ...prev, current_avatar_border: nextBorder } : prev);
    if (nextBorder !== null) {
      await AsyncStorage.setItem(STORAGE_BORDER_KEY(session.user.id), nextBorder);
    } else {
      await AsyncStorage.removeItem(STORAGE_BORDER_KEY(session.user.id));
    }
    try {
      await updateSponsorAppearance(session, {
        avatar_border: nextBorder,
        map_icon: normalizeSponsorMapIcon(pointsInfo?.current_map_icon),
      });
    } catch (error) {
      setLocalBorder(previousBorder);
      setPointsInfo((prev) => prev ? { ...prev, current_avatar_border: previousBorder } : prev);
      if (previousBorder) {
        await AsyncStorage.setItem(STORAGE_BORDER_KEY(session.user.id), previousBorder);
      } else {
        await AsyncStorage.removeItem(STORAGE_BORDER_KEY(session.user.id));
      }
      Alert.alert("Error", getErrorMessage(error, "Could not equip that border."));
    }
  };

  const greeting = useMemo(() => getSponsorGreeting(), []);
  const greetingIcon = useMemo(() => getSponsorGreetingIcon(), []);
  const firstName = useMemo(() => getSponsorFirstName(session?.user.full_name), [session?.user.full_name]);
  const totalSpend = useMemo(() => orders.reduce((sum, item) => sum + Number(item.amount_total || 0), 0), [orders]);
  const carbonTotal = useMemo(() => trees.reduce((sum, item) => sum + Number(item.carbon?.current_co2_kg || 0), 0), [trees]);
  const linkedTrees = useMemo(() => trees.filter((item) => Number(item.tree_id || 0) > 0).length, [trees]);
  const levelName = achievements?.level || "Climate Contributor";
  const badgeEmoji = achievements?.badge_emoji || "🌱";

  // Display values
  const displayPhotoUri = useMemo(() => {
    const local = String(localPhotoUri || "").trim();
    if (/^(file|content|ph|assets-library):/i.test(local)) return local;
    const sessionPhoto = resolveGreenAssetUrl(session?.user?.profile_photo_url || "");
    if (sessionPhoto) return sessionPhoto;
    const pointsPhoto = resolveGreenAssetUrl(pointsInfo?.profile_photo_url || "");
    if (pointsPhoto) return pointsPhoto;
    return local ? resolveGreenAssetUrl(local) : "";
  }, [localPhotoUri, pointsInfo?.profile_photo_url, session?.user?.profile_photo_url]);
  const borderMeta = getSponsorAvatarBorderMeta(displayBorder);
  const equippedMapIcon = normalizeSponsorMapIcon(pointsInfo?.current_map_icon);
  const mapIconMeta = getSponsorMapIconMeta(equippedMapIcon);
  const unlockedBorderKeys = useMemo(
    () =>
      Array.from(
        new Set(
          (pointsInfo?.unlocked_avatars || [])
            .map((item) => normalizeSponsorAvatarBorder(item))
            .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        ),
      ),
    [pointsInfo?.unlocked_avatars],
  );
  const allBorders = useMemo(
    () =>
      SPONSOR_AVATAR_BORDERS.filter(
        (item) => unlockedBorderKeys.includes(item.id) || item.id === displayBorder,
      ),
    [displayBorder, unlockedBorderKeys],
  );
  const handleMapIconPress = useCallback((value: unknown) => {
    const celebration = getSponsorMapIconCelebration(value);
    if (!celebration) return;
    Alert.alert(celebration.title, celebration.message);
  }, []);

  if (!session) return null;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void loadData()} contentContainerStyle={styles.scrollContent}>
      {/* ─── Header ─── */}
      <View style={styles.headerContainer}>
        <ExpoImage source={sponsorHeroBackground} contentFit="cover" style={styles.headerBgImage} />
        <LinearGradient
          colors={["#f9fcf9", "rgba(249, 252, 249, 0.88)", "rgba(249, 252, 249, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View style={styles.topRow}>
          {/* Avatar with border effect */}
          <Pressable onPress={handlePickPhoto} style={styles.avatarPressable}>
            <Animated.View
              style={[
                styles.avatarOuter,
                borderMeta
                  ? {
                      borderColor: borderMeta.borderColor,
                      shadowColor: borderMeta.borderColor,
                      shadowOpacity: 0.65,
                      shadowRadius: 10,
                      elevation: 8,
                    }
                  : undefined,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              {displayPhotoUri ? (
                <ExpoImage
                  source={{ uri: displayPhotoUri }}
                  style={styles.avatarImg}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
              )}
              {/* Camera badge */}
              <View style={styles.cameraBadge}>
                {uploadingPhoto
                  ? <ActivityIndicator size={10} color="white" />
                  : <Ionicons name="camera" size={11} color="white" />}
              </View>
            </Animated.View>
          </Pressable>

          {mapIconMeta ? (
            <Pressable
              onPress={() => handleMapIconPress(mapIconMeta.id)}
              style={[styles.profileHeaderMarkerPreview, { backgroundColor: mapIconMeta.backgroundColor, borderColor: mapIconMeta.borderColor }]}
            >
              <Ionicons name={mapIconMeta.iconName} size={18} color={mapIconMeta.iconColor} />
              <View style={[styles.profileHeaderMarkerSpark, { backgroundColor: mapIconMeta.iconSecondaryColor }]} />
            </Pressable>
          ) : (
            <View style={styles.sunnyIcon}>
              <Ionicons name="sunny-outline" size={24} color="#ffd79c" />
            </View>
          )}
        </View>

        <View style={styles.greetingSection}>
          <View style={styles.greetingBadge}>
            <Ionicons name={greetingIcon} size={13} color="#a6813c" />
            <Text style={styles.greetingBadgeText}>{levelName}</Text>
          </View>
          <Text style={styles.greetingTitle}>
            {greeting},{" "}
            <Text style={borderMeta ? { color: borderMeta.accentTextColor } : undefined}>{firstName}</Text>
          </Text>
          <Text style={styles.greetingSubtitle}>
            Your sponsor account keeps every verified tree, payment, certificate, and impact record together in one premium view.
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statsPill}>
            <Ionicons name="leaf-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{orders.length} order{orders.length === 1 ? "" : "s"} placed</Text>
          </View>
          <View style={styles.statsPill}>
            <Ionicons name="git-network-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{linkedTrees} live tree{linkedTrees === 1 ? "" : "s"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodyContent}>

        <View style={styles.profileBanner}>
          <ExpoImage source={sponsorHeroBackground} style={styles.profileBackdrop} contentFit="cover" />
          <View style={styles.profileOverlay}>
            <Text style={styles.bannerEyebrow}>Your climate contribution</Text>
            <Text style={styles.bannerTitle}>The trees you support are creating a visible, traceable environmental record.</Text>
            <Text style={styles.bannerBody}>
              Track spending, verified trees, current carbon, and the digital evidence that proves how your sponsorship is performing in the field.
            </Text>
            <View style={styles.bannerStatRow}>
              <View style={styles.bannerStatCard}>
                <Text style={styles.bannerStatValue}>{linkedTrees}</Text>
                <Text style={styles.bannerStatLabel}>Verified trees</Text>
              </View>
              <View style={styles.bannerStatCard}>
                <Text style={styles.bannerStatValue}>{carbonTotal.toFixed(2)} kg</Text>
                <Text style={styles.bannerStatLabel}>Current CO2</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ─── Achievements ─── */}
        {achievements ? (
          <SectionCard title="Sponsorship Achievement" subtitle="Your dynamically calculated level based on all-time verified trees sponsored.">
            <View style={styles.achievementCard}>
              <View style={styles.achievementHead}>
                <Text style={styles.achievementEmoji}>{badgeEmoji}</Text>
                <View style={styles.achievementTextCol}>
                  <Text style={styles.achievementLevel}>{achievements.level}</Text>
                  <Text style={styles.achievementCount}>{achievements.total_trees} Tree{achievements.total_trees === 1 ? "" : "s"} Sponsored</Text>
                </View>
              </View>
              {achievements.next_level ? (
                <View style={styles.progressContainer}>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabel}>Progress to {achievements.next_level}</Text>
                    <Text style={styles.progressPercent}>{Math.round(achievements.progress_percentage)}%</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${achievements.progress_percentage}%` }]} />
                  </View>
                  <Text style={styles.progressKicker}>
                    Sponsor {(achievements.next_level_threshold || 0) - achievements.total_trees} more tree{((achievements.next_level_threshold || 0) - achievements.total_trees) === 1 ? "" : "s"} to reach the next level.
                  </Text>
                </View>
              ) : (
                <Text style={styles.maxLevelKicker}>🌟 You have reached the maximum level! Earth Guardian status.</Text>
              )}
            </View>
          </SectionCard>
        ) : null}

        {/* ─── Assets (Avatar Borders) ─── */}
        <SectionCard title="Assets" subtitle="Equip unlocked borders, keep your sponsor photo live across the app, and preview the active map icon styling.">
          <Pressable style={styles.assetPhotoBanner} onPress={handlePickPhoto}>
            <View style={styles.assetPhotoBannerTextWrap}>
              <Text style={styles.assetPhotoBannerTitle}>Profile photo</Text>
              <Text style={styles.assetPhotoBannerSubtitle}>
                Upload or change the sponsor photo used in your premium header, profile, and unlocked avatar effects.
              </Text>
            </View>
            <View style={styles.assetPhotoBannerAction}>
              {uploadingPhoto ? <ActivityIndicator size="small" color={colors.primaryDark} /> : <Ionicons name="camera-outline" size={18} color={colors.primaryDark} />}
            </View>
          </Pressable>
          <View style={styles.borderList}>
            {allBorders.length === 0 ? (
              <Text style={styles.assetLockedHint}>
                Unlock a border from the sponsor home Assets tab, then equip it here to activate the premium avatar effect.
              </Text>
            ) : allBorders.map((border) => {
              const isEquipped = displayBorder === border.id;
              const bMeta = border;
              return (
                <View key={border.id} style={[styles.borderItem, isEquipped && styles.borderItemEquipped]}>
                  {/* Preview circle */}
                  <View
                    style={[
                      styles.borderPreviewOuter,
                      bMeta
                        ? {
                            borderColor: bMeta.borderColor,
                            shadowColor: bMeta.borderColor,
                            shadowOpacity: 0.55,
                            shadowRadius: 6,
                            elevation: 5,
                          }
                        : undefined,
                    ]}
                  >
                    {displayPhotoUri ? (
                      <ExpoImage source={{ uri: displayPhotoUri }} style={styles.borderPreviewImage} contentFit="cover" />
                    ) : (
                      <Text style={styles.borderPreviewInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>

                  <View style={styles.borderTextBlock}>
                    <Text style={[styles.borderLabel, { color: bMeta.accentTextColor }]}>{border.label}</Text>
                    <Text style={styles.borderSubLabel}>{border.subtitle}</Text>
                  </View>

                  <Pressable
                    onPress={() => void handleEquipBorder(isEquipped ? null : border.id)}
                    style={[styles.equipBtn, isEquipped && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.equipBtnText, isEquipped && { color: "white" }]}>
                      {isEquipped ? "Equipped ✓" : "Equip"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {/* Current avatar preview with selected border */}
          {displayBorder && borderMeta ? (
            <View style={styles.activePreviewRow}>
              <Animated.View
                style={[
                  styles.activePreviewCircle,
                  {
                    borderColor: borderMeta.borderColor,
                    shadowColor: borderMeta.borderColor,
                    shadowOpacity: 0.55,
                    shadowRadius: 8,
                    elevation: 6,
                  },
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                {displayPhotoUri ? (
                  <ExpoImage
                    source={{ uri: displayPhotoUri }}
                    style={styles.activePreviewImg}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.activePreviewInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                )}
              </Animated.View>
              <View style={styles.activePreviewMeta}>
                <Text style={[styles.activePreviewBorderName, { color: borderMeta.accentTextColor }]}>{borderMeta.label}</Text>
                <Text style={styles.activePreviewHint}>This border now wraps your sponsor photo across the premium profile surfaces.</Text>
                <Pressable onPress={() => void handleEquipBorder(null)} style={styles.removeBorderBtn}>
                  <Text style={styles.removeBorderBtnText}>Remove border</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {mapIconMeta ? (
            <Pressable style={styles.mapIconPreviewCard} onPress={() => handleMapIconPress(mapIconMeta.id)}>
              <View style={[styles.mapIconPreviewBadge, { backgroundColor: mapIconMeta.backgroundColor, borderColor: mapIconMeta.borderColor }]}>
                <Ionicons name={mapIconMeta.iconName} size={18} color={mapIconMeta.iconColor} />
                <View style={[styles.mapIconHighlight, { backgroundColor: mapIconMeta.iconSecondaryColor }]} />
              </View>
              <View style={styles.mapIconPreviewTextWrap}>
                <Text style={styles.mapIconPreviewTitle}>{mapIconMeta.label} equipped</Text>
                <Text style={styles.mapIconPreviewSubtitle}>
                  {mapIconMeta.description} This styling is now your active sponsor marker accent.
                </Text>
              </View>
            </Pressable>
          ) : null}
        </SectionCard>

        {/* ─── Impact Summary ─── */}
        <SectionCard title="Impact summary" subtitle="A simple summary of what your support has already unlocked.">
          <View style={styles.metricRow}>
            <MetricTile label="Orders" value={orders.length} helper="Support actions taken" />
            <MetricTile label="Contribution" value={formatCurrencyAmount(totalSpend, orders[0]?.currency || "NGN")} helper="Across all orders" />
          </View>
          <View style={styles.metricRow}>
            <MetricTile label="Live trees" value={linkedTrees} tone="success" helper="Already visible in the app" />
            <MetricTile label="Current CO2" value={`${carbonTotal.toFixed(2)} kg`} helper="Live stored carbon" />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </SectionCard>

        {/* ─── Account Details ─── */}
        <SectionCard title="My sponsor account" subtitle="Your public sponsor account for tracking project support, tree evidence, and certificates.">
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={15} color="#c5a059" />
            <Text style={styles.detailLine}>{session.user.full_name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={15} color="#c5a059" />
            <Text style={styles.detailLine}>{session.user.email || "No email added yet"}</Text>
          </View>
          {session.user.phone ? (
            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={15} color="#c5a059" />
              <Text style={styles.detailLine}>{session.user.phone}</Text>
            </View>
          ) : null}
          {session.user.organization_name ? (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={15} color="#c5a059" />
              <Text style={styles.detailLine}>{session.user.organization_name}</Text>
            </View>
          ) : null}

          <View style={styles.settingsSelectRow}>
            <Text style={styles.settingsSelectLabel}>Category</Text>
            <Pressable style={styles.settingsSelectTrigger} onPress={() => setCategoryPickerOpen(true)}>
              <Text style={styles.settingsSelectValue}>{entityCategory.charAt(0).toUpperCase() + entityCategory.slice(1)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.settingsSelectRow}>
            <Text style={styles.settingsSelectLabel}>Leaderboard Visibility</Text>
            <Pressable style={styles.settingsSelectTrigger} onPress={() => setVisibilityPickerOpen(true)}>
              <Text style={styles.settingsSelectValue}>{leaderboardVisibility.charAt(0).toUpperCase() + leaderboardVisibility.slice(1)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.referenceLine}>Sponsor reference: {session.user.sponsor_uid || session.user.user_uid || "-"}</Text>
        </SectionCard>

        {/* ─── Verification Updates ─── */}
        <SectionCard title="Verification updates" subtitle="Recent notes from the team as your sponsorships move through review and planting.">
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : orders.length === 0 ? (
            <EmptyState title="No sponsor updates yet" subtitle="Once you sponsor trees, payment review and planting progress updates will appear here." />
          ) : (
            <View style={styles.list}>
              {orders.slice(0, 5).map((order) => (
                <View key={`profile-order-${order.id}`} style={styles.rowCard}>
                  <View style={styles.rowHead}>
                    <Text style={styles.rowTitle}>{order.project_name || "Sponsored project"}</Text>
                    <StatusChip label={toTitle(order.order_status || "pending")} tone="neutral" />
                  </View>
                  <Text style={styles.rowMeta}>
                    {order.quantity} tree{order.quantity === 1 ? "" : "s"} | {formatCurrencyAmount(order.amount_total, order.currency)}
                  </Text>
                  <Text style={styles.rowMeta}>{formatDateTime(order.reviewed_at || order.created_at)}</Text>
                  {order.review_notes ? <Text style={styles.reviewNote}>{order.review_notes}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        <SectionCard title="Take Climate Action" subtitle="Join hands with other climate contributors. Sponsoring another tree is a quick, verified way to grow your positive footprint.">
          <PrimaryButton
            label="Sponsor More Trees"
            onPress={() => navigation.navigate("SponsorProjects" as never)}
          />
        </SectionCard>

        <SectionCard title="Account actions" subtitle="You can safely sign out here at any time.">
          <PrimaryButton label="Log out" onPress={() => void signOut()} variant="secondary" />
        </SectionCard>
      </View>

      <SelectSheet
        visible={categoryPickerOpen}
        title="Select Entity Category"
        options={categoryOptions}
        selectedValue={entityCategory}
        onClose={() => setCategoryPickerOpen(false)}
        onSelect={handleUpdateCategory}
      />

      <SelectSheet
        visible={visibilityPickerOpen}
        title="Leaderboard Visibility"
        options={visibilityOptions}
        selectedValue={leaderboardVisibility}
        onClose={() => setVisibilityPickerOpen(false)}
        onSelect={handleUpdateVisibility}
      />
    </ScreenSurface>
  );
};

const AVATAR_SIZE = 58;
const PREVIEW_SIZE = 42;
const ACTIVE_PREVIEW_SIZE = 64;

const styles = StyleSheet.create({
  scrollContent: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: 120,
  },
  bodyContent: {
    paddingHorizontal: 16,
    gap: 16,
  },

  // ── Header ──────────────────────────────────────────────────────────
  headerContainer: {
    marginTop: -16,
    paddingHorizontal: 16,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    position: "relative",
    overflow: "hidden",
  },
  headerBgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: -40,
    bottom: 0,
    width: "115%",
    height: "100%",
    opacity: 0.95,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // ── Avatar ──────────────────────────────────────────────────────────
  avatarPressable: {},
  avatarOuter: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: "900",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "white",
  },

  sunnyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeaderMarkerPreview: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileHeaderMarkerSpark: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 10,
    height: 10,
    borderRadius: 999,
    opacity: 0.92,
  },

  // ── Greeting ─────────────────────────────────────────────────────────
  greetingSection: {
    gap: 6,
    paddingRight: "30%",
  },
  greetingBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fbf7ee",
    borderWidth: 1,
    borderColor: "rgba(197, 160, 89, 0.20)",
  },
  greetingBadgeText: {
    color: "#a6813c",
    fontSize: 12,
    fontWeight: "900",
  },
  greetingTitle: {
    color: "#0c2b1a",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  greetingSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  statsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.08)",
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statsPillText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },

  // ── Profile Banner ────────────────────────────────────────────────────
  profileBanner: {
    borderRadius: radii.xl,
    overflow: "hidden",
    minHeight: 260,
    position: "relative",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  profileBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -78,
    width: "100%",
    height: "150%",
    opacity: 0.08,
  },
  profileOverlay: {
    flex: 1,
    padding: spacing.md,
    gap: 10,
    justifyContent: "space-between",
  },
  bannerEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  bannerTitle: {
    color: "#0c2b1a",
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.6,
    maxWidth: 320,
  },
  bannerBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  bannerStatRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bannerStatCard: {
    flex: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#f6f9f7",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.12)",
    gap: 4,
  },
  bannerStatValue: {
    color: "#0c2b1a",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
  },
  bannerStatLabel: {
    color: "#c5a059",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  // ── Achievements ──────────────────────────────────────────────────────
  achievementCard: {
    backgroundColor: "#ffffff",
    gap: 16,
  },
  achievementHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  achievementEmoji: {
    fontSize: 36,
  },
  achievementTextCol: {
    gap: 2,
  },
  achievementLevel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  achievementCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  progressContainer: {
    gap: 8,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  progressPercent: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#eef3ef",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressKicker: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  maxLevelKicker: {
    color: "#a6813c",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },

  // ── Assets / Borders ──────────────────────────────────────────────────
  borderList: {
    gap: 10,
    marginBottom: 8,
  },
  assetPhotoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#f7fbf8",
    borderWidth: 1,
    borderColor: "rgba(18, 92, 45, 0.10)",
    marginBottom: 12,
  },
  assetPhotoBannerTextWrap: {
    flex: 1,
    gap: 4,
  },
  assetPhotoBannerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  assetPhotoBannerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  assetPhotoBannerAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e6f4ea",
  },
  assetLockedHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  borderItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fafbfa",
  },
  borderItemEquipped: {
    borderColor: colors.primary,
    backgroundColor: "#f0faf3",
  },
  borderPreviewOuter: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
    borderWidth: 2.5,
    borderColor: colors.border,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    flexShrink: 0,
  },
  borderPreviewInitial: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: "900",
  },
  borderPreviewImage: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
  },
  borderTextBlock: {
    flex: 1,
    gap: 2,
  },
  borderLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  borderSubLabel: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  equipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  equipBtnText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
  },

  // Active border preview
  activePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activePreviewCircle: {
    width: ACTIVE_PREVIEW_SIZE,
    height: ACTIVE_PREVIEW_SIZE,
    borderRadius: ACTIVE_PREVIEW_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    flexShrink: 0,
  },
  activePreviewImg: {
    width: ACTIVE_PREVIEW_SIZE,
    height: ACTIVE_PREVIEW_SIZE,
    borderRadius: ACTIVE_PREVIEW_SIZE / 2,
  },
  activePreviewInitial: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: "900",
  },
  activePreviewMeta: {
    flex: 1,
    gap: 4,
  },
  activePreviewBorderName: {
    fontSize: 13,
    fontWeight: "900",
  },
  activePreviewHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  removeBorderBtn: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeBorderBtnText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  mapIconPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fbfdfb",
    marginTop: 12,
  },
  mapIconPreviewBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mapIconHighlight: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 10,
    height: 10,
    borderRadius: 999,
    opacity: 0.9,
  },
  mapIconPreviewTextWrap: {
    flex: 1,
    gap: 3,
  },
  mapIconPreviewTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  mapIconPreviewSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },

  // ── Impact / Account ──────────────────────────────────────────────────
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f9faf9",
    borderWidth: 1,
    borderColor: "rgba(18, 92, 45, 0.04)",
    marginBottom: 6,
  },
  detailLine: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
    fontWeight: "600",
  },
  settingsSelectRow: {
    gap: 6,
    marginVertical: 4,
  },
  settingsSelectLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingLeft: 4,
  },
  settingsSelectTrigger: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "#f9faf9",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsSelectValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  referenceLine: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 4,
  },

  // ── Updates list ──────────────────────────────────────────────────────
  list: {
    gap: spacing.sm,
  },
  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "#c5a059",
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rowHead: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rowTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  reviewNote: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
    backgroundColor: "#f7faf7",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(18, 92, 45, 0.04)",
  },
});
