import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Linking, Share, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "../../components/BrandMark";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { GreenTreeCaptureMap } from "../../components/GreenTreeCaptureMap";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { StatusChip } from "../../components/StatusChip";
import { SponsorIdentityAvatar } from "../../components/SponsorIdentityAvatar";
import {
  buildSponsorCertificateUrl,
  buildSponsorPublicCertificateUrl,
  buildSponsorPublicTreeStoryUrl,
  fetchSponsorTreeDetail,
} from "../../api/sponsor";
import { getErrorMessage } from "../../api/client";
import { API_URL } from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { getSponsorGreetingIcon } from "../../sponsor/presentation";
import { appendGreenAssetRenderParams, resolveGreenAssetCandidates } from "../../utils/assets";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatCoordinate, formatDate, formatDateTime, toTitle } from "../../utils/format";
import type { SponsorAppStackParamList } from "../../types/navigation";
import type { SponsorTreeDetail, TreeSummary } from "../../types/domain";

type Props = NativeStackScreenProps<SponsorAppStackParamList, "SponsorTreeDetail">;

const sponsorHeroBackground = require("../../../assets/background-sponsor.png");
const treePhotoEndpoint = (treeId: number) => `${API_URL}/green/trees/${treeId}/photo?w=1280&q=76&fm=jpeg`;

const toneForTree = (status?: string | null) => {
  const key = String(status || "").trim().toLowerCase();
  if (key === "linked" || key === "active" || key === "alive") return "online" as const;
  if (key === "needs_attention" || key === "stressed") return "warning" as const;
  if (key === "dead" || key === "replaced") return "offline" as const;
  return "neutral" as const;
};

const buildEvidencePhotoCandidates = (source?: string | null, treeId?: number | null) => {
  const seen = new Set<string>();
  const output: string[] = [];
  const add = (value: string) => {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    output.push(next);
  };
  const raw = String(source || "").trim();
  if (raw) {
    resolveGreenAssetCandidates(raw).forEach((candidate) => {
      add(appendGreenAssetRenderParams(candidate, { w: 1440, q: 78, fm: "jpeg" }));
    });
  }
  if (Number(treeId || 0) > 0) {
    add(treePhotoEndpoint(Number(treeId)));
  }
  return output;
};

const EvidencePhotoCard = ({ source, title, meta, treeId }: { source?: string | null; title: string; meta?: string | null; treeId?: number | null }) => {
  const candidates = useMemo(() => buildEvidencePhotoCandidates(source, treeId), [source, treeId]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [source]);

  const activeSource = !failed ? candidates[candidateIndex] || "" : "";

  return (
    <View style={styles.photoCard}>
      {activeSource ? (
        <ExpoImage
          source={{ uri: activeSource }}
          style={styles.photo}
          contentFit="cover"
          transition={180}
          onError={() => {
            if (candidateIndex + 1 < candidates.length) {
              setCandidateIndex(candidateIndex + 1);
              return;
            }
            setFailed(true);
          }}
        />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="image-outline" size={24} color={colors.textMuted} />
          <Text style={styles.photoPlaceholderText}>Photo unavailable</Text>
        </View>
      )}
      <View style={styles.photoMetaPanel}>
        <Text style={styles.photoMetaTitle}>{title}</Text>
        {meta ? <Text style={styles.photoMetaText}>{meta}</Text> : null}
      </View>
    </View>
  );
};

