import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { SvgUri, SvgXml } from "react-native-svg";
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

const BRAND_CACHE_DIR = `${FileSystemLegacy.cacheDirectory || FileSystemLegacy.documentDirectory || ""}green-brand-cache/`;
const BRAND_CACHE_VERSION = "v2";

const hashText = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
};

const guessLogoExtension = (uri: string, fallbackSvg = false) => {
  const normalized = String(uri || "").trim();
  if (fallbackSvg || /\.svg($|[?#])/i.test(normalized) || /^data:image\/svg\+xml/i.test(normalized)) return ".svg";
  if (/\.png($|[?#])/i.test(normalized)) return ".png";
  if (/\.webp($|[?#])/i.test(normalized)) return ".webp";
  if (/\.gif($|[?#])/i.test(normalized)) return ".gif";
  return ".jpg";
};

const guessLogoExtensionFromContentType = (contentType?: string | null, uri?: string, fallbackSvg = false) => {
  const normalizedType = String(contentType || "").trim().toLowerCase();
  if (normalizedType.includes("svg")) return ".svg";
  if (normalizedType.includes("png")) return ".png";
  if (normalizedType.includes("webp")) return ".webp";
  if (normalizedType.includes("gif")) return ".gif";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return ".jpg";
  return guessLogoExtension(String(uri || ""), fallbackSvg);
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
  const [cachedLogoUri, setCachedLogoUri] = useState("");
  const [cachedSvgXml, setCachedSvgXml] = useState("");

  useEffect(() => {
    setCandidateIndex(0);
    setAttemptIndex(0);
    setCachedLogoUri("");
    setCachedSvgXml("");
  }, [logoUrl]);

  const resolvedCandidates = useMemo(() => resolveGreenAssetCandidates(logoUrl), [logoUrl]);
  const resolvedLogoUrl = resolvedCandidates[candidateIndex] || "";
  const fallbackText = useMemo(() => formatFallbackLabel(fallbackLabel), [fallbackLabel]);
  const activeIsSvgSource = useMemo(() => {
    const raw = String(logoUrl || "").trim();
    const active = String(resolvedLogoUrl || "").trim();
    const cached = String(cachedLogoUri || "").trim();
    return (
      /^data:image\/svg\+xml/i.test(raw) ||
      /\.svg($|[?#])/i.test(raw) ||
      /\.svg($|[?#])/i.test(active) ||
      /\.svg($|[?#])/i.test(cached)
    );
  }, [cachedLogoUri, logoUrl, resolvedLogoUrl]);
  const renderMode = useMemo<"svg" | "image">(() => {
    if (activeIsSvgSource) return attemptIndex === 0 ? "svg" : "image";
    return attemptIndex === 0 ? "image" : "svg";
  }, [activeIsSvgSource, attemptIndex]);
  const displayLogoUri = cachedLogoUri || resolvedLogoUrl;
  const displayLogoIsRemote = /^https?:\/\//i.test(String(displayLogoUri || "").trim());

  useEffect(() => {
    let active = true;
    const cacheRemoteLogo = async () => {
      const remoteUri = String(resolvedLogoUrl || "").trim();
      if (!/^https?:\/\//i.test(remoteUri)) return;
      const baseDir = BRAND_CACHE_DIR;
      if (!baseDir) return;
      try {
        const dirInfo = await FileSystemLegacy.getInfoAsync(baseDir);
        if (!dirInfo.exists) {
          await FileSystemLegacy.makeDirectoryAsync(baseDir, { intermediates: true });
        }
        const hash = hashText(`${BRAND_CACHE_VERSION}:${remoteUri}`);
        const cachedCandidates = [
          `${baseDir}${hash}.svg`,
          `${baseDir}${hash}.png`,
          `${baseDir}${hash}.webp`,
          `${baseDir}${hash}.gif`,
          `${baseDir}${hash}.jpg`,
        ];
        for (const candidate of cachedCandidates) {
          const existing = await FileSystemLegacy.getInfoAsync(candidate);
          if (existing.exists) {
            if (/\.svg$/i.test(candidate)) {
              try {
                const xml = await FileSystemLegacy.readAsStringAsync(candidate);
                if (active) setCachedSvgXml(xml);
              } catch {
                if (active) setCachedSvgXml("");
              }
            } else if (active) {
              setCachedSvgXml("");
            }
            if (active) setCachedLogoUri(candidate);
            return;
          }
        }
        const tempUri = `${baseDir}${hash}.tmp`;
        const download = await FileSystemLegacy.downloadAsync(remoteUri, tempUri);
        const contentType =
          String(download.mimeType || "").trim() ||
          String(download.headers?.["content-type"] || download.headers?.["Content-Type"] || "").trim();
        const extension = guessLogoExtensionFromContentType(contentType, remoteUri, activeIsSvgSource);
        const targetUri = `${baseDir}${hash}${extension}`;
        const existing = await FileSystemLegacy.getInfoAsync(targetUri);
        if (!existing.exists) {
          if (tempUri === targetUri) {
            // No move needed.
          } else {
            await FileSystemLegacy.moveAsync({ from: tempUri, to: targetUri });
          }
        } else {
          await FileSystemLegacy.deleteAsync(tempUri, { idempotent: true });
        }
        if (extension === ".svg") {
          try {
            const xml = await FileSystemLegacy.readAsStringAsync(targetUri);
            if (active) setCachedSvgXml(xml);
          } catch {
            if (active) setCachedSvgXml("");
          }
        } else if (active) {
          setCachedSvgXml("");
        }
        if (active) setCachedLogoUri(targetUri);
      } catch {
        if (active) {
          setCachedLogoUri("");
          setCachedSvgXml("");
        }
      }
    };
    void cacheRemoteLogo();
    return () => {
      active = false;
    };
  }, [activeIsSvgSource, resolvedLogoUrl]);

  if (!resolvedLogoUrl && !fallbackToDefault && !fallbackText) return null;

  const source = displayLogoUri ? { uri: displayLogoUri } : require("../../assets/green-logo-cropped-760.png");
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
      {cachedSvgXml ? (
        <SvgXml
          xml={cachedSvgXml}
          width={size * imageScale}
          height={size * imageScale}
          onError={handleAssetError}
        />
      ) : displayLogoUri && renderMode === "svg" ? (
        <SvgUri
          uri={displayLogoUri}
          width={size * imageScale}
          height={size * imageScale}
          onError={handleAssetError}
        />
      ) : (displayLogoUri && !displayLogoIsRemote) || fallbackToDefault ? (
        <Image
          source={source}
          style={[
            {
              width: size * imageScale,
              height: size * imageScale,
            },
            variant === "partner" ? { borderRadius: Math.max(8, size * 0.18) } : null,
          ]}
          contentFit="contain"
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
