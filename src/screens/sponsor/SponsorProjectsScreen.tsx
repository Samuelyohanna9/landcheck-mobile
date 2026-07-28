import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BrandMark } from "../../components/BrandMark";
import { EmptyState } from "../../components/EmptyState";
import { ScreenSurface } from "../../components/ScreenSurface";
import { StatusChip } from "../../components/StatusChip";
import { 
  fetchPublicSponsorshipProjects, 
  fetchSponsorOrders, 
  fetchSponsorAchievements, 
  fetchSponsorPoints, 
  redeemSponsorReward, 
  nominateSchool, 
  createCommunityProject, 
  applyReferralCode, 
  updateSponsorAppearance, 
  updateSponsorProfilePhoto,
  shareEarnPoints,
  submitSponsorComplaint
} from "../../api/sponsor";
import { uploadGreenPhoto } from "../../api/green";
import { api, getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../config/env";
import {
  getSponsorAvatarBorderMeta,
  getSponsorMapIconCelebration,
  getSponsorMapIconMeta,
  normalizeSponsorAvatarBorder,
  normalizeSponsorMapIcon,
  SPONSOR_AVATAR_BORDERS,
  SPONSOR_MAP_ICONS,
} from "../../sponsor/appearance";
import { getSponsorFirstName, getSponsorGreeting, getSponsorGreetingIcon, getSponsorProjectAvailability } from "../../sponsor/presentation";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatCurrencyAmount } from "../../utils/currency";
import { resolveGreenAssetUrl } from "../../utils/assets";
import type { DraftPhoto, ProjectSummary, SponsorOrderSummary } from "../../types/domain";
import type { SponsorAchievements, SponsorPointsInfo } from "../../api/sponsor";
import type { SponsorAppStackParamList as SponsorNavParams } from "../../types/navigation";

const { width: screenWidth } = Dimensions.get("window");

const toneForOrder = (status?: string | null) => {
  const key = String(status || "").trim().toLowerCase();
  if (key === "paid" || key === "allocated" || key === "completed") return "online" as const;
  if (key === "rejected" || key === "cancelled") return "offline" as const;
  if (key === "payment_review" || key === "proof_submitted" || key === "pending_payment") return "warning" as const;
  return "neutral" as const;
};

