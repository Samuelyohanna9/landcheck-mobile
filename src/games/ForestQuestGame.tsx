import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "../api/client";
import { uploadGreenPhoto } from "../api/green";
import {
  fetchSponsorSocialFollowClaim,
  submitSponsorSocialFollowClaim,
  type SponsorSocialFollowClaim,
} from "../api/sponsor";
import { useAuth } from "../context/AuthContext";
import { useGameGP } from "../hooks/useGameGP";
import type { DraftPhoto } from "../types/domain";

const FACEBOOK_BROWSER_URL = "https://www.facebook.com/profile.php?id=61587283474285";
const FACEBOOK_APP_URL = `fb://facewebmodal/f?href=${FACEBOOK_BROWSER_URL}`;
const INSTAGRAM_BROWSER_URL = "https://www.instagram.com/land.check/";
const INSTAGRAM_APP_URL = "instagram://user?username=land.check";
const FOLLOW_REWARD_GP = 20;
const PROOF_FOLDER = "sponsor-follow-proofs";

type FollowPlatform = "facebook" | "instagram";
type FollowDraftState = {
  facebook: boolean;
  instagram: boolean;
  facebookProofUrl: string | null;
  instagramProofUrl: string | null;
};

const socialMissionKey = (sponsorId: number) => `grove:follow-landcheck:v2:${sponsorId}`;

const defaultDraftState: FollowDraftState = {
  facebook: false,
  instagram: false,
  facebookProofUrl: null,
  instagramProofUrl: null,
};

const formatDateTime = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString();
};

const normalizeDraftState = (value: unknown): FollowDraftState => {
  if (!value || typeof value !== "object") return { ...defaultDraftState };
  const row = value as Record<string, unknown>;
  return {
    facebook: Boolean(row.facebook),
    instagram: Boolean(row.instagram),
    facebookProofUrl: row.facebookProofUrl ? String(row.facebookProofUrl) : null,
    instagramProofUrl: row.instagramProofUrl ? String(row.instagramProofUrl) : null,
  };
};

const uploadLabelByPlatform: Record<FollowPlatform, string> = {
  facebook: "Upload Facebook proof",
  instagram: "Upload Instagram proof",
};

const openLabelByPlatform: Record<FollowPlatform, string> = {
  facebook: "Open Facebook",
  instagram: "Open Instagram",
};

