import { API_URL } from "../config/env";

const R2_BUCKET_HINT = "photosgreen";

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

export const resolveGreenAssetCandidates = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  if (/^data:/i.test(raw)) return [raw];
  if (!/^https?:\/\//i.test(raw)) {
    const rawPath = raw.replace(/^\/+/, "");
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
    const parts = parsed.pathname.split("/").filter(Boolean);
    candidates.push(raw);
    if (parts.length) {
      const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
      const key = (maybeBucket ? parts.slice(1) : parts).join("/");
      const proxyUrl = toUploadsObjectProxy(key);
      if (proxyUrl) candidates.push(proxyUrl);
    }

    const apiOrigin = new URL(API_URL).origin;
    const rawOrigin = parsed.origin;
    if (rawOrigin !== apiOrigin) {
      candidates.push(`${API_URL}/green/organizations/logo-proxy?url=${encodeURIComponent(raw)}`);
    }
  } catch {
    candidates.push(raw);
    candidates.push(`${API_URL}/green/organizations/logo-proxy?url=${encodeURIComponent(raw)}`);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
};

export const resolveGreenAssetUrl = (value?: string | null) => resolveGreenAssetCandidates(value)[0] || "";
