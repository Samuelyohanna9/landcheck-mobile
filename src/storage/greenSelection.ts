import AsyncStorage from "@react-native-async-storage/async-storage";

const selectionKey = (userId: number) => `green:selected-project:${Math.max(0, Number(userId || 0))}`;

export const readStoredGreenSelectedProjectId = async (userId: number) => {
  const key = selectionKey(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = Number(raw || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

export const writeStoredGreenSelectedProjectId = async (userId: number, projectId: number | null) => {
  const key = selectionKey(userId);
  if (!projectId || projectId <= 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, String(Math.trunc(projectId)));
};
