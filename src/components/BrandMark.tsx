import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";
import { resolveGreenAssetCandidates } from "../utils/assets";

type BrandMarkProps = {
  size?: number;
  logoUrl?: string | null;
  fallbackToDefault?: boolean;
  variant?: "default" | "partner";
};

export const BrandMark = ({ size = 58, logoUrl, fallbackToDefault = true, variant = "default" }: BrandMarkProps) => {
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [logoUrl]);

  const resolvedCandidates = useMemo(() => resolveGreenAssetCandidates(logoUrl), [logoUrl]);
  const resolvedLogoUrl = resolvedCandidates[candidateIndex] || "";

  if (!resolvedLogoUrl && !fallbackToDefault) return null;

  const source = resolvedLogoUrl ? { uri: resolvedLogoUrl } : require("../../assets/green-logo-cropped-760.png");
  const imageScale = variant === "partner" ? 0.9 : 0.76;

  return (
    <View
      style={[
        styles.wrap,
        variant === "partner" ? styles.wrapPartner : styles.wrapDefault,
        { width: size, height: size, borderRadius: size / 3 },
      ]}
    >
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
        onError={() => {
          if (candidateIndex + 1 < resolvedCandidates.length) {
            setCandidateIndex((current) => current + 1);
            return;
          }
          if (!fallbackToDefault) {
            setCandidateIndex(resolvedCandidates.length);
          }
        }}
      />
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
});
