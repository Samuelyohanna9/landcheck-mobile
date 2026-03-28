import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";
import { colors } from "../theme/tokens";
import { resolveGreenAssetCandidates } from "../utils/assets";

type BrandMarkProps = {
  size?: number;
  logoUrl?: string | null;
  fallbackToDefault?: boolean;
  variant?: "default" | "partner";
  fallbackLabel?: string | null;
};

const formatFallbackLabel = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase().slice(0, 2);
  }
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3);
};

export const BrandMark = ({
  size = 58,
  logoUrl,
  fallbackToDefault = true,
  variant = "default",
  fallbackLabel,
}: BrandMarkProps) => {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
    setAttemptIndex(0);
  }, [logoUrl]);

  const resolvedCandidates = useMemo(() => resolveGreenAssetCandidates(logoUrl), [logoUrl]);
  const resolvedLogoUrl = resolvedCandidates[candidateIndex] || "";
  const fallbackText = useMemo(() => formatFallbackLabel(fallbackLabel), [fallbackLabel]);
  const isSvgSource = useMemo(() => {
    const raw = String(logoUrl || "").trim();
    const active = String(resolvedLogoUrl || "").trim();
    return /^data:image\/svg\+xml/i.test(raw) || /\.svg($|[?#])/i.test(raw) || /\.svg($|[?#])/i.test(active);
  }, [logoUrl, resolvedLogoUrl]);
  const renderMode = useMemo<"svg" | "image">(() => {
    if (isSvgSource) return attemptIndex === 0 ? "svg" : "image";
    return attemptIndex === 0 ? "image" : "svg";
  }, [attemptIndex, isSvgSource]);

  if (!resolvedLogoUrl && !fallbackToDefault && !fallbackText) return null;

  const source = resolvedLogoUrl ? { uri: resolvedLogoUrl } : require("../../assets/green-logo-cropped-760.png");
  const imageScale = variant === "partner" ? 0.9 : 0.76;
  const advanceToNextCandidate = () => {
    if (candidateIndex + 1 < resolvedCandidates.length) {
      setCandidateIndex((current) => current + 1);
      setAttemptIndex(0);
      return;
    }
    if (!fallbackToDefault) {
      setCandidateIndex(resolvedCandidates.length);
    }
  };

  const handleAssetError = () => {
    if (!resolvedLogoUrl) {
      if (!fallbackToDefault) {
        setCandidateIndex(resolvedCandidates.length);
      }
      return;
    }
    if (attemptIndex === 0) {
      setAttemptIndex(1);
      return;
    }
    advanceToNextCandidate();
  };

  return (
    <View
      style={[
        styles.wrap,
        variant === "partner" ? styles.wrapPartner : styles.wrapDefault,
        { width: size, height: size, borderRadius: size / 3 },
      ]}
    >
      {resolvedLogoUrl && renderMode === "svg" ? (
        <SvgUri
          uri={resolvedLogoUrl}
          width={size * imageScale}
          height={size * imageScale}
          onError={handleAssetError}
        />
      ) : resolvedLogoUrl || fallbackToDefault ? (
        <Image
          source={source}
          style={[
            {
              width: size * imageScale,
              height: size * imageScale,
            },
            variant === "partner" ? { borderRadius: Math.max(8, size * 0.18) } : null,
          ]}
          resizeMode="contain"
          onError={handleAssetError}
        />
      ) : (
        <Text style={[styles.fallbackLabel, variant === "partner" ? styles.fallbackLabelPartner : styles.fallbackLabelDefault]}>
          {fallbackText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  wrapDefault: {
    backgroundColor: "#ffffff",
  },
  wrapPartner: {
    backgroundColor: "#050505",
  },
  fallbackLabel: {
    fontWeight: "900",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  fallbackLabelDefault: {
    color: colors.primaryDark,
    fontSize: 16,
  },
  fallbackLabelPartner: {
    color: colors.inverseText,
    fontSize: 14,
  },
});
