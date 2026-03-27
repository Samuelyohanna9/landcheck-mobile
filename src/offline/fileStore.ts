import * as FileSystemLegacy from "expo-file-system/legacy";
import type { DraftPhoto } from "../types/domain";

const MEDIA_DIR = `${FileSystemLegacy.documentDirectory || ""}green-offline-media/`;

const ensureMediaDir = async () => {
  const info = await FileSystemLegacy.getInfoAsync(MEDIA_DIR);
  if (!info.exists) {
    await FileSystemLegacy.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
};

const guessExtension = (photo: DraftPhoto) => {
  const explicitName = String(photo.fileName || "").trim();
  if (explicitName.includes(".")) {
    return explicitName.slice(explicitName.lastIndexOf("."));
  }
  const mime = String(photo.mimeType || "").toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("heic")) return ".heic";
  return ".jpg";
};

export const persistDraftPhoto = async (photo: DraftPhoto): Promise<DraftPhoto> => {
  await ensureMediaDir();
  const extension = guessExtension(photo);
  const nextName = `${Date.now()}-${Math.floor(Math.random() * 1000000)}${extension}`;
  const destinationUri = `${MEDIA_DIR}${nextName}`;
  await FileSystemLegacy.copyAsync({
    from: photo.uri,
    to: destinationUri,
  });
  return {
    uri: destinationUri,
    fileName: photo.fileName || nextName,
    mimeType: photo.mimeType || null,
    fileSize: photo.fileSize || null,
  };
};

export const persistDraftPhotos = async (photos: DraftPhoto[] = []) => {
  const stored: DraftPhoto[] = [];
  for (const photo of photos) {
    stored.push(await persistDraftPhoto(photo));
  }
  return stored;
};

export const deleteStoredPhoto = async (uri?: string | null) => {
  if (!uri) return;
  try {
    await FileSystemLegacy.deleteAsync(uri, { idempotent: true });
  } catch {
    // Ignore cleanup failures.
  }
};
