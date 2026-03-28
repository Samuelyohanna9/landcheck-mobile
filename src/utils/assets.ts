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
  let key = String(value || "").trim();
  if (!key) return "";
  key = key.replace(/^https?:\/\/[^/]+/i, "");
  key = key.replace(/^\/+/, "");
  key = key.replace(/^green\/uploads\/object\/+/i, "");
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

export const resolveGreenAssetUrl = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return raw;
  if (raw.includes("/green/uploads/object/")) {
    return raw.startsWith("http") ? raw : `${API_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
  }

  const toProxy = (key: string) => {
    const encoded = encodeObjectKeyForProxy(key);
    return encoded ? `${API_URL}/green/uploads/object/${encoded}` : "";
  };

  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith("/")) return `${API_URL}${raw}`;
    return toProxy(raw) || raw;
  }

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return raw;
    const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
    const key = (maybeBucket ? parts.slice(1) : parts).join("/");
    return toProxy(key) || raw;
  } catch {
    return raw;
  }
};
