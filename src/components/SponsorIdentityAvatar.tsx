import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/tokens";
import { resolveGreenAssetUrl } from "../utils/assets";

type SponsorIdentityAvatarProps = {
  sponsorId?: number | null;
  displayName?: string | null;
  photoUri?: string | null;
  size?: number;
  borderColor?: string;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

export const sponsorProfilePhotoStorageKey = (id: number) => `lc_sphoto_${id}`;

const getInitial = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return "S";
  return (text.split(/\s+/)[0] || text).charAt(0).toUpperCase() || "S";
};

export const SponsorIdentityAvatar = ({
  sponsorId,
  displayName,
  photoUri,
  size = 48,
  borderColor = "rgba(18, 92, 45, 0.16)",
  accentColor = colors.primaryDark,
  style,
}: SponsorIdentityAvatarProps) => {
  const { session } = useAuth();
  const [storedPhotoUri, setStoredPhotoUri] = useState("");

  const loadStoredPhoto = useCallback(() => {
    let active = true;
    if (!sponsorId || sponsorId <= 0) {
      setStoredPhotoUri("");
      return () => {
        active = false;
      };
    }
    AsyncStorage.getItem(sponsorProfilePhotoStorageKey(sponsorId))
      .then((value) => {
        if (active) setStoredPhotoUri(String(value || "").trim());
      })
      .catch(() => {
        if (active) setStoredPhotoUri("");
      });
    return () => {
      active = false;
    };
  }, [sponsorId]);

  useEffect(() => {
    return loadStoredPhoto();
  }, [loadStoredPhoto]);

  useFocusEffect(
    useCallback(() => loadStoredPhoto(), [loadStoredPhoto]),
  );

  const resolvedPhotoUri = useMemo(() => {
    const local = String(storedPhotoUri || "").trim();
    if (/^(file|content|ph|assets-library):/i.test(local)) return local;
    const sessionPhoto =
      sponsorId && sponsorId > 0 && sponsorId === session?.user?.id
        ? resolveGreenAssetUrl(session?.user?.profile_photo_url || "")
        : "";
    if (sessionPhoto) return sessionPhoto;
    const explicit = resolveGreenAssetUrl(photoUri || "");
    if (explicit) return explicit;
    if (local) return local;
    const remote = resolveGreenAssetUrl(photoUri || "");
    return remote || "";
  }, [photoUri, session?.user?.id, session?.user?.profile_photo_url, sponsorId, storedPhotoUri]);

  const avatarSize = Math.max(32, size);
  const radius = avatarSize / 2;
  const iconSize = Math.round(avatarSize * 0.34);
  const leafSize = Math.max(10, Math.round(avatarSize * 0.2));
  const initial = getInitial(displayName);

  return (
    <View
      style={[
        styles.shell,
        {
          width: avatarSize,
          height: avatarSize,
          borderRadius: radius,
          borderColor,
          shadowColor: accentColor,
        },
        style,
      ]}
    >
      {resolvedPhotoUri ? (
        <ExpoImage source={{ uri: resolvedPhotoUri }} style={{ width: avatarSize, height: avatarSize, borderRadius: radius }} contentFit="cover" />
      ) : (
        <View style={[styles.fallback, { borderRadius: radius }]}>
          <View style={styles.fallbackGlow} />
          <Ionicons name="person" size={iconSize} color={accentColor} />
          <Text style={[styles.initial, { color: accentColor }]}>{initial}</Text>
          <View style={[styles.leafBadge, { width: leafSize + 8, height: leafSize + 8, borderRadius: (leafSize + 8) / 2 }]}>
            <Ionicons name="leaf" size={leafSize} color="#ffffff" />
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    borderWidth: 2,
    backgroundColor: "#ffffff",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fallback: {
    flex: 1,
    backgroundColor: "#e8f7ec",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  fallbackGlow: {
    position: "absolute",
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  initial: {
    position: "absolute",
    bottom: 7,
    right: 9,
    fontSize: 12,
    fontWeight: "900",
  },
  leafBadge: {
    position: "absolute",
    right: 2,
    top: 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
});
