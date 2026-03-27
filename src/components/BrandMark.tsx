import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";

type BrandMarkProps = {
  size?: number;
  logoUrl?: string | null;
};

export const BrandMark = ({ size = 58, logoUrl }: BrandMarkProps) => {
  const source =
    logoUrl && /^https?:\/\//i.test(logoUrl)
      ? { uri: logoUrl }
      : require("../../assets/green-logo-cropped-760.png");

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 3 }]}>
      <Image source={source} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
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
