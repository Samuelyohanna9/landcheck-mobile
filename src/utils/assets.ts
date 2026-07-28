import * as FileSystemLegacy from "expo-file-system/legacy";
import { API_URL } from "../config/env";
import { api } from "../api/client";

const R2_BUCKET_HINT = "photosgreen";
const LOCAL_ASSET_URI_RE = /^(data:|file:|content:|asset:|ph:|blob:)/i;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeObjectKey = (value: string) => {
  let key = String(value || "").trim().replace(/^\/+/, "");
  if (!key) return "";

  for (let i = 0; i < 3; i += 1) {
    const decoded = safeDecode(key);
    if (decoded === key) break;
    key = decoded;
  }

  if (key.startsWith(`${R2_BUCKET_HINT}/`)) {
    key = key.slice(R2_BUCKET_HINT.length + 1);
  }

  return key;
};

const encodeObjectKeyForProxy = (value: string) =>
  normalizeObjectKey(value)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(safeDecode(part)))
    .join("/");

const toUploadsObjectProxy = (value: string) => {
  const encoded = encodeObjectKeyForProxy(value);
  return encoded ? `${API_URL}/green/uploads/object/${encoded}` : "";
};

const ASSET_CACHE_DIR = `${FileSystemLegacy.documentDirectory || FileSystemLegacy.cacheDirectory || ""}green-asset-cache/`;
const ASSET_CACHE_VERSION = "v1";

const hashText = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
};