const formatOrderStageLabel = (order?: SponsorOrderSummary | null) => {
  const raw = String(order?.order_status || order?.payment_status || "no orders yet")
    .replace(/_/g, " ")
    .trim();
  if (!raw) return "No orders yet";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const normalizeSponsorOrderStage = (value?: string | null) => String(value || "").trim().toLowerCase();

const isConfirmedSponsorOrder = (order?: SponsorOrderSummary | null) => {
  const orderStatus = normalizeSponsorOrderStage(order?.order_status);
  const paymentStatus = normalizeSponsorOrderStage(order?.payment_status);
  return (
    ["allocated", "completed", "paid"].includes(orderStatus) ||
    ["verified", "paid"].includes(paymentStatus) ||
    Number(order?.linked_units || 0) > 0 ||
    Number(order?.awaiting_tree_units || 0) > 0
  );
};

const isPendingPaymentOrder = (order?: SponsorOrderSummary | null) => {
  const orderStatus = normalizeSponsorOrderStage(order?.order_status);
  const paymentStatus = normalizeSponsorOrderStage(order?.payment_status);
  return (
    ["pending_payment", "payment_review", "proof_submitted"].includes(orderStatus) ||
    ["pending_payment", "payment_review", "proof_submitted"].includes(paymentStatus)
  );
};

const formatSponsorProjectPriceChoices = (project?: ProjectSummary | null) => {
  const entries: Array<string> = [];
  const push = (currency: string | null | undefined, amount: number | null | undefined) => {
    const code = String(currency || "").trim().toUpperCase();
    const numeric = Number(amount || 0);
    if (code.length !== 3 || !Number.isFinite(numeric) || numeric <= 0) return;
    const label = `${formatCurrencyAmount(numeric, code)}/tree`;
    if (!entries.includes(label)) entries.push(label);
  };
  push("NGN", project?.sponsor_price_per_tree_ngn);
  push("USD", project?.sponsor_price_per_tree_usd);
  if (entries.length === 0) {
    push(project?.sponsor_currency || "NGN", project?.sponsor_price_per_tree);
  }
  return entries.length > 0 ? entries.join(" · ") : "TBD";
};

const sponsorHeroBackground = require("../../../assets/background-sponsor.png");
const sponsorProfilePhotoStorageKey = (id: number) => `lc_sphoto_${id}`;

const isLocalPhotoUri = (value?: string | null) => /^(file|content|ph|assets-library):/i.test(String(value || "").trim());

const getRewardCost = (rewardType: string) => {
  if (rewardType === "multiplier") return 50;
  if (rewardType.startsWith("avatar_")) return 200;
  if (rewardType.startsWith("map_icon_")) return 150;
  if (rewardType.startsWith("unlock_species_")) return 500;
  if (rewardType.startsWith("merch_")) {
    return rewardType === "merch_tote" ? 800 : rewardType === "merch_cap" ? 1000 : 1500;
  }
  return 0;
};

export const SponsorProjectsScreen = () => {
  const { session, updateSessionUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<SponsorNavParams>>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [orders, setOrders] = useState<SponsorOrderSummary[]>([]);
  const [achievements, setAchievements] = useState<SponsorAchievements | null>(null);
  const [pointsInfo, setPointsInfo] = useState<SponsorPointsInfo | null>(null);
  const [profilePhotoOverride, setProfilePhotoOverride] = useState<string>("");
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [pointsTab, setPointsTab] = useState<'unlocks' | 'boosters' | 'influence' | 'merch'>('unlocks');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  
  // Modals / Inputs
  const [nominateModalVisible, setNominateModalVisible] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolContact, setSchoolContact] = useState("");
  const [schoolPhone, setSchoolPhone] = useState("");
  const [nominateReason, setNominateReason] = useState("");
  
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectPoints, setProjectPoints] = useState("100");
  
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referralSubmitting, setReferralSubmitting] = useState(false);

  // Complaint modal state
  const [complaintModalVisible, setComplaintModalVisible] = useState(false);
  const [complaintType, setComplaintType] = useState("general");
  const [complaintTreeId, setComplaintTreeId] = useState("");
  const [complaintMessage, setComplaintMessage] = useState("");
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);

  // Merch modal state
  const [merchModalVisible, setMerchModalVisible] = useState(false);
  const [selectedMerchType, setSelectedMerchType] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<'home_delivery' | 'office_pickup' | 'transport_terminal'>('home_delivery');
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingLga, setShippingLga] = useState("");
  const [selectedHub, setSelectedHub] = useState("Lagos");
  const [selectedTransport, setSelectedTransport] = useState("GIGM");
  const [destinationTerminal, setDestinationTerminal] = useState("");
  const merchEligiblePoints = pointsInfo?.merch_eligible_points ?? 0;
  const sponsorTreePointsEarned = pointsInfo?.sponsor_tree_points_earned ?? 0;
  const merchPointsSpent = pointsInfo?.merch_points_spent ?? 0;

  const hydrateProfilePhoto = useCallback(async () => {
    if (!session?.user?.id) return;
    const storedPhoto = await AsyncStorage.getItem(sponsorProfilePhotoStorageKey(session.user.id)).catch(() => null);
    const nextPhoto = String(storedPhoto || "").trim();
    const sessionPhoto = String(session.user.profile_photo_url || "").trim();
    setProfilePhotoOverride(
      isLocalPhotoUri(nextPhoto)
        ? nextPhoto
        : sessionPhoto || nextPhoto || "",
    );
  }, [session?.user?.id, session?.user?.profile_photo_url]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    setError("");
    try {
      const [projectRows, orderRows, achievementRow, pointsRow] = await Promise.all([
        fetchPublicSponsorshipProjects(),
        fetchSponsorOrders(session),
        fetchSponsorAchievements(session),
        fetchSponsorPoints(session)
      ]);
      setProjects(projectRows);
      setOrders(orderRows);
      setAchievements(achievementRow);
      setPointsInfo(pointsRow);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load sponsor projects."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  const handleRedeemReward = async (rewardType: string, shippingDetails?: any) => {
    if (!session || !pointsInfo) return;
    
    const cost = getRewardCost(rewardType);
    const availablePoints = rewardType.startsWith("merch_")
      ? pointsInfo.merch_eligible_points
      : pointsInfo.green_points;
    
    if (availablePoints < cost) {
      Alert.alert(
        "Insufficient Points",
        rewardType.startsWith("merch_")
          ? `You need ${cost} sponsor tree GP for this merchandise item. GP from referrals, games, daily spin, and sharing does not count. Current merch-eligible balance: ${pointsInfo.merch_eligible_points} GP.`
          : `You need ${cost} Green Points to unlock this reward. You currently have ${pointsInfo.green_points} GP.`,
      );
      return;
    }
    
    try {
      setLoading(true);
      const res = await redeemSponsorReward(session, rewardType, shippingDetails);
      if (res.ok) {
        Alert.alert("Success!", `You successfully unlocked ${rewardType.replace(/_/g, ' ')} for ${cost} GP!`);
        await loadData();
        try {
          await api.post("/green/public/logs", {
            source: "sponsor_app",
            event_type: "sponsor_redeem",
            actor: session.user.full_name || session.user.email || "Sponsor",
            message: `Sponsor redeemed reward '${rewardType}' for ${cost} GP`,
            details: { sponsor_id: session.user.id, reward_type: rewardType, cost, shipping_details: shippingDetails || null }
          });
        } catch (logErr) {
          console.log("Failed to post public log:", logErr);
        }
      }
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to redeem reward."));
    } finally {
      setLoading(false);
    }
  };

  const triggerMerchRedeem = (rewardType: string) => {
    if (!session || !pointsInfo) return;
    
    const cost = getRewardCost(rewardType);
    
    if (pointsInfo.merch_eligible_points < cost) {
      Alert.alert(
        "Sponsor GP required",
        `This merchandise item needs ${cost} sponsor tree GP. Referral GP, game GP, spin GP, and share GP do not count toward merch. Current merch-eligible balance: ${pointsInfo.merch_eligible_points} GP.`,
      );
      return;
    }

    if (rewardType.startsWith("merch_")) {
      setSelectedMerchType(rewardType);
      setMerchModalVisible(true);
    } else {
      handleRedeemReward(rewardType);
    }
  };
  
  const handleNominateSchool = async () => {
    if (!session) return;
    if (!pointsInfo || pointsInfo.green_points < 100) {
      Alert.alert("Insufficient Points", "You need 100 Green Points to nominate a school.");
      return;
    }
    if (!schoolName || !schoolAddress || !nominateReason) {
      Alert.alert("Validation Error", "Please fill in School Name, Address, and Reason.");
      return;
    }
    try {
      setLoading(true);
      await nominateSchool(session, {
        school_name: schoolName,
        school_address: schoolAddress,
        contact_person: schoolContact,
        contact_phone: schoolPhone,
        reason: nominateReason
      });
      Alert.alert("Success!", "School nomination submitted successfully! Our agents will review it before the next tree planting.");
      setNominateModalVisible(false);
      setSchoolName("");
      setSchoolAddress("");
      setSchoolContact("");
      setSchoolPhone("");
      setNominateReason("");
      await loadData();
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to submit nomination."));
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateCommunityProject = async () => {
    if (!session || !pointsInfo) return;
    const pts = parseInt(projectPoints);
    if (!projectName || !projectLocation || isNaN(pts) || pts <= 0) {
      Alert.alert("Validation Error", "Please fill in Project Name, Location, and a valid positive points value.");
      return;
    }
    if (pointsInfo.green_points < pts) {
      Alert.alert("Insufficient Points", `You cannot contribute ${pts} GP. You only have ${pointsInfo.green_points} GP.`);
      return;
    }
    try {
      setLoading(true);
      await createCommunityProject(session, {
        project_name: projectName,
        proposed_location: projectLocation,
        description: projectDesc,
        points: pts
      });
      Alert.alert("Success!", `You contributed ${pts} GP to propose the community forest project "${projectName}"!`);
      setProjectModalVisible(false);
      setProjectName("");
      setProjectLocation("");
      setProjectDesc("");
      setProjectPoints("100");
      await loadData();
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to propose community project."));
    } finally {
      setLoading(false);
    }
  };
  
  const handleApplyReferral = async () => {
    if (!session) return;
    if (!referralCodeInput.trim()) {
      Alert.alert("Error", "Please enter a referral code.");
      return;
    }
    try {
      setReferralSubmitting(true);
      await applyReferralCode(session, referralCodeInput);
      Alert.alert("Success!", "Referral code applied! You and your referrer will receive bonus points on your next tree planting.");
      setReferralCodeInput("");
      await loadData();
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to apply referral code."));
    } finally {
      setReferralSubmitting(false);
    }
  };
  
  const handleShareReferral = async () => {
    if (!pointsInfo?.referral_code || !session) return;
    try {
      const result = await Share.share({
        message: `Join me in planting trees and restoring ecosystems with LandCheck Green! Use my referral code ${pointsInfo.referral_code} to get 10 GP on signup and 25 GP on sponsoring a tree. 🌱 Download the app: https://play.google.com/store/apps/details?id=online.landcheck.mobile`,
      });
      if (result.action === Share.sharedAction) {
        setLoading(true);
        const earnRes = await shareEarnPoints(session);
        if (earnRes.ok) {
          Alert.alert("Green Points Earned!", "Referral code shared successfully! You earned 25 Green Points! 🌱");
          await loadData();
        }
      }
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComplaint = async () => {
    if (!session) return;
    if (!complaintMessage.trim()) {
      Alert.alert("Validation Error", "Please enter your message or complaint details.");
      return;
    }
    const treeIdVal = complaintTreeId.trim() ? parseInt(complaintTreeId.trim()) : null;
    if (complaintTreeId.trim() && (isNaN(treeIdVal as number) || (treeIdVal as number) <= 0)) {
      Alert.alert("Validation Error", "Please enter a valid numeric Tree ID or leave it blank.");
      return;
    }
    try {
      setComplaintSubmitting(true);
      await submitSponsorComplaint(session, {
        complaint_type: complaintType,
        tree_id: treeIdVal,
        message: complaintMessage.trim()
      });
      Alert.alert("Thank you!", "Your complaint/report has been submitted. Our supervisors will review it and follow up.");
      setComplaintModalVisible(false);
      setComplaintType("general");
      setComplaintTreeId("");
      setComplaintMessage("");
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to submit report."));
    } finally {
      setComplaintSubmitting(false);
    }
  };
  
  const handleToggleAppearance = async (type: 'border' | 'icon', val: string) => {
    if (!session) return;
    const nextAvatarBorder = type === 'border' ? (normalizeSponsorAvatarBorder(val) ?? null) : normalizeSponsorAvatarBorder(pointsInfo?.current_avatar_border);
    const nextMapIcon = type === 'icon' ? (normalizeSponsorMapIcon(val) ?? null) : normalizeSponsorMapIcon(pointsInfo?.current_map_icon);
    try {
      setLoading(true);
      await updateSponsorAppearance(session, {
        avatar_border: nextAvatarBorder,
        map_icon: nextMapIcon,
      });
      await updateSessionUser({
        current_avatar_border: nextAvatarBorder,
        current_map_icon: nextMapIcon,
      });
      Alert.alert("Appearance Updated", `Your custom ${type === 'border' ? 'avatar border' : 'map icon'} has been equipped.`);
      await loadData();
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Failed to equip item."));
    } finally {
      setLoading(false);
    }
  };

  const handlePickProfilePhoto = async () => {
    if (!session) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to set your sponsor profile photo.");
      return;
    }
    try {
      setUploadingProfilePhoto(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const photo: DraftPhoto = {
        uri: asset.uri,
        fileName: asset.fileName || `sponsor-profile-${session.user.id}-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        fileSize: asset.fileSize,
      };
      setProfilePhotoOverride(asset.uri);
      await AsyncStorage.setItem(sponsorProfilePhotoStorageKey(session.user.id), asset.uri);
      const uploadedUrl = await uploadGreenPhoto({ photo, folder: "sponsor-profiles" });
      if (!uploadedUrl) throw new Error("Profile photo upload did not return a file URL.");
      await updateSponsorProfilePhoto(session, uploadedUrl);
      await updateSessionUser({ profile_photo_url: uploadedUrl });
      setPointsInfo((prev) => (prev ? { ...prev, profile_photo_url: uploadedUrl } : prev));
      Alert.alert("Profile photo updated", "Your sponsor photo now appears in the premium header and profile surfaces.");
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err, "Could not update your sponsor profile photo."));
    } finally {
      setUploadingProfilePhoto(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void hydrateProfilePhoto();
      void loadData();
    }, [hydrateProfilePhoto, loadData]),
  );

  const greeting = useMemo(() => getSponsorGreeting(), []);
  const greetingIcon = useMemo(() => getSponsorGreetingIcon(), []);
  const firstName = useMemo(() => getSponsorFirstName(session?.user.full_name), [session?.user.full_name]);
  const confirmedOrders = useMemo(() => orders.filter((item) => isConfirmedSponsorOrder(item)), [orders]);
  const unlockedBorderIds = useMemo(
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
  const unlockedMapIconIds = useMemo(
    () =>
      Array.from(
        new Set(
          (pointsInfo?.unlocked_map_icons || [])
            .map((item) => normalizeSponsorMapIcon(item))
            .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        ),
      ),
    [pointsInfo?.unlocked_map_icons],
  );
  const totalTrees = useMemo(
    () => confirmedOrders.reduce((sum, item) => sum + Number(item.total_units || item.quantity || 0), 0),
    [confirmedOrders],
  );
  const linkedTrees = useMemo(
    () => confirmedOrders.reduce((sum, item) => sum + Number(item.linked_units || 0), 0),
    [confirmedOrders],
  );
  const awaitingPlantingTrees = useMemo(
    () => confirmedOrders.reduce((sum, item) => sum + Number(item.awaiting_tree_units || 0), 0),
    [confirmedOrders],
  );
  const projectCount = useMemo(
    () => new Set(confirmedOrders.map((item) => Number(item.project_id || 0)).filter((id) => id > 0)).size,
    [confirmedOrders],
  );
  const pendingPaymentOrders = useMemo(() => orders.filter((item) => isPendingPaymentOrder(item)).length, [orders]);
  const featuredProject = useMemo(
    () => projects.find((project) => getSponsorProjectAvailability(project).ready) || projects[0] || null,
    [projects],
  );
  const profilePhotoUri = useMemo(
    () => {
      const override = String(profilePhotoOverride || "").trim();
      if (/^(file|content|ph|assets-library):/i.test(override)) return override;
      const sessionPhoto = resolveGreenAssetUrl(session?.user?.profile_photo_url || "");
      if (sessionPhoto) return sessionPhoto;
      const pointsPhoto = resolveGreenAssetUrl(pointsInfo?.profile_photo_url || "");
      if (pointsPhoto) return pointsPhoto;
      return override ? resolveGreenAssetUrl(override) : "";
    },
    [pointsInfo?.profile_photo_url, profilePhotoOverride, session?.user?.profile_photo_url],
  );
  const activeBorderMeta = useMemo(
    () => getSponsorAvatarBorderMeta(normalizeSponsorAvatarBorder(pointsInfo?.current_avatar_border)),
    [pointsInfo?.current_avatar_border],
  );
  const activeMapIconMeta = useMemo(
    () => getSponsorMapIconMeta(normalizeSponsorMapIcon(pointsInfo?.current_map_icon)),
    [pointsInfo?.current_map_icon],
  );
  const currentStatusLabel = useMemo(() => {
    if (linkedTrees > 0) return "Trees linked";
    if (awaitingPlantingTrees > 0) return "Awaiting planting";
    if (totalTrees > 0) return "Confirmed support";
    if (orders.length > 0) return "Orders submitted";
    return "No active orders";
  }, [awaitingPlantingTrees, linkedTrees, orders.length, totalTrees]);
  const currentStatusHelper = useMemo(() => {
    if (linkedTrees > 0) {
      return `${linkedTrees} live tree${linkedTrees === 1 ? "" : "s"} already visible in View My Trees.`;
    }
    if (awaitingPlantingTrees > 0) {
      return `${awaitingPlantingTrees} confirmed tree${awaitingPlantingTrees === 1 ? "" : "s"} waiting for field planting.`;
    }
    if (totalTrees > 0) {
      return `${totalTrees} confirmed tree${totalTrees === 1 ? "" : "s"} already reserved across your successful sponsorships.`;
    }
    if (pendingPaymentOrders > 0) {
      return `${pendingPaymentOrders} payment update${pendingPaymentOrders === 1 ? "" : "s"} now lives in Recent Updates only.`;
    }
    return achievements?.level ? achievements.level : "Climate Contributor";
  }, [achievements?.level, awaitingPlantingTrees, linkedTrees, pendingPaymentOrders, totalTrees]);
  const currentStatusColor = useMemo(() => {
    if (linkedTrees > 0) return "#166534";
    if (awaitingPlantingTrees > 0) return "#b7791f";
    if (totalTrees > 0) return "#0c2b1a";
    return colors.textSoft;
  }, [awaitingPlantingTrees, linkedTrees, totalTrees]);
  const handleMapIconPress = useCallback((value: unknown) => {
    const celebration = getSponsorMapIconCelebration(value);
    if (!celebration) return;
    Alert.alert(celebration.title, celebration.message);
  }, []);
  const impactWaterLitres = totalTrees * 120;
  const carbonKgAnnual = totalTrees * 21;
  const verifiedProjects = projectCount;

  const openTreesTab = () => {
    navigation.navigate("SponsorTrees" as never);
  };

  const openFeaturedProject = () => {
    if (!featuredProject) return;
    navigation.navigate("SponsorCheckout", { projectId: featuredProject.id });
  };

  if (!session) return null;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void loadData()} contentContainerStyle={styles.scrollContent}>
      {/* 1. Header background and greeting */}
      <View style={styles.headerContainer}>
        <ExpoImage source={sponsorHeroBackground} contentFit="cover" style={styles.headerBgImage} />
        
        {/* Soft gradient fade overlay to make text 100% readable on the left, while showing the plant on the right */}
        <LinearGradient
          colors={["#f9fcf9", "rgba(249, 252, 249, 0.88)", "rgba(249, 252, 249, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        
        <View style={styles.topRow}>
          <View style={styles.heroIdentityRow}>
            <View style={styles.brandMarkContainer}>
              <BrandMark size={48} />
            </View>
            <Pressable onPress={handlePickProfilePhoto} style={styles.heroAvatarPressable}>
              <View
                style={[
                  styles.heroAvatarOuter,
                  activeBorderMeta
                    ? {
                        borderColor: activeBorderMeta.borderColor,
                        shadowColor: activeBorderMeta.borderColor,
                        shadowOpacity: 0.5,
                        shadowRadius: 10,
                        elevation: 8,
                      }
                    : undefined,
                ]}
              >
                {profilePhotoUri ? (
                  <ExpoImage source={{ uri: profilePhotoUri }} style={styles.heroAvatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.heroAvatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                )}
                <View style={styles.heroAvatarCameraBadge}>
                  {uploadingProfilePhoto ? (
                    <ActivityIndicator size={10} color="#ffffff" />
                  ) : (
                    <Ionicons name="camera-outline" size={12} color="#ffffff" />
                  )}
                </View>
              </View>
            </Pressable>
          </View>
          {activeMapIconMeta ? (
            <Pressable
              onPress={() => handleMapIconPress(activeMapIconMeta.id)}
              style={[styles.headerMarkerPreview, { backgroundColor: activeMapIconMeta.backgroundColor, borderColor: activeMapIconMeta.borderColor }]}
            >
              <Ionicons name={activeMapIconMeta.iconName} size={18} color={activeMapIconMeta.iconColor} />
              <View style={[styles.headerMarkerSpark, { backgroundColor: activeMapIconMeta.iconSecondaryColor }]} />
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
            <Text style={styles.greetingBadgeText}>
              {achievements?.level ? achievements.level.split(":")[0] : "Climate Contributor"}
            </Text>
          </View>
          <Text style={styles.greetingTitle}>
            {greeting},{" "}
            <Text style={activeBorderMeta ? { color: activeBorderMeta.accentTextColor } : undefined}>{firstName}</Text>
          </Text>
          <Text style={styles.greetingSubtitle}>
            See where your trees are planted, how they are growing, and the impact they create.
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statsPill}>
            <Ionicons name="leaf-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{totalTrees} tree{totalTrees === 1 ? "" : "s"} sponsored</Text>
          </View>
          <View style={styles.statsPill}>
            <Ionicons name="git-network-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{verifiedProjects} project{verifiedProjects === 1 ? "" : "s"} supported</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodyContent}>
        {/* 2. Flat Feature Benefits Card (Informational, Non-Clickable) */}
        <View style={styles.quickLinksCard}>
        <Text style={styles.quickLinksHeader}>VERIFIED EVIDENCE PROGRAM</Text>
        <View style={styles.quickLinksRow}>
          <View style={styles.quickLinkItem}>
            <Ionicons name="map-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.quickLinkLabel}>Map proof</Text>
          </View>
          <View style={styles.quickLinkItem}>
            <Ionicons name="camera-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.quickLinkLabel}>Photo evidence</Text>
          </View>
          <View style={styles.quickLinkItem}>
            <Ionicons name="pulse-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.quickLinkLabel}>Tracked growth</Text>
          </View>
          <View style={styles.quickLinkItem}>
            <Ionicons name="sparkles-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.quickLinkLabel}>Live updates</Text>
          </View>
        </View>
      </View>

      {/* 3. Row of 2 Stats Cards */}
      <View style={styles.statsCardsRow}>
        <View style={styles.statsCardItem}>
          <View style={styles.statsCardCol}>
            <Text style={styles.statsCardKicker}>Trees Sponsored</Text>
            <Text style={styles.statsCardValue} adjustsFontSizeToFit={true} numberOfLines={1}>{totalTrees}</Text>
            <Text style={styles.statsCardHelper}>
              {confirmedOrders.length} confirmed order{confirmedOrders.length === 1 ? "" : "s"} ready for tracking
            </Text>
          </View>
          <View style={styles.statsCardIcon}>
            <Ionicons name="leaf-outline" size={32} color="#2aa852" />
          </View>
        </View>

        <View style={styles.statsCardItem}>
          <View style={styles.statsCardCol}>
            <Text style={styles.statsCardKicker}>Current Status</Text>
            <Text style={[styles.statsCardValue, { color: currentStatusColor }]} adjustsFontSizeToFit={true} numberOfLines={1}>
              {currentStatusLabel}
            </Text>
            <Text style={styles.statsCardHelper} numberOfLines={2}>
              {currentStatusHelper}
            </Text>
          </View>
          <View style={styles.statsCardIcon}>
            <Text style={{ fontSize: 32 }}>{achievements?.badge_emoji || "🌱"}</Text>
          </View>
        </View>
      </View>

      {/* 4. Row of Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable style={styles.outlineBtn} onPress={openTreesTab}>
          <Ionicons name="git-network-outline" size={16} color={colors.primaryDark} />
          <Text style={styles.outlineBtnText}>View My Trees</Text>
        </Pressable>
        <Pressable
          style={[styles.outlineBtn, !featuredProject && styles.solidBtnDisabled]}
          onPress={openFeaturedProject}
          disabled={!featuredProject}
        >
          <Ionicons name="leaf-outline" size={16} color={colors.primaryDark} />
          <Text style={styles.outlineBtnText}>{featuredProject ? "Sponsor More" : "Loading..."}</Text>
        </Pressable>
      </View>

      {/* 4.5 Green Points & Rewards Hub */}
      <View style={styles.pointsHubCard}>
        <View style={styles.pointsHubHeader}>
          <View style={styles.pointsHubHeaderLeft}>
            <View style={styles.pointsHubIconWrap}>
              <Ionicons name="gift-outline" size={20} color="#c5a059" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pointsHubTitle}>🎁 Green Points & Rewards</Text>
              <Text style={styles.pointsHubSubtitle}>
                Unlock premium digital assets, boost your points, buy merchandise, and influence local restoration!
              </Text>
            </View>
          </View>
        </View>

        {/* Points Display */}
        <View style={styles.pointsDisplayRow}>
          <View style={styles.pointsDisplayBlock}>
            <Text style={styles.pointsLabel}>CURRENT BALANCE</Text>
            <Text style={styles.pointsValue}>{pointsInfo?.green_points ?? 0} GP</Text>
          </View>
          <View style={styles.pointsDisplayBlock}>
            <Text style={styles.pointsLabel}>LIFETIME EARNED</Text>
            <Text style={styles.pointsValue}>{pointsInfo?.lifetime_points ?? 0} GP</Text>
          </View>
          <View style={[styles.pointsDisplayBlock, { backgroundColor: "#f4fbf4", borderColor: "#b8ddbf" }]}>
            <Text style={[styles.pointsLabel, { color: "#166534" }]}>MERCH ELIGIBLE</Text>
            <Text style={[styles.pointsValue, { color: "#166534" }]}>{pointsInfo?.merch_eligible_points ?? 0} GP</Text>
          </View>
          {pointsInfo?.point_booster_remaining_uses ? (
            <View style={[styles.pointsDisplayBlock, { backgroundColor: '#fdf2e9', borderColor: '#f39c12' }]}>
              <Text style={[styles.pointsLabel, { color: '#e67e22' }]}>ACTIVE BOOSTER</Text>
              <Text style={[styles.pointsValue, { color: '#e67e22', fontSize: 13 }]}>
                {pointsInfo.point_booster_multiplier}x ({pointsInfo.point_booster_remaining_uses} left)
              </Text>
            </View>
          ) : null}
        </View>

        {/* Referral Section */}
        <View style={styles.referralBox}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.referralTitle}>👥 Refer a Friend & Get 25 GP</Text>
            <Text style={styles.referralDesc}>
              Invite friends using your link. They receive <Text style={{fontWeight: 'bold'}}>10 GP</Text> immediately on sign up, and you receive <Text style={{fontWeight: 'bold'}}>25 GP</Text> once they sponsor their first tree!
            </Text>
            <Text style={styles.referralText}>Your code: <Text style={{ fontWeight: 'bold', color: colors.primaryDark }}>{pointsInfo?.referral_code || "LC-REF-..."}</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Pressable style={styles.referralShareBtn} onPress={handleShareReferral}>
              <Ionicons name="share-social-outline" size={14} color="#ffffff" />
              <Text style={styles.referralShareBtnText}>Share Link</Text>
            </Pressable>
          </View>
        </View>

        {/* Enter Referral Code */}
        {!pointsInfo?.referred_by_id ? (
          <View style={styles.referralApplyBox}>
            <TextInput
              placeholder="Enter friend's referral code"
              value={referralCodeInput}
              onChangeText={setReferralCodeInput}
              style={styles.referralInput}
              autoCapitalize="characters"
            />
            <Pressable 
              style={[styles.referralApplyBtn, referralSubmitting && { opacity: 0.6 }]}
              onPress={handleApplyReferral}
              disabled={referralSubmitting}
            >
              <Text style={styles.referralApplyBtnText}>Apply</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, color: '#53705f', fontStyle: 'italic' }}>
              ✓ Referral code applied! You have been referred by another Green Guardian.
            </Text>
          </View>
        )}

        {/* Active Referrer Checklist */}
        {pointsInfo && !pointsInfo.referral_rules_met ? (
          <View style={styles.rulesLockCard}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="lock-closed-outline" size={18} color="#721c24" />
              <Text style={styles.rulesLockTitle}>Points Redemption Locked</Text>
            </View>
            <Text style={styles.rulesLockSubtitle}>
              To spend your GP, you must satisfy the active referrer rules:
            </Text>
            <View style={{ gap: 6, marginTop: 6 }}>
              <View style={styles.rulesLockItem}>
                <Ionicons 
                  name={pointsInfo.personal_sponsor_met ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={pointsInfo.personal_sponsor_met ? "#27ae60" : "#721c24"} 
                />
                <Text style={[styles.rulesLockText, pointsInfo.personal_sponsor_met && styles.rulesLockTextDone]}>
                  Sponsor at least 1 tree yourself (Current: {pointsInfo.personal_trees_sponsored}/1)
                </Text>
              </View>
              <View style={styles.rulesLockItem}>
                <Ionicons 
                  name={pointsInfo.conversion_rate_met ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={pointsInfo.conversion_rate_met ? "#27ae60" : "#721c24"} 
                />
                <Text style={[styles.rulesLockText, pointsInfo.conversion_rate_met && styles.rulesLockTextDone]}>
                  Keep at least 20% conversion on referrals (Current: {pointsInfo.converted_referred_users} converted / {pointsInfo.total_referred_users} total referred)
                </Text>
              </View>
            </View>
          </View>
        ) : (
          pointsInfo && (
            <View style={styles.rulesSuccessCard}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#27ae60" />
                <Text style={styles.rulesSuccessTitle}>Active Referrer Rules Met</Text>
              </View>
              <Text style={styles.rulesSuccessSubtitle}>
                You have sponsored {pointsInfo.personal_trees_sponsored} tree(s) and converted {pointsInfo.converted_referred_users} out of {pointsInfo.total_referred_users} referral(s). Points redemption is active!
              </Text>
            </View>
          )
        )}

        {/* Tabs */}
        <View style={styles.hubTabsRow}>
          <Pressable 
            style={[styles.hubTab, pointsTab === 'unlocks' && styles.hubTabActive]} 
            onPress={() => setPointsTab('unlocks')}
          >
            <Text style={[styles.hubTabText, pointsTab === 'unlocks' && styles.hubTabTextActive]}>Assets</Text>
          </Pressable>
          <Pressable 
            style={[styles.hubTab, pointsTab === 'boosters' && styles.hubTabActive]} 
            onPress={() => setPointsTab('boosters')}
          >
            <Text style={[styles.hubTabText, pointsTab === 'boosters' && styles.hubTabTextActive]}>Boosters</Text>
          </Pressable>
          <Pressable 
            style={[styles.hubTab, pointsTab === 'influence' && styles.hubTabActive]} 
            onPress={() => setPointsTab('influence')}
          >
            <Text style={[styles.hubTabText, pointsTab === 'influence' && styles.hubTabTextActive]}>Influence</Text>
          </Pressable>
          <Pressable 
            style={[styles.hubTab, pointsTab === 'merch' && styles.hubTabActive]} 
            onPress={() => setPointsTab('merch')}
          >
            <Text style={[styles.hubTabText, pointsTab === 'merch' && styles.hubTabTextActive]}>Merch</Text>
          </Pressable>
        </View>

        {/* Tab Contents */}
        <View style={styles.hubContentBody}>
          {pointsTab === 'unlocks' && (
            <View style={{ gap: 10 }}>
              {/* Rare Tree Species */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.hubContentSectionHeader}>Rare Tree Species (500 GP)</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Rare Tree Species Info",
                  "Unlock rare species (Fruit Tree Bundle, Legacy Baobab) to plant them in your virtual garden and map profile. These species increase your canopy cover score."
                )}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.rewardGrid}>
                {['fruit_trees', 'baobab'].map((sp) => {
                  const isUnlocked = pointsInfo?.unlocked_species?.includes(sp);
                  const title = sp === 'fruit_trees' ? 'Fruit Tree Bundle' : 'Legacy Baobab';
                  const desc = sp === 'fruit_trees' 
                    ? 'Gain access to planting fruit-bearing tree species in your virtual garden and map. Each fruit tree yields additional community nutrition benefits.'
                    : 'Plant this ancient, iconic African species. Baobabs are exceptionally resilient, drought resistant, and sequester significant CO2.';
                  return (
                    <View key={sp} style={styles.rewardCard}>
                      <Ionicons name="leaf" size={24} color={isUnlocked ? "#2aa852" : "#95a5a6"} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.rewardTitleText}>{title}</Text>
                        <TouchableOpacity onPress={() => Alert.alert(title, desc)}>
                          <Ionicons name="information-circle-outline" size={12} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Pressable 
                        style={[styles.rewardBtn, isUnlocked && styles.rewardBtnUnlocked]}
                        onPress={() => !isUnlocked && handleRedeemReward(`unlock_species_${sp}`)}
                        disabled={isUnlocked}
                      >
                        <Text style={styles.rewardBtnText}>{isUnlocked ? "Unlocked" : "Unlock 500 GP"}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {/* Custom Avatars */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <Text style={styles.hubContentSectionHeader}>Custom Avatars / Profiles (200 GP)</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Custom Avatars Info",
                  "Customize your profile avatar border displayed on the public leaderboards and maps to distinguish you as an elite Climate Guardian."
                )}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.rewardGrid}>
                {SPONSOR_AVATAR_BORDERS.map((border) => {
                  const isUnlocked = unlockedBorderIds.includes(border.id);
                  const isEquipped = normalizeSponsorAvatarBorder(pointsInfo?.current_avatar_border) === border.id;
                  return (
                    <View key={border.id} style={[styles.rewardCard, isEquipped && styles.rewardCardEquipped]}>
                      <View
                        style={[
                          styles.rewardAvatarPreview,
                          {
                            borderColor: border.borderColor,
                            shadowColor: border.borderColor,
                            shadowOpacity: isUnlocked ? 0.5 : 0.18,
                            shadowRadius: 8,
                            elevation: isUnlocked ? 5 : 1,
                          },
                        ]}
                      >
                        {profilePhotoUri ? (
                          <ExpoImage source={{ uri: profilePhotoUri }} style={styles.rewardAvatarPreviewImage} contentFit="cover" />
                        ) : (
                          <Text style={[styles.rewardAvatarPreviewInitial, { color: border.accentTextColor }]}>
                            {firstName.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={styles.rewardStateChip}>
                        <Text style={styles.rewardStateChipText}>
                          {isEquipped ? "Live now" : isUnlocked ? "Unlocked" : "Locked"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.rewardTitleText}>{border.label}</Text>
                        <TouchableOpacity onPress={() => Alert.alert(border.label, border.subtitle)}>
                          <Ionicons name="information-circle-outline" size={12} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.rewardMetaText}>{border.subtitle}</Text>
                      {isUnlocked ? (
                        <Pressable 
                          style={[styles.rewardBtn, isEquipped ? { backgroundColor: '#2aa852' } : { backgroundColor: '#7f8c8d' }]}
                          onPress={() => handleToggleAppearance('border', isEquipped ? 'none' : border.id)}
                        >
                          <Text style={styles.rewardBtnText}>{isEquipped ? "Equipped" : "Equip"}</Text>
                        </Pressable>
                      ) : (
                        <Pressable 
                          style={styles.rewardBtn}
                          onPress={() => handleRedeemReward(`avatar_${border.id}`)}
                        >
                          <Text style={styles.rewardBtnText}>Unlock 200 GP</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Map Icons */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <Text style={styles.hubContentSectionHeader}>Custom 3D Map Icons (150 GP)</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Custom 3D Map Icons Info",
                  "Change the default tree markers on the live map to these custom 3D map assets to customize your restored plots."
                )}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.rewardGrid}>
                {SPONSOR_MAP_ICONS.map((iconMeta) => {
                  const isUnlocked = unlockedMapIconIds.includes(iconMeta.id);
                  const isEquipped = normalizeSponsorMapIcon(pointsInfo?.current_map_icon) === iconMeta.id;
                  return (
                    <View key={iconMeta.id} style={[styles.rewardCard, isEquipped && styles.rewardCardEquipped]}>
                      <Pressable
                        onPress={() => handleMapIconPress(iconMeta.id)}
                        style={[styles.rewardMapIconPreview, { backgroundColor: iconMeta.backgroundColor, borderColor: iconMeta.borderColor }]}
                      >
                        <Ionicons name={iconMeta.iconName} size={22} color={iconMeta.iconColor} />
                        <View style={[styles.rewardMapIconSpark, { backgroundColor: iconMeta.iconSecondaryColor }]} />
                      </Pressable>
                      <View style={styles.rewardStateChip}>
                        <Text style={styles.rewardStateChipText}>
                          {isEquipped ? "Live now" : isUnlocked ? "Unlocked" : "Locked"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.rewardTitleText}>{iconMeta.label}</Text>
                        <TouchableOpacity onPress={() => Alert.alert(iconMeta.label, iconMeta.description)}>
                          <Ionicons name="information-circle-outline" size={12} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.rewardMetaText}>{iconMeta.description}</Text>
                      {isUnlocked ? (
                        <Pressable 
                          style={[styles.rewardBtn, isEquipped ? { backgroundColor: '#2aa852' } : { backgroundColor: '#7f8c8d' }]}
                          onPress={() => handleToggleAppearance('icon', isEquipped ? 'default' : iconMeta.id)}
                        >
                          <Text style={styles.rewardBtnText}>{isEquipped ? "Equipped" : "Equip"}</Text>
                        </Pressable>
                      ) : (
                        <Pressable 
                          style={styles.rewardBtn}
                          onPress={() => handleRedeemReward(`map_icon_${iconMeta.id}`)}
                        >
                          <Text style={styles.rewardBtnText}>Unlock 150 GP</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {pointsTab === 'boosters' && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.hubContentSectionHeader}>Point Boosters & Multipliers</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Point Boosters Info",
                  "Boosters increase the GP you earn from each sponsored tree, letting you unlock rewards twice as fast."
                )}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {Number(pointsInfo?.point_booster_remaining_uses || 0) > 0 ? (
                <View style={styles.rewardBoosterBanner}>
                  <Text style={styles.rewardBoosterBannerTitle}>Active booster ready</Text>
                  <Text style={styles.rewardBoosterBannerBody}>
                    Your next {pointsInfo?.point_booster_remaining_uses} paid sponsor tree
                    {Number(pointsInfo?.point_booster_remaining_uses || 0) === 1 ? "" : "s"} will earn{" "}
                    {pointsInfo?.point_booster_multiplier || 1}x Green Points automatically.
                  </Text>
                </View>
              ) : null}
              <View style={styles.rewardCardFull}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Ionicons name="flame" size={32} color="#f39c12" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <Text style={styles.rewardTitleTextFull}>Sunshine Elixir (2x Multiplier)</Text>
                      <TouchableOpacity onPress={() => Alert.alert(
                        "Sunshine Elixir",
                        "Consume 50 GP to activate a double points elixir. Your very next sponsored tree will yield 50 GP instead of the standard 25 GP."
                      )}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.rewardDescTextFull}>Spend 50 GP to receive a 2x points booster on your next tree sponsorship order.</Text>
                  </View>
                </View>
                <Pressable 
                  style={styles.rewardBtnFull}
                  onPress={() => handleRedeemReward('multiplier')}
                >
                  <Text style={styles.rewardBtnText}>Unlock Booster for 50 GP</Text>
                </Pressable>
              </View>
            </View>
          )}

          {pointsTab === 'influence' && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Text style={styles.hubContentSectionHeader}>Local Influencer & Planting Decision</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Influence Decisions Info",
                  "Use your points to make a real-world difference by choosing where we plant next or co-funding community initiatives."
                )}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.rewardBoosterBanner}>
                <Text style={styles.rewardBoosterBannerTitle}>Use your Green Points in the real world</Text>
                <Text style={styles.rewardBoosterBannerBody}>
                  School nominations deduct 100 GP after submission. Community project contributions deduct exactly the GP amount you choose.
                </Text>
              </View>
              
              {/* Nominate School */}
              <View style={styles.rewardCardFull}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Ionicons name="school" size={32} color="#9b59b6" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <Text style={styles.rewardTitleTextFull}>Nominate a School (100 GP)</Text>
                      <TouchableOpacity onPress={() => Alert.alert(
                        "Nominate a School",
                        "Propose a local educational institution for a funded tree planting campaign. The LandCheck field agents will coordinate with the school to plant trees, educate students, and green the campus. This activity costs 100 GP."
                      )}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.rewardDescTextFull}>Choose where LandCheck Green plants next! Propose a local school in Nigeria for a tree planting event (costs 100 GP).</Text>
                  </View>
                </View>
                <Pressable 
                  style={[styles.rewardBtnFull, { backgroundColor: '#9b59b6' }]}
                  onPress={() => setNominateModalVisible(true)}
                >
                  <Text style={styles.rewardBtnText}>Submit School Nomination (100 GP)</Text>
                </Pressable>
              </View>

              {/* Propose Community Project */}
              <View style={styles.rewardCardFull}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Ionicons name="people" size={32} color="#3498db" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <Text style={styles.rewardTitleTextFull}>Co-fund Community Forest (GP Contribution)</Text>
                      <TouchableOpacity onPress={() => Alert.alert(
                        "Co-fund Community Forest",
                        "Pool your Green Points with other community members to collectively sponsor and establish a local community forest plot."
                      )}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.rewardDescTextFull}>Pool your Green Points with other sponsors to fund a new local community reforestation initiative.</Text>
                  </View>
                </View>
                <Pressable 
                  style={[styles.rewardBtnFull, { backgroundColor: '#3498db' }]}
                  onPress={() => setProjectModalVisible(true)}
                >
                  <Text style={styles.rewardBtnText}>Contribute Points</Text>
                </Pressable>
              </View>
            </View>
          )}

          {pointsTab === 'merch' && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Text style={styles.hubContentSectionHeader}>Real-world Branded Merchandise</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Branded Merchandise Info",
                  "Redeem premium branded gear that we personalize and ship to you. Only GP earned from paid tree sponsorship counts toward merchandise redemption."
                )}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.merchInfoCard}>
                <Text style={styles.merchInfoTitle}>Merch uses sponsor-only GP</Text>
                <Text style={styles.merchInfoText}>
                  Only GP earned from paid tree sponsorship qualifies for merchandise redemption. GP from referrals, games, daily spin, and social sharing does not count.
                </Text>
                <Text style={styles.merchInfoMeta}>
                  Sponsor tree GP earned: {sponsorTreePointsEarned} GP | Already committed to merch: {merchPointsSpent} GP | Available for merch now: {merchEligiblePoints} GP
                </Text>
              </View>
              <View style={styles.rewardGrid}>
                
                {/* Cap */}
                <View style={styles.rewardCard}>
                  <Ionicons name="baseball-outline" size={24} color="#e74c3c" />
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={styles.rewardTitleText}>LandCheck Cap</Text>
                    <TouchableOpacity onPress={() => Alert.alert(
                      "LandCheck Canvas Cap",
                      "Redeem a premium LandCheck Canvas Cap for 1,000 sponsor tree GP. Only GP earned from paid tree sponsorship qualifies for this physical cap."
                    )}>
                      <Ionicons name="information-circle-outline" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, color: '#7f8c8d', marginBottom: 4 }}>1,000 GP</Text>
                  <Text style={styles.rewardQualifierText}>Only paid tree sponsorship GP can redeem this cap.</Text>
                  <Pressable 
                    style={[styles.rewardBtn, { backgroundColor: '#e74c3c' }, merchEligiblePoints < 1000 && styles.rewardBtnDisabled]}
                    onPress={() => triggerMerchRedeem('merch_cap')}
                    disabled={merchEligiblePoints < 1000}
                  >
                    <Text style={styles.rewardBtnText}>{merchEligiblePoints >= 1000 ? "Redeem Cap" : "Need Sponsor GP"}</Text>
                  </Pressable>
                </View>
 
                {/* Tote */}
                <View style={styles.rewardCard}>
                  <Ionicons name="briefcase-outline" size={24} color="#e74c3c" />
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={styles.rewardTitleText}>LandCheck Tote</Text>
                    <TouchableOpacity onPress={() => Alert.alert(
                      "LandCheck Tote Bag",
                      "Redeem a premium eco-friendly LandCheck Tote Bag for 800 sponsor tree GP. Referral GP, game GP, and spin GP do not qualify for merchandise."
                    )}>
                      <Ionicons name="information-circle-outline" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, color: '#7f8c8d', marginBottom: 4 }}>800 GP</Text>
                  <Text style={styles.rewardQualifierText}>Only paid tree sponsorship GP can redeem this tote.</Text>
                  <Pressable 
                    style={[styles.rewardBtn, { backgroundColor: '#e74c3c' }, merchEligiblePoints < 800 && styles.rewardBtnDisabled]}
                    onPress={() => triggerMerchRedeem('merch_tote')}
                    disabled={merchEligiblePoints < 800}
                  >
                    <Text style={styles.rewardBtnText}>{merchEligiblePoints >= 800 ? "Redeem Tote" : "Need Sponsor GP"}</Text>
                  </Pressable>
                </View>
 
                {/* Hoodie */}
                <View style={styles.rewardCard}>
                  <Ionicons name="shirt" size={24} color="#e74c3c" />
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={styles.rewardTitleText}>Guardian Hoodie</Text>
                    <TouchableOpacity onPress={() => Alert.alert(
                      "Forest Guardian Hoodie",
                      "Redeem a premium fleece Forest Guardian Hoodie for 1,500 sponsor tree GP. This merch unlock is reserved for GP earned from paid tree sponsorship."
                    )}>
                      <Ionicons name="information-circle-outline" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, color: '#7f8c8d', marginBottom: 4 }}>1,500 GP</Text>
                  <Text style={styles.rewardQualifierText}>Only paid tree sponsorship GP can redeem this hoodie.</Text>
                  <Pressable 
                    style={[styles.rewardBtn, { backgroundColor: '#e74c3c' }, merchEligiblePoints < 1500 && styles.rewardBtnDisabled]}
                    onPress={() => triggerMerchRedeem('merch_hoodie')}
                    disabled={merchEligiblePoints < 1500}
                  >
                    <Text style={styles.rewardBtnText}>{merchEligiblePoints >= 1500 ? "Redeem Hoodie" : "Need Sponsor GP"}</Text>
                  </Pressable>
                </View>

              </View>
            </View>
          )}
        </View>
      </View>

      {/* 5. Impact Summary Card */}
      <View style={styles.impactCard}>
        <View style={styles.impactHeader}>
          <View style={styles.impactHeaderLeft}>
            <View style={styles.impactHeaderIconWrap}>
              <Ionicons name="git-network-outline" size={18} color="#1e8a42" />
            </View>
            <View style={styles.impactHeaderTitleGroup}>
              <Text style={styles.impactTitle}>Impact Summary</Text>
              <Text style={styles.impactSubtitle}>
                A sponsor-ready summary of what is already reserved, linked, and active across your tree portfolio.
              </Text>
            </View>
          </View>
          <View style={styles.dropdownBtn}>
            <Text style={styles.dropdownBtnText}>This Year</Text>
            <Ionicons name="chevron-down" size={11} color={colors.primaryDark} />
          </View>
        </View>

        <View style={styles.impactGrid}>
          <View style={styles.impactGridRow}>
            <View style={styles.impactGridItem}>
              <View style={styles.impactGridIconWrap}>
                <Ionicons name="leaf-outline" size={18} color="#2aa852" />
              </View>
              <View style={styles.impactGridContent}>
                <Text style={styles.impactGridValue}>{totalTrees}</Text>
                <Text style={styles.impactGridTitle}>Trees sponsored</Text>
                <Text style={styles.impactGridSubtitle}>Across all orders</Text>
              </View>
            </View>
            <View style={styles.impactGridItem}>
              <View style={styles.impactGridIconWrap}>
                <Ionicons name="git-network-outline" size={18} color="#2aa852" />
              </View>
              <View style={styles.impactGridContent}>
                <Text style={styles.impactGridValue}>{linkedTrees}</Text>
                <Text style={styles.impactGridTitle}>Live trees</Text>
                <Text style={styles.impactGridSubtitle}>Already linked to field records</Text>
              </View>
            </View>
          </View>

          <View style={styles.impactGridRow}>
            <View style={styles.impactGridItem}>
              <View style={styles.impactGridIconWrap}>
                <Ionicons name="water-outline" size={18} color="#2aa852" />
              </View>
              <View style={styles.impactGridContent}>
                <Text style={styles.impactGridValue}>{`${impactWaterLitres.toLocaleString()} L`}</Text>
                <Text style={styles.impactGridTitle}>Water retained</Text>
                <Text style={styles.impactGridSubtitle}>Estimated annual benefit</Text>
              </View>
            </View>
            <View style={styles.impactGridItem}>
              <View style={styles.impactGridIconWrap}>
                <Ionicons name="cloud-outline" size={18} color="#2aa852" />
              </View>
              <View style={styles.impactGridContent}>
                <Text style={styles.impactGridValue}>{`${carbonKgAnnual.toLocaleString()} kg/yr`}</Text>
                <Text style={styles.impactGridTitle}>CO2 expected</Text>
                <Text style={styles.impactGridSubtitle}>Projected annual absorption</Text>
              </View>
            </View>
          </View>

          <View style={styles.impactGridRow}>
            <View style={styles.impactGridItem}>
              <View style={styles.impactGridIconWrap}>
                <Ionicons name="business-outline" size={18} color="#2aa852" />
              </View>
              <View style={styles.impactGridContent}>
                <Text style={styles.impactGridValue}>{verifiedProjects}</Text>
                <Text style={styles.impactGridTitle}>Projects supported</Text>
                <Text style={styles.impactGridSubtitle}>Distinct projects in your journey</Text>
              </View>
            </View>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {/* 6. Sponsor Projects Card Section */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderTitleRow}>
            <Ionicons name="leaf-outline" size={20} color="#1e8a42" />
            <Text style={styles.sectionHeaderTitle}>Sponsor Projects</Text>
          </View>
          <Pressable onPress={() => {}}>
            <Text style={styles.viewAllLink}>
              View all <Ionicons name="chevron-forward" size={12} color="#1e8a42" />
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHeaderSubtitle}>
          Choose any public LandCheck Green project and reserve the number of trees you want to support.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No sponsor projects live yet"
            subtitle="Public sponsor projects will appear here as soon as the LandCheck team opens them for supporters."
          />
        ) : (
          <View style={styles.list}>
            {projects.map((project) => {
              const priceLabel = formatSponsorProjectPriceChoices(project);
              const availability = getSponsorProjectAvailability(project);
              const userProjectTrees = orders
                .filter((o) => o.project_id === project.id && ["paid", "allocated", "completed"].includes(String(o.order_status || o.payment_status || "").trim().toLowerCase()))
                .reduce((sum, o) => sum + Number(o.quantity || 0), 0);
              return (
                <Pressable
                  key={`sponsor-project-${project.id}`}
                  style={styles.projectCardHorizontal}
                  onPress={() => navigation.navigate("SponsorCheckout", { projectId: project.id })}
                >
                  <ExpoImage
                    source={{ uri: "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?q=80&w=300" }}
                    style={styles.projectCardImage as any}
                    contentFit="cover"
                  />
                  <View style={styles.projectCardContent}>
                    <View style={styles.projectCardHeader}>
                      <View style={styles.projectCardTitleGroup}>
                        <Ionicons name="leaf-outline" size={14} color="#1e8a42" style={{ marginRight: 4 }} />
                        <Text style={styles.projectCardTitle} numberOfLines={1}>
                          {project.public_title || project.name}
                        </Text>
                      </View>
                      {(() => {
                        const status = (project.status || "ongoing").toLowerCase();
                        let bg = "#fdf2f2";
                        let border = "rgba(220, 38, 38, 0.2)";
                        let textCol = "#dc2626";
                        let dotCol = "#dc2626";
                        let label = "Currently Ongoing";
                        
                        if (status === "paused") {
                          bg = "#fff9db";
                          border = "rgba(245, 158, 11, 0.2)";
                          textCol = "#d97706";
                          dotCol = "#f59e0b";
                          label = "Paused";
                        } else if (status === "closed") {
                          bg = "#f3f4f6";
                          border = "rgba(107, 114, 128, 0.2)";
                          textCol = "#4b5563";
                          dotCol = "#6b7280";
                          label = "Closed";
                        }
                        
                        return (
                          <View style={[styles.openBadge, { backgroundColor: bg, borderColor: border }]}>
                            <View style={[styles.openBadgeDot, { backgroundColor: dotCol }]} />
                            <Text style={[styles.openBadgeText, { color: textCol }]}>{label}</Text>
                          </View>
                        );
                      })()}
                    </View>
                    <Text style={styles.projectCardSubtitle} numberOfLines={1}>
                      {project.location_text || "Approved tree restoration area"}
                    </Text>
                    <Text style={styles.projectCardDescription} numberOfLines={2}>
                      {project.public_description ||
                        "Support verified tree planting in a real project and receive ongoing evidence as planting and maintenance happen."}
                    </Text>
                    
                    <View style={styles.projectMetricsRow}>
                      <View style={styles.projectMetricCol}>
                        <Text style={styles.projectMetricValue}>{project.sponsor_capacity || 0}</Text>
                        <Text style={styles.projectMetricLabel}>Target</Text>
                      </View>
                      <View style={styles.projectMetricDivider} />
                      <View style={styles.projectMetricCol}>
                        <Text style={styles.projectMetricValue}>{project.slots_reserved || 0}</Text>
                        <Text style={styles.projectMetricLabel}>Sponsored</Text>
                      </View>
                      <View style={styles.projectMetricDivider} />
                      <View style={styles.projectMetricCol}>
                        <Text style={styles.projectMetricValue}>{userProjectTrees}</Text>
                        <Text style={styles.projectMetricLabel}>My Trees</Text>
                      </View>
                    </View>

                    <View style={styles.projectBadgesRow}>
                      <View style={styles.projectBadge}>
                        <Ionicons name="cash-outline" size={10} color="#1e8a42" />
                        <Text style={styles.projectBadgeText}>{priceLabel}</Text>
                      </View>
                      <View style={styles.projectBadge}>
                        <Ionicons name="ribbon-outline" size={10} color="#1e8a42" />
                        <Text style={styles.projectBadgeText}>{project.organization_name || "LandCheck"}</Text>
                      </View>
                      <View style={styles.projectBadge}>
                        <Ionicons name="gift-outline" size={10} color="#1e8a42" />
                        <Text style={styles.projectBadgeText}>Dedications</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* 7. Recent Updates Section */}
      <View style={[styles.sectionContainer, { marginTop: spacing.md }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderTitleRow}>
            <Ionicons name="time-outline" size={20} color="#1e8a42" />
            <Text style={styles.sectionHeaderTitle}>Recent Updates</Text>
          </View>
        </View>
        <Text style={styles.sectionHeaderSubtitle}>
          These updates show where your sponsorship orders currently stand.
        </Text>

        {orders.length === 0 ? (
          <EmptyState
            title="No sponsorship orders yet"
            subtitle="When you sponsor trees, your payment review and tree-linking progress will appear here."
          />
        ) : (
          <View style={styles.list}>
            {orders.slice(0, 4).map((order) => (
              <View key={`sponsor-order-${order.id}`} style={styles.orderRow}>
                <View style={styles.orderDotColumn}>
                  <View style={styles.orderDot} />
                  <View style={styles.orderLine} />
                </View>
                <View style={styles.orderContent}>
                  <View style={styles.orderHead}>
                    <Text style={styles.orderTitle}>{order.project_name || "Sponsored project"}</Text>
                    <StatusChip label={formatOrderStageLabel(order)} tone={toneForOrder(order.order_status || order.payment_status)} />
                  </View>
                  <Text style={styles.orderMeta}>
                    {order.quantity} tree{order.quantity === 1 ? "" : "s"} | {formatCurrencyAmount(order.amount_total, order.currency)}
                  </Text>
                  <Text style={styles.orderMeta}>
                    Linked: {Number(order.linked_units || 0)} | Awaiting planting: {Number(order.awaiting_tree_units || 0)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 8. Support & Feedback Section */}
      <View style={[styles.sectionContainer, { marginTop: spacing.md, marginBottom: spacing.lg }]}>
        <View style={styles.supportCard}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="help-buoy-outline" size={22} color={colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.supportCardTitle}>Need Help or Have a Complaint?</Text>
              <Text style={styles.supportCardSubtitle}>
                Submit feedback, report tree allocation issues, or file a complaint directly with our supervisors.
              </Text>
            </View>
          </View>
          <Pressable style={styles.supportCardBtn} onPress={() => setComplaintModalVisible(true)}>
            <Ionicons name="alert-circle-outline" size={16} color="#ffffff" />
            <Text style={styles.supportCardBtnText}>Submit Report / Complaint</Text>
          </Pressable>
        </View>
      </View>
    </View>

    {/* Sponsor Complaint / Report Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={complaintModalVisible}
      onRequestClose={() => setComplaintModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>📢 Report / Complain</Text>
          <Text style={styles.modalSubtitle}>Submit a ticket or issue to our supervisors.</Text>
          
          <View style={styles.segmentRow}>
            {['general', 'allocation', 'points'].map((type) => (
              <Pressable
                key={type}
                onPress={() => setComplaintType(type)}
                style={[styles.segmentButton, complaintType === type && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentLabel, complaintType === type && styles.segmentLabelActive, { fontSize: 12 }]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {complaintType === 'allocation' && (
            <TextInput
              placeholder="Tree ID (Optional, numeric)"
              placeholderTextColor="#7f8c8d"
              style={styles.modalInput}
              value={complaintTreeId}
              onChangeText={setComplaintTreeId}
              keyboardType="numeric"
            />
          )}

          <TextInput
            placeholder="Write your complaint or issue details here..."
            placeholderTextColor="#7f8c8d"
            style={[styles.modalInput, { height: 100, textAlignVertical: 'top', marginTop: 10 }]}
            value={complaintMessage}
            onChangeText={setComplaintMessage}
            multiline={true}
          />

          <View style={styles.modalActions}>
            <Pressable 
              style={[styles.modalBtn, styles.modalBtnCancel]} 
              onPress={() => setComplaintModalVisible(false)}
              disabled={complaintSubmitting}
            >
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[styles.modalBtn, styles.modalBtnSubmit, complaintSubmitting && { opacity: 0.6 }]} 
              onPress={handleSubmitComplaint}
              disabled={complaintSubmitting}
            >
              <Text style={styles.modalBtnSubmitText}>
                {complaintSubmitting ? "Submitting..." : "Submit"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* Merchandise Delivery Details Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={merchModalVisible}
      onRequestClose={() => setMerchModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>📦 Delivery Details (Nigeria)</Text>
          <Text style={styles.modalSubtitle}>Please specify how you would like to receive your branded merchandise. Only paid tree sponsorship GP qualifies for merch redemption.</Text>
          
          <View style={styles.inputBlock}>
            <Text style={styles.label}>Delivery Method</Text>
            <View style={styles.segmentRow}>
              <Pressable
                onPress={() => setDeliveryMethod("home_delivery")}
                style={[styles.segmentButton, deliveryMethod === "home_delivery" && styles.segmentButtonActive, { paddingVertical: 8, minHeight: 38 }]}
              >
                <Text style={[styles.segmentLabel, deliveryMethod === "home_delivery" && styles.segmentLabelActive, { fontSize: 11 }]}>Home Delivery</Text>
              </Pressable>
              <Pressable
                onPress={() => setDeliveryMethod("office_pickup")}
                style={[styles.segmentButton, deliveryMethod === "office_pickup" && styles.segmentButtonActive, { paddingVertical: 8, minHeight: 38 }]}
              >
                <Text style={[styles.segmentLabel, deliveryMethod === "office_pickup" && styles.segmentLabelActive, { fontSize: 11 }]}>Hub Pickup</Text>
              </Pressable>
              <Pressable
                onPress={() => setDeliveryMethod("transport_terminal")}
                style={[styles.segmentButton, deliveryMethod === "transport_terminal" && styles.segmentButtonActive, { paddingVertical: 8, minHeight: 38 }]}
              >
                <Text style={[styles.segmentLabel, deliveryMethod === "transport_terminal" && styles.segmentLabelActive, { fontSize: 11 }]}>Transport Park</Text>
              </Pressable>
            </View>
          </View>

          {deliveryMethod === "home_delivery" && (
            <>
              <TextInput
                placeholder="Delivery Address"
                placeholderTextColor="#7f8c8d"
                style={styles.modalInput}
                value={shippingAddress}
                onChangeText={setShippingAddress}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  placeholder="State"
                  placeholderTextColor="#7f8c8d"
                  style={[styles.modalInput, { flex: 1 }]}
                  value={shippingState}
                  onChangeText={setShippingState}
                />
                <TextInput
                  placeholder="LGA (Local Government Area)"
                  placeholderTextColor="#7f8c8d"
                  style={[styles.modalInput, { flex: 1.5 }]}
                  value={shippingLga}
                  onChangeText={setShippingLga}
                />
              </View>
            </>
          )}

          {deliveryMethod === "office_pickup" && (
            <View style={styles.inputBlock}>
              <Text style={styles.label}>Select Pickup Hub</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {["Lagos", "Abuja", "Enugu", "Port Harcourt"].map((hub) => (
                  <Pressable
                    key={hub}
                    onPress={() => setSelectedHub(hub)}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: radii.md,
                        borderWidth: 1.5,
                        borderColor: selectedHub === hub ? colors.primaryDark : "#dcdfdc",
                        backgroundColor: selectedHub === hub ? "#eef8ef" : "#fbfcfb",
                      },
                      pressed && { opacity: 0.8 }
                    ]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: selectedHub === hub ? colors.primaryDark : colors.text }}>{hub}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {deliveryMethod === "transport_terminal" && (
            <>
              <View style={styles.inputBlock}>
                <Text style={styles.label}>Select Transport Service</Text>
                <View style={styles.segmentRow}>
                  {["GIGM", "Peace Mass Transit"].map((company) => (
                    <Pressable
                      key={company}
                      onPress={() => setSelectedTransport(company)}
                      style={[styles.segmentButton, selectedTransport === company && styles.segmentButtonActive, { paddingVertical: 8, minHeight: 38 }]}
                    >
                      <Text style={[styles.segmentLabel, selectedTransport === company && styles.segmentLabelActive, { fontSize: 11 }]}>{company}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <TextInput
                placeholder="Destination Terminal / Park Name"
                placeholderTextColor="#7f8c8d"
                style={styles.modalInput}
                value={destinationTerminal}
                onChangeText={setDestinationTerminal}
              />
            </>
          )}

          <TextInput
            placeholder="Contact Phone Number"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={shippingPhone}
            onChangeText={setShippingPhone}
            keyboardType="phone-pad"
          />

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setMerchModalVisible(false)}>
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnSubmit]}
              onPress={async () => {
                if (!shippingPhone.trim()) {
                  Alert.alert("Validation Error", "Contact Phone Number is required.");
                  return;
                }
                const shippingDetails: any = {
                  delivery_method: deliveryMethod,
                  phone: shippingPhone.trim(),
                };
                if (deliveryMethod === "home_delivery") {
                  if (!shippingAddress.trim() || !shippingState.trim() || !shippingLga.trim()) {
                    Alert.alert("Validation Error", "Address, State, and LGA are required for Home Delivery.");
                    return;
                  }
                  shippingDetails.address = shippingAddress.trim();
                  shippingDetails.state = shippingState.trim();
                  shippingDetails.lga = shippingLga.trim();
                } else if (deliveryMethod === "office_pickup") {
                  shippingDetails.hub = selectedHub;
                } else if (deliveryMethod === "transport_terminal") {
                  if (!destinationTerminal.trim()) {
                    Alert.alert("Validation Error", "Destination Terminal/Park is required.");
                    return;
                  }
                  shippingDetails.transport_company = selectedTransport;
                  shippingDetails.destination_terminal = destinationTerminal.trim();
                }
                
                setMerchModalVisible(false);
                await handleRedeemReward(selectedMerchType, shippingDetails);
              }}
            >
              <Text style={styles.modalBtnSubmitText}>Confirm Redeem</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* School Nomination Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={nominateModalVisible}
      onRequestClose={() => setNominateModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>🏫 Nominate a School</Text>
          <Text style={styles.modalSubtitle}>Propose a school in Nigeria for a free tree-planting event.</Text>
          
          <TextInput
            placeholder="School Name"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={schoolName}
            onChangeText={setSchoolName}
          />
          <TextInput
            placeholder="School Address / State"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={schoolAddress}
            onChangeText={setSchoolAddress}
          />
          <TextInput
            placeholder="Contact Person (Optional)"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={schoolContact}
            onChangeText={setSchoolContact}
          />
          <TextInput
            placeholder="Contact Phone (Optional)"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={schoolPhone}
            onChangeText={setSchoolPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            placeholder="Why should we plant trees here? (Reason)"
            placeholderTextColor="#7f8c8d"
            style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
            value={nominateReason}
            onChangeText={setNominateReason}
            multiline={true}
          />

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setNominateModalVisible(false)}>
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnSubmit]} onPress={handleNominateSchool}>
              <Text style={styles.modalBtnSubmitText}>Submit</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* Community Project Contribution Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={projectModalVisible}
      onRequestClose={() => setProjectModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>🌳 Propose a Community Forest</Text>
          <Text style={styles.modalSubtitle}>Contribute your points to help fund a community forest restoration.</Text>
          
          <TextInput
            placeholder="Proposed Project Name"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={projectName}
            onChangeText={setProjectName}
          />
          <TextInput
            placeholder="Proposed Location / Community / LGA"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={projectLocation}
            onChangeText={setProjectLocation}
          />
          <TextInput
            placeholder="Short Description of the area"
            placeholderTextColor="#7f8c8d"
            style={[styles.modalInput, { height: 60, textAlignVertical: 'top' }]}
            value={projectDesc}
            onChangeText={setProjectDesc}
            multiline={true}
          />
          <TextInput
            placeholder="Points to Contribute (e.g. 100)"
            placeholderTextColor="#7f8c8d"
            style={styles.modalInput}
            value={projectPoints}
            onChangeText={setProjectPoints}
            keyboardType="numeric"
          />

          <View style={styles.modalActions}>
            <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setProjectModalVisible(false)}>
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnSubmit]} onPress={handleCreateCommunityProject}>
              <Text style={styles.modalBtnSubmitText}>Contribute GP</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </ScreenSurface>
  );
};

const styles = StyleSheet.create({
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
  brandMarkContainer: {
    borderRadius: radii.md,
    backgroundColor: "#ffffff",
    padding: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroAvatarPressable: {
    borderRadius: 999,
  },
  heroAvatarOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: colors.primary,
    backgroundColor: "#dff3e5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
  },
  heroAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
  },
  heroAvatarInitial: {
    color: colors.primaryDark,
    fontSize: 19,
    fontWeight: "900",
  },
  heroAvatarCameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  headerMarkerPreview: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerMarkerSpark: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 10,
    height: 10,
    borderRadius: 999,
    opacity: 0.92,
  },
  sunnyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
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
  quickLinksCard: {
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  quickLinksHeader: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  quickLinksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quickLinkItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  quickLinkLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  statsCardsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statsCardItem: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statsCardCol: {
    flex: 1,
    gap: 4,
  },
  statsCardKicker: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  statsCardValue: {
    color: "#0c2b1a",
    fontSize: 24,
    fontWeight: "900",
  },
  statsCardHelper: {
    color: colors.textSoft,
    fontSize: 11,
  },
  statsCardIcon: {
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    backgroundColor: "#ffffff",
    borderRadius: radii.lg,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  outlineBtnText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "900",
  },
  solidBtn: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    borderRadius: radii.lg,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  solidBtnDisabled: {
    opacity: 0.6,
  },
  solidBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  impactCard: {
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  impactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  impactHeaderLeft: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  impactHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(42, 168, 82, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(42, 168, 82, 0.15)",
  },
  impactHeaderTitleGroup: {
    flex: 1,
    gap: 4,
  },
  impactTitle: {
    color: "#0c2b1a",
    fontSize: 16,
    fontWeight: "900",
  },
  impactSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  dropdownBtnText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
  },
  impactGrid: {
    gap: 8,
  },
  impactGridRow: {
    flexDirection: "row",
    gap: 8,
  },
  impactGridItem: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  impactGridIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(42, 168, 82, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  impactGridContent: {
    flex: 1,
    gap: 2,
  },
  impactGridValue: {
    color: "#0c2b1a",
    fontSize: 15,
    fontWeight: "900",
  },
  impactGridTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  impactGridSubtitle: {
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  progressBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e6efe8",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#1e8a42",
  },
  progressBarLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionContainer: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionHeaderTitle: {
    color: "#0c2b1a",
    fontSize: 18,
    fontWeight: "900",
  },
  viewAllLink: {
    color: "#1e8a42",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionHeaderSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
  },
  projectCardHorizontal: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    borderLeftWidth: 4,
    borderLeftColor: "#c5a059",
    padding: 12,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  projectCardImage: {
    width: 100,
    height: 135,
    borderRadius: radii.md,
    backgroundColor: "#e6efe8",
  },
  projectCardContent: {
    flex: 1,
    gap: 4,
    justifyContent: "space-between",
  },
  projectCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 4,
  },
  projectCardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  projectCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  openBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eefbf2",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 0.5,
    borderColor: "rgba(42, 168, 82, 0.2)",
  },
  openBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#2aa852",
  },
  openBadgeText: {
    color: "#1e8a42",
    fontSize: 9,
    fontWeight: "800",
  },
  projectCardSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  projectCardDescription: {
    color: colors.textSoft,
    fontSize: 11.5,
    lineHeight: 16,
  },
  projectBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f6f9f7",
    borderWidth: 0.5,
    borderColor: "rgba(22, 103, 58, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  projectBadgeText: {
    color: "#0f3124",
    fontSize: 9,
    fontWeight: "700",
  },
  list: {
    gap: spacing.sm,
  },
  orderRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  orderDotColumn: {
    width: 18,
    alignItems: "center",
  },
  orderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#c5a059",
    marginTop: 6,
  },
  orderLine: {
    width: 2,
    flex: 1,
    backgroundColor: "rgba(197, 160, 89, 0.2)",
    marginTop: 6,
  },
  orderContent: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(197, 160, 89, 0.3)",
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 4,
  },
  orderHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  orderTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  orderMeta: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  scrollContent: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  bodyContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  projectMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4faf6",
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: "rgba(30, 138, 66, 0.15)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  projectMetricCol: {
    flex: 1,
    alignItems: "center",
  },
  projectMetricValue: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f3124",
  },
  projectMetricLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#1e8a42",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  projectMetricDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(30, 138, 66, 0.15)",
  },
  pointsHubCard: {
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: "#c5a059",
    padding: spacing.md,
    gap: spacing.md,
    marginVertical: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pointsHubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pointsHubHeaderLeft: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  pointsHubIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(197, 160, 89, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(197, 160, 89, 0.15)",
  },
  pointsHubTitle: {
    color: "#0c2b1a",
    fontSize: 16,
    fontWeight: "900",
  },
  pointsHubSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  pointsDisplayRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  pointsDisplayBlock: {
    flex: 1,
    minWidth: 90,
    backgroundColor: "#fbfcfb",
    borderWidth: 1,
    borderColor: "#dcdfdc",
    padding: 8,
    borderRadius: radii.md,
    alignItems: "center",
  },
  pointsLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  pointsValue: {
    fontSize: 15,
    color: "#0c2b1a",
    fontWeight: "900",
    marginTop: 2,
  },
  referralBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fcf9",
    borderWidth: 1,
    borderColor: "#2aa852",
    borderRadius: radii.md,
    padding: 10,
    justifyContent: "space-between",
  },
  referralTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0c2b1a",
  },
  referralText: {
    fontSize: 11,
    color: colors.textSoft,
  },
  referralShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2aa852",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  referralShareBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  referralApplyBox: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  referralInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dcdfdc",
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    backgroundColor: "#fbfcfb",
  },
  referralApplyBtn: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  referralApplyBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  hubTabsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#dcdfdc",
  },
  hubTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  hubTabActive: {
    borderBottomColor: "#c5a059",
  },
  hubTabText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "800",
  },
  hubTabTextActive: {
    color: "#c5a059",
  },
  hubContentBody: {
    marginTop: 6,
  },
  hubContentSectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSoft,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginVertical: 4,
  },
  rewardGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  rewardCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6efe8",
    borderRadius: radii.md,
    padding: 10,
    alignItems: "center",
    gap: 6,
  },
  rewardCardEquipped: {
    borderColor: "#8fd3a0",
    backgroundColor: "#f4fbf5",
  },
  rewardAvatarPreview: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    backgroundColor: "#eef7f1",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
  },
  rewardAvatarPreviewImage: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
  },
  rewardAvatarPreviewInitial: {
    fontSize: 22,
    fontWeight: "900",
  },
  rewardStateChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "#f3f7f4",
    borderWidth: 1,
    borderColor: "#dce7df",
  },
  rewardStateChipText: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rewardTitleText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0c2b1a",
    textAlign: "center",
  },
  rewardMetaText: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: "center",
    minHeight: 42,
  },
  rewardMapIconPreview: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rewardMapIconSpark: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 12,
    height: 12,
    borderRadius: 999,
    opacity: 0.92,
  },
  rewardBtn: {
    backgroundColor: "#c5a059",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    width: "100%",
    alignItems: "center",
  },
  rewardBtnDisabled: {
    opacity: 0.55,
  },
  rewardBtnUnlocked: {
    backgroundColor: "#2aa852",
  },
  rewardBtnText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  rewardQualifierText: {
    fontSize: 10,
    lineHeight: 14,
    color: "#2f5b42",
    textAlign: "center",
    marginBottom: 8,
  },
  rewardCardFull: {
    backgroundColor: "#fbfcfb",
    borderWidth: 1,
    borderColor: "#e6efe8",
    borderRadius: radii.md,
    padding: 12,
    gap: 10,
  },
  rewardBoosterBanner: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#d8eadc",
    backgroundColor: "#f4fbf5",
    padding: 12,
    gap: 4,
  },
  rewardBoosterBannerTitle: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "900",
  },
  rewardBoosterBannerBody: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
  },
  rewardTitleTextFull: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0c2b1a",
  },
  rewardDescTextFull: {
    fontSize: 11,
    color: colors.textSoft,
    lineHeight: 15,
  },
  merchInfoCard: {
    backgroundColor: "#f7fbf7",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#dcebdd",
    padding: 12,
    gap: 6,
  },
  merchInfoTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0c2b1a",
  },
  merchInfoText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSoft,
  },
  merchInfoMeta: {
    fontSize: 10,
    lineHeight: 15,
    color: "#166534",
    fontWeight: "700",
  },
  rewardBtnFull: {
    backgroundColor: "#f39c12",
    paddingVertical: 8,
    borderRadius: radii.md,
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    width: "100%",
    borderRadius: radii.xl,
    padding: 20,
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0c2b1a",
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#dcdfdc",
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    backgroundColor: "#fbfcfb",
    color: "#0c2b1a",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    backgroundColor: "#f2f2f2",
  },
  modalBtnCancelText: {
    color: colors.textSoft,
    fontWeight: "800",
  },
  modalBtnSubmit: {
    backgroundColor: colors.primaryDark,
  },
  modalBtnSubmitText: {
    color: "#ffffff",
    fontWeight: "900",
  },
  rulesLockCard: {
    backgroundColor: "#fdf2f2",
    borderWidth: 1,
    borderColor: "#f5c6cb",
    borderRadius: radii.lg,
    padding: 12,
    marginTop: 8,
    gap: 6,
  },
  rulesLockTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#721c24",
  },
  rulesLockSubtitle: {
    fontSize: 11,
    color: "#721c24",
    opacity: 0.8,
  },
  rulesLockItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rulesLockText: {
    fontSize: 11,
    color: "#721c24",
  },
  rulesLockTextDone: {
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  rulesSuccessCard: {
    backgroundColor: "#f4f9f4",
    borderWidth: 1,
    borderColor: "#c3e6cb",
    borderRadius: radii.lg,
    padding: 12,
    marginTop: 8,
    gap: 4,
  },
  rulesSuccessTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#155724",
  },
  rulesSuccessSubtitle: {
    fontSize: 11,
    color: "#155724",
    lineHeight: 15,
  },
  supportCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6efe8",
    borderRadius: radii.xl,
    padding: 16,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  supportCardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0c2b1a",
  },
  supportCardSubtitle: {
    fontSize: 12,
    color: colors.textSoft,
    lineHeight: 16,
  },
  supportCardBtn: {
    backgroundColor: colors.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: radii.lg,
  },
  supportCardBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  referralDesc: {
    fontSize: 11,
    color: colors.textSoft,
    lineHeight: 16,
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#dcdfdc",
    backgroundColor: "#fbfcfb",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  segmentLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  segmentLabelActive: {
    color: "#ffffff",
  },
  inputBlock: {
    gap: 4,
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0c2b1a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