export const SponsorTreeDetailScreen = ({ route }: Props) => {
  const { session } = useAuth();
  const [item, setItem] = useState<SponsorTreeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    setError("");
    try {
      const detail = await fetchSponsorTreeDetail(session, route.params.unitId);
      setItem(detail);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load this sponsored tree."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.unitId, session]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const mapTree = useMemo<TreeSummary[]>(() => {
    if (!item || !Number(item.tree_id || 0) || !Number.isFinite(Number(item.lng)) || !Number.isFinite(Number(item.lat))) return [];
    return [
      {
        id: Number(item.tree_id || 0),
        project_id: Number(item.project_id || 0),
        project_tree_no: item.project_tree_no ?? null,
        species: item.species || null,
        planting_date: item.planting_date || null,
        status: item.tree_status || null,
        photo_url: item.photo_url || null,
        photo_urls: item.photo_urls || [],
        tree_height_m: item.tree_height_m ?? null,
        tree_age_months: item.tree_age_months ?? null,
        inventory_tree_count: item.inventory_tree_count ?? null,
        lng: item.lng ?? null,
        lat: item.lat ?? null,
        created_at: item.tree_created_at || null,
      },
    ];
  }, [item]);

  const publicStoryUrl = useMemo(() => buildSponsorPublicTreeStoryUrl(item?.unit_uid), [item?.unit_uid]);
  const greetingIcon = useMemo(() => getSponsorGreetingIcon(), []);
  const certificateUrl = useMemo(
    () => (session ? buildSponsorCertificateUrl(session, route.params.unitId) : ""),
    [route.params.unitId, session],
  );
  const mapsUrl = useMemo(() => {
    if (!item?.lat || !item?.lng) return "";
    return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
  }, [item?.lat, item?.lng]);

  const galleryItems = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ source: string; title: string; meta?: string | null; treeId?: number | null }> = [];
    const add = (source: string | null | undefined, title: string, meta?: string | null, treeId?: number | null) => {
      const raw = String(source || "").trim();
      if (!raw || seen.has(raw)) return;
      seen.add(raw);
      rows.push({ source: raw, title, meta, treeId });
    };

    add(item?.photo_url, item?.species ? `${item.species} tree evidence` : "Verified tree evidence", item?.project_name || item?.location_text || null, item?.tree_id);
    (item?.photo_urls || []).forEach((source, index) => {
      add(source, index === 0 ? "Primary verified tree photo" : `Verified tree photo ${index + 1}`, item?.project_name || null, item?.tree_id);
    });
    (item?.timeline || []).forEach((event) => {
      const title = `${toTitle(event.task_type || "Field update")} evidence`;
      const meta = formatDateTime(event.reviewed_at || event.completed_at || event.submitted_at);
      add(event.photo_url, title, meta, item?.tree_id);
      (event.photo_urls || []).forEach((source) => add(source, title, meta, item?.tree_id));
    });
    return rows;
  }, [item]);

  const shareMessage = useMemo(() => {
    if (!item) return "";
    const species = item.species || "tree";
    const projectName = item.project_name || "LandCheck Green project";
    const link = publicStoryUrl || certificateUrl;
    const dedicationBits = [item.dedication_type ? toTitle(item.dedication_type) : "", item.dedication_name || ""].filter(Boolean);
    const dedicationText = dedicationBits.length ? ` This sponsorship is dedicated to ${dedicationBits.join(" - ")}.` : "";
    return [
      `I'm supporting verified tree restoration through LandCheck Green.`,
      `My sponsored ${species.toLowerCase()} tree in ${projectName} is mapped, photo-verified, and cared for by field teams.${dedicationText}`,
      `Follow its live story here: ${link}`,
      `#LandCheckGreen #ClimateAction #TreeSponsorship`,
    ].join(" ");
  }, [certificateUrl, item, publicStoryUrl]);

  const handleShareImpact = useCallback(async () => {
    if (!shareMessage) return;
    await Share.share({
      title: "My LandCheck Green tree",
      message: shareMessage,
      url: publicStoryUrl || certificateUrl || undefined,
    });
  }, [certificateUrl, publicStoryUrl, shareMessage]);

  if (!session) return null;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void loadDetail()} contentContainerStyle={styles.scrollContent}>
      {/* Header background and greeting */}
      <View style={styles.headerContainer}>
        <ExpoImage source={sponsorHeroBackground} contentFit="cover" style={styles.headerBgImage} />
        
        {/* Soft gradient fade overlay */}
        <LinearGradient
          colors={["#f9fcf9", "rgba(249, 252, 249, 0.88)", "rgba(249, 252, 249, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        
        <View style={styles.topRow}>
          <View style={styles.brandMarkContainer}>
            <BrandMark size={48} />
          </View>
          <SponsorIdentityAvatar sponsorId={session.user.id} displayName={session.user.full_name} photoUri={session.user.profile_photo_url} size={48} />
        </View>

        <View style={styles.greetingSection}>
          <View style={styles.greetingBadge}>
            <Ionicons name={greetingIcon} size={13} color="#a6813c" />
            <Text style={styles.greetingBadgeText}>Climate Contributor</Text>
          </View>
          <Text style={styles.greetingTitle}>
            {item?.project_tree_no ? `Tree ${item.project_tree_no}` : item?.unit_uid || "Sponsored Tree"}
          </Text>
          <Text style={styles.greetingSubtitle}>
            {item?.project_name || "LandCheck Green project"}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statsPill}>
            <Ionicons name="leaf-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{item?.species || "Tree"}</Text>
          </View>
          <View style={styles.statsPill}>
            <Ionicons name="git-network-outline" size={13} color={colors.primaryDark} />
            <Text style={styles.statsPillText}>{toTitle(item?.sponsorship_status || "pending")}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodyContent}>

      <View style={styles.storyBanner}>
        <ExpoImage source={sponsorHeroBackground} style={styles.storyBackdrop} contentFit="cover" />
        <View style={styles.storyOverlay}>
          <View style={styles.storyChipRow}>
            <View style={styles.storyChip}>
              <Ionicons name="sparkles-outline" size={14} color={colors.primaryDark} />
              <Text style={styles.storyChipText}>Verified sponsor record</Text>
            </View>
            <View style={styles.storyChip}>
              <Ionicons name="share-social-outline" size={14} color={colors.primaryDark} />
              <Text style={styles.storyChipText}>Share-ready impact page</Text>
            </View>
          </View>
          <Text style={styles.bannerTitle}>This tree has a premium live record you can view, verify, and share.</Text>
          <Text style={styles.bannerBody}>
            Follow the verified map point, approved field photos, maintenance history, digital certificate, and climate evidence connected to this sponsorship.
          </Text>
          <View style={styles.storyProofRow}>
            <View style={styles.storyProofChip}>
              <Ionicons name="camera-outline" size={13} color={colors.primaryDark} />
              <Text style={styles.storyProofText}>Approved photos</Text>
            </View>
            <View style={styles.storyProofChip}>
              <Ionicons name="map-outline" size={13} color={colors.primaryDark} />
              <Text style={styles.storyProofText}>Verified map</Text>
            </View>
            <View style={styles.storyProofChip}>
              <Ionicons name="document-text-outline" size={13} color={colors.primaryDark} />
              <Text style={styles.storyProofText}>QR certificate</Text>
            </View>
          </View>
        </View>
      </View>

      {error ? (
        <SectionCard title="Tree story" subtitle={undefined}>
          <Text style={styles.error}>{error}</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Climate impact" subtitle="A quick view of what this verified tree is already contributing.">
        <View style={styles.metricRow}>
          <MetricTile label="Current CO2" value={`${Number(item?.carbon?.current_co2_kg || 0).toFixed(2)} kg`} tone="success" />
          <MetricTile label="Annual CO2" value={`${Number(item?.carbon?.annual_co2_kg || 0).toFixed(2)} kg`} />
        </View>
        <View style={styles.metricRow}>
          <MetricTile label="Lifetime projection" value={`${Number(item?.carbon?.lifetime_co2_kg || 0).toFixed(2)} kg`} helper="40-year estimate" />
          <MetricTile label="Tree height" value={item?.tree_height_m ? `${item.tree_height_m} m` : "-"} helper="Latest verified record" />
        </View>
      </SectionCard>

      <SectionCard title="Digital certificate + live verification" subtitle="A premium record you can open, scan, and share to Facebook, Instagram, X, WhatsApp, and more using your phone share sheet.">
        <View style={styles.certificatePanel}>
          <View style={styles.certificatePanelHead}>
            <View style={styles.certificateIconWrap}>
              <Ionicons name="ribbon-outline" size={20} color="#c5a059" />
            </View>
            <View style={styles.certificatePanelText}>
              <Text style={styles.certificateTitle}>Open the formal certificate or share the live tree story.</Text>
              <Text style={styles.certificateBody}>
                The certificate now includes a QR code that opens a public mini site with the tree map, verified images, maintenance history, and directions.
              </Text>
            </View>
          </View>
          <View style={styles.certificateActionGrid}>
            <PrimaryButton label="Open Certificate" onPress={() => void Linking.openURL(certificateUrl + (certificateUrl.includes("?") ? "&" : "?") + "_cb=" + Date.now())} disabled={!certificateUrl} />
            <PrimaryButton label="Find My Tree" onPress={() => void Linking.openURL(mapsUrl)} variant="ghost" disabled={!mapsUrl} />
          </View>
          <View style={styles.shareCard}>
            <View style={styles.shareCardHead}>
              <Ionicons name="megaphone-outline" size={18} color="#c5a059" />
              <Text style={styles.shareCardTitle}>Share your impact story</Text>
            </View>
            <Text style={styles.shareCardBody}>
              Share a beautiful public link so people can see the real tree, verified field updates, and the climate contribution you are supporting.
            </Text>
            <PrimaryButton label="Share My Impact" onPress={() => void handleShareImpact()} variant="secondary" disabled={!shareMessage} />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Verified map location" subtitle="This is the approved field location for the tree linked to your sponsorship.">
        {loading ? (
          <Text style={styles.bodyText}>Loading map...</Text>
        ) : mapTree.length > 0 ? (
          <GreenTreeCaptureMap
            trees={mapTree}
            captureLocation={null}
            interactive={false}
            workflowMode="green"
            showUserLocation={false}
            focusTreeId={mapTree[0]?.id}
            selectedTreeId={mapTree[0]?.id}
            mapHeight={268}
            overlayTitle={item?.species || "Sponsored tree"}
            overlaySubtitle={item?.location_text || item?.project_name || "Verified field location"}
          />
        ) : (
          <Text style={styles.bodyText}>The field team has not attached map coordinates yet.</Text>
        )}
        <Text style={styles.coordText}>
          Latitude: {formatCoordinate(item?.lat)} | Longitude: {formatCoordinate(item?.lng)}
        </Text>
      </SectionCard>

      <SectionCard title="Photo evidence" subtitle="Approved field photos from the original planting and later maintenance visits.">
        {galleryItems.length === 0 ? (
          <Text style={styles.bodyText}>No approved photo is available yet.</Text>
        ) : (
          <View style={styles.photoList}>
            {galleryItems.slice(0, 8).map((photo, index) => (
              <EvidencePhotoCard key={`sponsor-photo-${index}-${photo.source}`} source={photo.source} title={photo.title} meta={photo.meta} treeId={photo.treeId} />
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Tree profile" subtitle="Verified profile details and sponsor context for this tree.">
        <View style={styles.profileGrid}>
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Species</Text>
            <Text style={styles.profileValue}>{item?.species || "-"}</Text>
          </View>
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Planting date</Text>
            <Text style={styles.profileValue}>{formatDate(item?.planting_date)}</Text>
          </View>
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Tree status</Text>
            <Text style={styles.profileValue}>{toTitle(item?.tree_status || item?.sponsorship_status || "pending")}</Text>
          </View>
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Project location</Text>
            <Text style={styles.profileValue}>{item?.location_text || "-"}</Text>
          </View>
          {item?.dedication_name || item?.dedication_message ? (
            <View style={[styles.profileCard, styles.profileCardWide]}>
              <Text style={styles.profileLabel}>Dedication</Text>
              <Text style={styles.profileValue}>
                {[item?.dedication_type ? toTitle(item.dedication_type) : null, item?.dedication_name, item?.dedication_message].filter(Boolean).join(" | ")}
              </Text>
            </View>
          ) : null}
          {item?.tree_notes ? (
            <View style={[styles.profileCard, styles.profileCardWide]}>
              <Text style={styles.profileLabel}>Field note</Text>
              <Text style={styles.profileValue}>{item.tree_notes}</Text>
            </View>
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title="Care timeline" subtitle="Every update below has already passed review before reaching your sponsor view.">
        {item?.timeline?.length ? (
          <View style={styles.timeline}>
            {item.timeline.map((event) => (
              <View key={`timeline-${event.id}`} style={styles.timelineCard}>
                <View style={styles.timelineHead}>
                  <View style={styles.timelineTitleWrap}>
                    <View style={styles.timelineDot} />
                    <Text style={styles.timelineTitle}>{toTitle(event.task_type || "visit")}</Text>
                  </View>
                  <StatusChip label={toTitle(event.reported_tree_status || event.status || "done")} tone={toneForTree(event.reported_tree_status || event.status)} />
                </View>
                <Text style={styles.timelineMeta}>{formatDateTime(event.reviewed_at || event.completed_at || event.submitted_at)}</Text>
                {event.notes ? <Text style={styles.bodyText}>{event.notes}</Text> : null}
                {event.review_notes ? <Text style={styles.timelineMeta}>Team note: {event.review_notes}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>No verified planting or maintenance updates have been posted yet.</Text>
        )}
      </SectionCard>
      </View>
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  bodyContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
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
  heroBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  storyBanner: {
    minHeight: 288,
    borderRadius: radii.xl,
    overflow: "hidden",
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
  storyBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -80,
    width: "100%",
    height: "150%",
    opacity: 0.08,
  },
  storyOverlay: {
    flex: 1,
    padding: spacing.md,
    gap: 14,
    justifyContent: "space-between",
  },
  storyChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  storyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#f6f9f7",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.16)",
  },
  storyChipText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  bannerTitle: {
    color: "#0c2b1a",
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.7,
    maxWidth: 300,
  },
  bannerBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 320,
  },
  storyProofRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  storyProofChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: "#f6f9f7",
    borderWidth: 1,
    borderColor: "rgba(22, 103, 58, 0.14)",
  },
  storyProofText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  certificatePanel: {
    gap: spacing.md,
  },
  certificatePanelHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  certificateIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(197, 160, 89, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  certificatePanelText: {
    flex: 1,
    gap: 6,
  },
  certificateTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
  },
  certificateBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  certificateActionGrid: {
    gap: spacing.sm,
  },
  shareCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(197, 160, 89, 0.3)",
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  shareCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shareCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  shareCardBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  photoList: {
    gap: spacing.sm,
  },
  photoCard: {
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "#c5a059",
    backgroundColor: "#ffffff",
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  photo: {
    width: "100%",
    height: 230,
    backgroundColor: colors.panelSoft,
  },
  photoPlaceholder: {
    width: "100%",
    height: 230,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  photoPlaceholderText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  photoMetaPanel: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 4,
  },
  photoMetaTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  photoMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  profileCard: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(197, 160, 89, 0.3)",
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  profileCardWide: {
    flexBasis: "100%",
  },
  profileLabel: {
    color: "#c5a059",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  profileValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  bodyText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  coordText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  timeline: {
    gap: spacing.sm,
  },
  timelineCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "#c5a059",
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  timelineHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  timelineTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#c5a059",
  },
  timelineTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  timelineMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