const guessAssetExtension = (uri: string) => {
  const normalized = String(uri || "").trim();
  if (/\.png($|[?#])/i.test(normalized)) return ".png";
  if (/\.webp($|[?#])/i.test(normalized)) return ".webp";
  if (/\.gif($|[?#])/i.test(normalized)) return ".gif";
  if (/\.bmp($|[?#])/i.test(normalized)) return ".bmp";
  return ".jpg";
};

const guessAssetExtensionFromContentType = (contentType?: string | null, uri?: string) => {
  const normalizedType = String(contentType || "").trim().toLowerCase();
  if (normalizedType.includes("png")) return ".png";
  if (normalizedType.includes("webp")) return ".webp";
  if (normalizedType.includes("gif")) return ".gif";
  if (normalizedType.includes("bmp")) return ".bmp";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return ".jpg";
  return guessAssetExtension(String(uri || ""));
};

const arrayBufferToBase64 = (value: ArrayBuffer) => {
  const bytes = new Uint8Array(value);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : "=";
    output += i + 2 < bytes.length ? alphabet[triple & 0x3f] : "=";
  }
  return output;
};

const fetchGreenAssetBytes = async (remoteUri: string) => {
  const response = await api.get<ArrayBuffer>(remoteUri, {
    responseType: "arraybuffer",
    timeout: 45000,
    headers: { Accept: "image/*" },
  });
  const contentType =
    String(response.headers?.["content-type"] || response.headers?.["Content-Type"] || "").trim() ||
    "application/octet-stream";
  const normalizedType = contentType.toLowerCase();
  if (normalizedType && !normalizedType.startsWith("image/") && normalizedType !== "application/octet-stream") {
    throw new Error(`Unsupported asset response: ${contentType}`);
  }
  return {
    contentType,
    payload: response.data,
  };
};

export const resolveGreenAssetCandidates = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  if (LOCAL_ASSET_URI_RE.test(raw)) return [raw];
  if (!/^https?:\/\//i.test(raw)) {
    const rawPath = raw.replace(/^\/+/, "");
    if (/^green\//i.test(rawPath) && !/^green\/uploads\/object\//i.test(rawPath)) {
      return [`${API_URL}/${rawPath}`];
    }
    if (/^green\/uploads\/object\//i.test(rawPath)) {
      return [`${API_URL}/${rawPath}`];
    }
    const proxyUrl = toUploadsObjectProxy(raw);
    const directUrl = `${API_URL}/${rawPath}`;
    return Array.from(new Set([proxyUrl, directUrl].filter(Boolean)));
  }

  if (raw.includes("/green/uploads/object/")) return [raw];

  const candidates: string[] = [];
  try {
    const parsed = new URL(raw);
    const apiOrigin = new URL(API_URL).origin;
    const rawOrigin = parsed.origin;
    if (rawOrigin === apiOrigin && /^\/green\//i.test(parsed.pathname) && !/\/green\/uploads\/object\//i.test(parsed.pathname)) {
      candidates.push(raw);
      return Array.from(new Set(candidates.filter(Boolean)));
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length) {
      const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
      const key = (maybeBucket ? parts.slice(1) : parts).join("/");
      const proxyUrl = toUploadsObjectProxy(key);
      if (proxyUrl) candidates.push(proxyUrl);
    }

    if (rawOrigin !== apiOrigin) {
      candidates.push(`${API_URL}/green/organizations/logo-proxy?url=${encodeURIComponent(raw)}`);
    }
    candidates.push(raw);
  } catch {
    candidates.push(`${API_URL}/green/organizations/logo-proxy?url=${encodeURIComponent(raw)}`);
    candidates.push(raw);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
};

export const resolveGreenAssetUrl = (value?: string | null) => resolveGreenAssetCandidates(value)[0] || "";

export const appendGreenAssetRenderParams = (
  url: string,
  opts?: {
    w?: number;
    h?: number;
    q?: number;
    fm?: "jpeg" | "jpg" | "png" | "webp";
  },
) => {
  const baseUrl = String(url || "").trim();
  if (!baseUrl) return "";
  if (!/^https?:\/\//i.test(baseUrl)) return baseUrl;
  if (!opts) return baseUrl;
  const params = new URLSearchParams();
  if (Number.isFinite(Number(opts.w)) && Number(opts.w) > 0) params.set("w", String(Math.round(Number(opts.w))));
  if (Number.isFinite(Number(opts.h)) && Number(opts.h) > 0) params.set("h", String(Math.round(Number(opts.h))));
  if (Number.isFinite(Number(opts.q)) && Number(opts.q) > 0) params.set("q", String(Math.round(Number(opts.q))));
  if (opts.fm) params.set("fm", opts.fm);
  const query = params.toString();
  if (!query) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}`;
};

export const cacheGreenAssetLocally = async (uri: string, namespace = "asset") => {
  const remoteUri = String(uri || "").trim();
  if (!remoteUri) return "";
  if (!/^https?:\/\//i.test(remoteUri)) return remoteUri;
  if (!ASSET_CACHE_DIR) return remoteUri;

  const dirInfo = await FileSystemLegacy.getInfoAsync(ASSET_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystemLegacy.makeDirectoryAsync(ASSET_CACHE_DIR, { intermediates: true });
  }

  const hash = hashText(`${ASSET_CACHE_VERSION}:${namespace}:${remoteUri}`);
  const cachedCandidates = [
    `${ASSET_CACHE_DIR}${hash}.png`,
    `${ASSET_CACHE_DIR}${hash}.webp`,
    `${ASSET_CACHE_DIR}${hash}.gif`,
    `${ASSET_CACHE_DIR}${hash}.bmp`,
    `${ASSET_CACHE_DIR}${hash}.jpg`,
  ];

  for (const candidate of cachedCandidates) {
    const existing = await FileSystemLegacy.getInfoAsync(candidate);
    if (existing.exists) return candidate;
  }

  const tempUri = `${ASSET_CACHE_DIR}${hash}.tmp`;

  try {
    const download = await FileSystemLegacy.downloadAsync(remoteUri, tempUri);
    const contentType =
      String(download.mimeType || "").trim() ||
      String(download.headers?.["content-type"] || download.headers?.["Content-Type"] || "").trim();
    const normalizedType = contentType.toLowerCase();
    if (normalizedType && !normalizedType.startsWith("image/") && normalizedType !== "application/octet-stream") {
      await FileSystemLegacy.deleteAsync(tempUri, { idempotent: true });
      throw new Error(`Unsupported asset response: ${contentType}`);
    }

    const extension = guessAssetExtensionFromContentType(contentType, remoteUri);
    const targetUri = `${ASSET_CACHE_DIR}${hash}${extension}`;
    const existing = await FileSystemLegacy.getInfoAsync(targetUri);
    if (!existing.exists) {
      if (tempUri !== targetUri) {
        await FileSystemLegacy.moveAsync({ from: tempUri, to: targetUri });
      }
    } else {
      await FileSystemLegacy.deleteAsync(tempUri, { idempotent: true });
    }
    return targetUri;
  } catch {
    await FileSystemLegacy.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    const { contentType, payload } = await fetchGreenAssetBytes(remoteUri);
    const extension = guessAssetExtensionFromContentType(contentType, remoteUri);
    const targetUri = `${ASSET_CACHE_DIR}${hash}${extension}`;
    const base64 = arrayBufferToBase64(payload);
    await FileSystemLegacy.writeAsStringAsync(targetUri, base64, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
    return targetUri;
  }
};
