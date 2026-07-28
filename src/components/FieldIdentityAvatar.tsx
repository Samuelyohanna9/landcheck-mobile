import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { updateGreenUserProfilePhoto, uploadGreenPhoto } from "../api/green";
import { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/tokens";
import { resolveGreenAssetUrl } from "../utils/assets";
import type { DraftPhoto } from "../types/domain";

type FieldIdentityAvatarProps = {
  userId?: number | null;
  displayName?: string | null;
  photoUri?: string | null;
  size?: number;
  editable?: boolean;
  borderColor?: string;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

export const fieldProfilePhotoStorageKey = (id: number) => `lc_fphoto_${id}`;

const isLocalPhotoUri = (value?: string | null) => /^(file|content|ph|assets-library):/i.test(String(value || "").trim());

const getInitial = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return "U";
  return (text.split(/\s+/)[0] || text).charAt(0).toUpperCase() || "U";
};

export const FieldIdentityAvatar = ({
  userId,
  displayName,
  photoUri,
  size = 46,
  editable = true,
  borderColor = "rgba(255,255,255,0.22)",
  accentColor = colors.primaryDark,
  style,
}: FieldIdentityAvatarProps) => {
  const { session, updateSessionUser } = useAuth();
  const currentUserId = Number(session?.user?.id || 0);
  const resolvedUserId = Number(userId || currentUserId || 0);
  const isCurrentUser = resolvedUserId > 0 && resolvedUserId === currentUserId;
  const canEdit = editable && isCurrentUser && session?.auth_mode !== "sponsor_user" && currentUserId > 0;
  const [storedPhotoUri, setStoredPhotoUri] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadStoredPhoto = useCallback(() => {
    let active = true;
    if (resolvedUserId <= 0) {
      setStoredPhotoUri("");
      return () => {
        active = false;
      };
    }
    AsyncStorage.getItem(fieldProfilePhotoStorageKey(resolvedUserId))
      .then((value) => {
        if (active) setStoredPhotoUri(String(value || "").trim());
      })
      .catch(() => {
        if (active) setStoredPhotoUri("");
      });
    return () => {
      active = false;
    };
  }, [resolvedUserId]);

  useEffect(() => loadStoredPhoto(), [loadStoredPhoto]);

  useFocusEffect(
    useCallback(() => loadStoredPhoto(), [loadStoredPhoto]),
  );

  const resolvedPhotoUri = useMemo(() => {
    const local = String(storedPhotoUri || "").trim();
    if (isLocalPhotoUri(local)) return local;
    const sessionPhoto = isCurrentUser ? resolveGreenAssetUrl(session?.user?.profile_photo_url || "") : "";
    if (sessionPhoto) return sessionPhoto;
    const explicit = resolveGreenAssetUrl(photoUri || "");
    if (explicit) return explicit;
    if (local) return local;
    return "";
  }, [isCurrentUser, photoUri, session?.user?.profile_photo_url, storedPhotoUri]);

  const handlePickPhoto = useCallback(async () => {
    if (!canEdit || !session) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow access to your photo library to set a profile photo.");
      return;
    }
    setUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const localUri = asset.uri;
      setStoredPhotoUri(localUri);
      await AsyncStorage.setItem(fieldProfilePhotoStorageKey(currentUserId), localUri);
      const photo: DraftPhoto = {
        uri: localUri,
        fileName: asset.fileName || `field-profile-${currentUserId}-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        fileSize: asset.fileSize,
      };
      const uploadedUrl = await uploadGreenPhoto({ photo, folder: "field-profiles" });
      if (!uploadedUrl) {
        throw new Error("Profile photo upload did not return a file URL.");
      }
      await updateGreenUserProfilePhoto(session, uploadedUrl);
      await updateSessionUser({ profile_photo_url: uploadedUrl });
      Alert.alert("Profile photo updated", "Your field profile photo now appears across the app.");
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Could not update your profile photo."));
    } finally {
      setUploading(false);
    }
  }, [canEdit, currentUserId, session, updateSessionUser]);

  const avatarSize = Math.max(34, size);
  const radius = avatarSize / 2;
  const iconSize = Math.round(avatarSize * 0.34);
  const initial = getInitial(displayName || session?.user?.full_name);
  const shellStyles: StyleProp<ViewStyle> = [
    styles.shell,
    {
      width: avatarSize,
      height: avatarSize,
      borderRadius: radius,
      borderColor,
      shadowColor: accentColor,
    },
    style,
  ];

  const content = (
    <View style={shellStyles}>
      {resolvedPhotoUri ? (
        <ExpoImage source={{ uri: resolvedPhotoUri }} style={{ width: avatarSize, height: avatarSize, borderRadius: radius }} contentFit="cover" />
      ) : (
        <View style={[styles.fallback, { borderRadius: radius }]}>
          <Ionicons name="person-outline" size={iconSize} color={accentColor} />
          <Text style={[styles.initial, { color: accentColor }]}>{initial}</Text>
        </View>
      )}
      {canEdit ? (
        <View style={styles.cameraBadge}>
          {uploading ? <ActivityIndicator size={10} color="#ffffff" /> : <Ionicons name="camera" size={11} color="#ffffff" />}
        </View>
      ) : null}
    </View>
  );

  if (!canEdit) return content;

  return <Pressable onPress={() => void handlePickPhoto()}>{content}</Pressable>;
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
  initial: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 11,
    fontWeight: "900",
  },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
});