export const ForestQuestGame = () => {
  const { session } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { gpBalance, loading, refresh } = useGameGP(session);
  const [visited, setVisited] = useState({ facebook: false, instagram: false });
  const [proofUrls, setProofUrls] = useState<{ facebook: string | null; instagram: string | null }>({
    facebook: null,
    instagram: null,
  });
  const [claim, setClaim] = useState<SponsorSocialFollowClaim | null>(null);
  const [loadingClaim, setLoadingClaim] = useState(false);
  const [uploadingPlatform, setUploadingPlatform] = useState<FollowPlatform | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const storageKey = useMemo(() => {
    const sponsorId = Number(session?.user?.id || 0);
    return socialMissionKey(sponsorId);
  }, [session?.user?.id]);

  const persistDraftState = useCallback(
    async (next: Partial<FollowDraftState>) => {
      const payload: FollowDraftState = {
        facebook: visited.facebook,
        instagram: visited.instagram,
        facebookProofUrl: proofUrls.facebook,
        instagramProofUrl: proofUrls.instagram,
        ...next,
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
      setVisited({ facebook: Boolean(payload.facebook), instagram: Boolean(payload.instagram) });
      setProofUrls({
        facebook: payload.facebookProofUrl || null,
        instagram: payload.instagramProofUrl || null,
      });
    },
    [proofUrls.facebook, proofUrls.instagram, storageKey, visited.facebook, visited.instagram],
  );

  const loadState = useCallback(async () => {
    if (!session?.user?.id) return;

    let localDraft = { ...defaultDraftState };
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      try {
        localDraft = normalizeDraftState(JSON.parse(raw));
      } catch {
        localDraft = { ...defaultDraftState };
      }
    }

    setVisited({ facebook: localDraft.facebook, instagram: localDraft.instagram });
    setProofUrls({
      facebook: localDraft.facebookProofUrl,
      instagram: localDraft.instagramProofUrl,
    });

    try {
      setLoadingClaim(true);
      const remoteClaim = await fetchSponsorSocialFollowClaim(session);
      setClaim(remoteClaim);
      if (remoteClaim) {
        const merged: FollowDraftState = {
          facebook: Boolean(remoteClaim.facebook_opened || localDraft.facebook),
          instagram: Boolean(remoteClaim.instagram_opened || localDraft.instagram),
          facebookProofUrl: remoteClaim.facebook_screenshot_url || localDraft.facebookProofUrl,
          instagramProofUrl: remoteClaim.instagram_screenshot_url || localDraft.instagramProofUrl,
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
        setVisited({ facebook: merged.facebook, instagram: merged.instagram });
        setProofUrls({
          facebook: merged.facebookProofUrl,
          instagram: merged.instagramProofUrl,
        });
      }
    } catch {
      setClaim(null);
    } finally {
      setLoadingClaim(false);
    }
  }, [session, storageKey]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadState();
    }, [loadState, refresh]),
  );

  const openSocial = useCallback(
    async (platform: FollowPlatform) => {
      const candidates =
        platform === "facebook"
          ? [FACEBOOK_APP_URL, FACEBOOK_BROWSER_URL]
          : [INSTAGRAM_APP_URL, INSTAGRAM_BROWSER_URL];
      let opened = false;
      for (let index = 0; index < candidates.length; index += 1) {
        const url = candidates[index];
        try {
          const isBrowserFallback = index === candidates.length - 1;
          const supported = isBrowserFallback ? true : await Linking.canOpenURL(url);
          if (!supported) continue;
          await Linking.openURL(url);
          opened = true;
          break;
        } catch {
          continue;
        }
      }
      if (!opened) {
        Alert.alert("Cannot open link", "This social page could not be opened on this device.");
        return;
      }
      await persistDraftState({ [platform]: true } as Partial<FollowDraftState>);
    },
    [persistDraftState],
  );

  const uploadProof = useCallback(
    async (platform: FollowPlatform) => {
      if (!session) return;
      try {
        setUploadingPlatform(platform);
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Permission needed", "Photo library access is required to upload your follow screenshot.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.9,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const photo: DraftPhoto = {
          uri: asset.uri,
          fileName: asset.fileName || `landcheck-follow-${platform}-${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
          fileSize: asset.fileSize,
        };
        const uploadedUrl = await uploadGreenPhoto({
          photo,
          folder: PROOF_FOLDER,
        });
        if (!uploadedUrl) {
          throw new Error("Upload did not return a screenshot URL.");
        }
        await persistDraftState(
          platform === "facebook"
            ? { facebookProofUrl: uploadedUrl }
            : { instagramProofUrl: uploadedUrl },
        );
      } catch (error) {
        Alert.alert("Upload failed", getErrorMessage(error, "The screenshot could not be uploaded right now."));
      } finally {
        setUploadingPlatform(null);
      }
    },
    [persistDraftState, session],
  );

  const submitProof = useCallback(async () => {
    if (!session || submitting || claim?.status === "approved") return;
    if (!visited.facebook || !visited.instagram) {
      Alert.alert(
        "Open both pages first",
        "Open both the Facebook and Instagram pages before submitting your proof for review.",
      );
      return;
    }
    if (!proofUrls.facebook || !proofUrls.instagram) {
      Alert.alert(
        "Upload both screenshots",
        "Upload one screenshot for Facebook and one screenshot for Instagram so super admin can review your proof.",
      );
      return;
    }
    try {
      setSubmitting(true);
      const nextClaim = await submitSponsorSocialFollowClaim(session, {
        facebook_opened: true,
        instagram_opened: true,
        facebook_screenshot_url: proofUrls.facebook,
        instagram_screenshot_url: proofUrls.instagram,
      });
      setClaim(nextClaim);
      await persistDraftState({
        facebook: true,
        instagram: true,
        facebookProofUrl: nextClaim.facebook_screenshot_url,
        instagramProofUrl: nextClaim.instagram_screenshot_url,
      });
      Alert.alert(
        "Proof submitted",
        "Your screenshots are now waiting for super admin review in LandCheck Work. The 20 GP will be added after approval.",
      );
      await refresh();
    } catch (error) {
      Alert.alert("Submission failed", getErrorMessage(error, "The follow proof could not be submitted right now."));
    } finally {
      setSubmitting(false);
    }
  }, [claim?.status, persistDraftState, proofUrls.facebook, proofUrls.instagram, refresh, session, submitting, visited.facebook, visited.instagram]);

  const claimStatus = String(claim?.status || "").trim().toLowerCase() || "draft";
  const approved = claimStatus === "approved" || Boolean(claim?.points_awarded);
  const pending = claimStatus === "pending";
  const rejected = claimStatus === "rejected";
  const allVisited = visited.facebook && visited.instagram;
  const proofsReady = Boolean(proofUrls.facebook && proofUrls.instagram);

  const statusToneStyle = approved
    ? styles.statusPillOk
    : rejected
      ? styles.statusPillError
      : pending
        ? styles.statusPillWarn
        : styles.statusPillNeutral;
  const statusLabel = approved
    ? "20 GP approved"
    : rejected
      ? "Proof needs resubmission"
      : pending
        ? "Awaiting super admin review"
        : "Proof not submitted yet";

  const reviewDate = formatDateTime(claim?.reviewed_at);
  const submitDate = formatDateTime(claim?.submitted_at || claim?.updated_at || claim?.created_at);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0c2f1c", "#14532d", "#0f3d20"]} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle}>Follow Us</Text>
          <View style={styles.gpChip}>
            <Text style={styles.gpText}>{loading ? "..." : `${gpBalance} GP`}</Text>
          </View>
        </View>
        <Text style={styles.headerSub}>
          Open both pages, upload proof screenshots, then wait for super admin review before the {FOLLOW_REWARD_GP} GP reward is added.
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="sparkles-outline" size={16} color="#166534" />
            <Text style={styles.heroBadgeText}>Verified social proof mission</Text>
          </View>
          <Text style={styles.heroTitle}>Earn {FOLLOW_REWARD_GP} GP after review.</Text>
          <Text style={styles.heroBody}>
            Follow LandCheck on both platforms, upload proof screenshots, and LandCheck Work super admin will review before points are awarded.
          </Text>
          <View style={styles.rewardRow}>
            <View style={styles.rewardPill}>
              <Ionicons name="leaf-outline" size={16} color="#166534" />
              <Text style={styles.rewardPillText}>{FOLLOW_REWARD_GP} GP reward</Text>
            </View>
            <View style={[styles.rewardPill, allVisited && styles.rewardPillDone]}>
              <Ionicons
                name={allVisited ? "checkmark-circle" : "time-outline"}
                size={16}
                color={allVisited ? "#166534" : "#9a6700"}
              />
              <Text style={[styles.rewardPillText, !allVisited && styles.rewardPillWarn]}>
                {allVisited ? "Both pages opened" : "Open both pages"}
              </Text>
            </View>
            <View style={[styles.rewardPill, proofsReady && styles.rewardPillDone]}>
              <Ionicons
                name={proofsReady ? "images-outline" : "image-outline"}
                size={16}
                color={proofsReady ? "#166534" : "#486756"}
              />
              <Text style={styles.rewardPillText}>
                {proofsReady ? "Screenshots ready" : "Upload both screenshots"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={[styles.statusPill, statusToneStyle]}>
            <Text style={styles.statusPillText}>{statusLabel}</Text>
          </View>
          {loadingClaim ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#166534" />
              <Text style={styles.statusMeta}>Checking latest review status...</Text>
            </View>
          ) : (
            <>
              {submitDate ? <Text style={styles.statusMeta}>Submitted: {submitDate}</Text> : null}
              {reviewDate ? <Text style={styles.statusMeta}>Reviewed: {reviewDate}</Text> : null}
              {claim?.supervisor_note ? (
                <Text style={styles.statusNote}>Supervisor note: {claim.supervisor_note}</Text>
              ) : null}
            </>
          )}
        </View>

        {(["facebook", "instagram"] as FollowPlatform[]).map((platform) => {
          const isVisited = visited[platform];
          const proofUrl = proofUrls[platform];
          const isUploading = uploadingPlatform === platform;
          const iconName = platform === "facebook" ? "logo-facebook" : "logo-instagram";
          const iconColor = platform === "facebook" ? "#1877F2" : "#C13584";
          const handle = platform === "facebook" ? "LandCheck NG" : "@land.check";
          const displayUrl = platform === "facebook" ? "facebook.com/LandCheckNG" : "instagram.com/land.check";
          return (
            <View key={platform} style={styles.socialCard}>
              <View style={styles.socialHeader}>
                <Ionicons name={iconName} size={22} color={iconColor} />
                <View style={styles.socialText}>
                  <Text style={styles.socialTitle}>{platform === "facebook" ? "Facebook" : "Instagram"}</Text>
                  <Text style={styles.socialHandle}>{handle}</Text>
                </View>
                {isVisited ? <Ionicons name="checkmark-circle" size={22} color="#16a34a" /> : null}
              </View>
              <Text style={styles.socialUrl}>{displayUrl}</Text>

              <View style={styles.socialActions}>
                <Pressable style={styles.socialBtn} onPress={() => void openSocial(platform)}>
                  <Text style={styles.socialBtnText}>{isVisited ? "Open again" : openLabelByPlatform[platform]}</Text>
                </Pressable>
                <Pressable
                  style={[styles.socialBtnSecondary, approved && styles.socialBtnDisabled]}
                  onPress={() => void uploadProof(platform)}
                  disabled={approved || isUploading}
                >
                  <Text style={styles.socialBtnSecondaryText}>
                    {isUploading ? "Uploading..." : uploadLabelByPlatform[platform]}
                  </Text>
                </Pressable>
              </View>

              {proofUrl ? (
                <View style={styles.previewCard}>
                  <Image source={{ uri: proofUrl }} style={styles.previewImage} contentFit="cover" />
                  <Text style={styles.previewLabel}>Screenshot ready for review</Text>
                </View>
              ) : (
                <Text style={styles.previewHint}>Upload a screenshot that clearly shows the follow on this platform.</Text>
              )}
            </View>
          );
        })}

        <View style={styles.claimCard}>
          <Text style={styles.claimTitle}>Submit proof for review</Text>
          <Text style={styles.claimBody}>
            Super admin will review your screenshots in LandCheck Work and approve the {FOLLOW_REWARD_GP} GP manually after verification.
          </Text>
          <Pressable
            style={[
              styles.claimBtn,
              (!allVisited || !proofsReady || approved || pending || submitting) && styles.claimBtnDisabled,
            ]}
            onPress={() => void submitProof()}
            disabled={!allVisited || !proofsReady || approved || pending || submitting}
          >
            <Text style={styles.claimBtnText}>
              {approved
                ? `${FOLLOW_REWARD_GP} GP already approved`
                : pending
                  ? "Waiting for super admin review"
                  : submitting
                    ? "Submitting proof..."
                    : rejected
                      ? "Resubmit proof for review"
                      : `Submit proof for ${FOLLOW_REWARD_GP} GP`}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#edf6ef" },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  gpChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  gpText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  headerSub: {
    marginTop: 14,
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: "#08210f",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#eaf7ee",
  },
  heroBadgeText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: "#0d2818",
    fontWeight: "900",
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    color: "#486756",
  },
  rewardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f3faf5",
  },
  rewardPillDone: {
    backgroundColor: "#e3f6e9",
  },
  rewardPillText: {
    color: "#18422a",
    fontSize: 12,
    fontWeight: "800",
  },
  rewardPillWarn: {
    color: "#9a6700",
  },
  statusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#dceee1",
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillOk: {
    backgroundColor: "#dcfce7",
  },
  statusPillWarn: {
    backgroundColor: "#fff4d6",
  },
  statusPillError: {
    backgroundColor: "#fee2e2",
  },
  statusPillNeutral: {
    backgroundColor: "#edf6ef",
  },
  statusPillText: {
    color: "#0d2818",
    fontSize: 12,
    fontWeight: "900",
  },
  statusMeta: {
    color: "#486756",
    fontSize: 12,
    lineHeight: 18,
  },
  statusNote: {
    color: "#8a4b00",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  socialCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: "#08210f",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  socialHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  socialText: {
    flex: 1,
  },
  socialTitle: {
    color: "#0d2818",
    fontSize: 17,
    fontWeight: "900",
  },
  socialHandle: {
    color: "#486756",
    fontSize: 12,
    marginTop: 2,
  },
  socialUrl: {
    color: "#3b5f4a",
    fontSize: 12,
  },
  socialActions: {
    gap: 10,
  },
  socialBtn: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#166534",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  socialBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  socialBtnSecondary: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cfe6d5",
    backgroundColor: "#f6fbf7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  socialBtnSecondaryText: {
    color: "#18422a",
    fontSize: 13,
    fontWeight: "800",
  },
  socialBtnDisabled: {
    opacity: 0.45,
  },
  previewCard: {
    gap: 10,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 18,
    backgroundColor: "#e8f3eb",
  },
  previewLabel: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "800",
  },
  previewHint: {
    color: "#5a7766",
    fontSize: 12,
    lineHeight: 18,
  },
  claimCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: "#08210f",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  claimTitle: {
    color: "#0d2818",
    fontSize: 20,
    fontWeight: "900",
  },
  claimBody: {
    color: "#486756",
    fontSize: 14,
    lineHeight: 21,
  },
  claimBtn: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "#166534",
  },
  claimBtnDisabled: {
    opacity: 0.45,
  },
  claimBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
});
