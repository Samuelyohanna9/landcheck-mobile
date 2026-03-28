import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";
import { resolveGreenAssetUrl } from "../utils/assets";

type BrandMarkProps = {
  size?: number;
  logoUrl?: string | null;
  fallbackToDefault?: boolean;
};

export const BrandMark = ({ size = 58, logoUrl, fallbackToDefault = true }: BrandMarkProps) => {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [logoUrl]);

  const resolvedLogoUrl = useMemo(() => {
    if (loadFailed) return "";
    return resolveGreenAssetUrl(logoUrl);
  }, [loadFailed, logoUrl]);

  if (!resolvedLogoUrl && !fallbackToDefault) return null;

  const source = resolvedLogoUrl ? { uri: resolvedLogoUrl } : require("../../assets/green-logo-cropped-760.png");

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 3 }]}>
      <Image
        source={source}
        style={{ width: size * 0.76, height: size * 0.76 }}
        resizeMode="contain"
        onError={() => setLoadFailed(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
