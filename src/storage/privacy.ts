import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppMode } from "../types/domain";

const CONSENT_KEY = "landcheck_mobile_privacy_acceptance_v1";

type ConsentMap = Record<string, string>;

const readMap = async (): Promise<ConsentMap> => {
  const raw = await AsyncStorage.getItem(CONSENT_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ConsentMap;
  } catch {
    return {};
  }
};

const buildEntryKey = (mode: AppMode, userId: number) => `${mode}:${userId}`;

export const hasStoredConsent = async (mode: AppMode, userId: number) => {
  const values = await readMap();
  return Boolean(values[buildEntryKey(mode, userId)]);
};

export const saveStoredConsent = async (mode: AppMode, userId: number) => {
  const values = await readMap();
  values[buildEntryKey(mode, userId)] = new Date().toISOString();
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(values));
};

// ── Intro / Onboarding ────────────────────────────────────────

const INTRO_KEY = "landcheck_mobile_intro_seen_v1";

export const hasSeenIntro = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(INTRO_KEY);
  return value === "true";
};

export const markIntroSeen = async (): Promise<void> => {
  await AsyncStorage.setItem(INTRO_KEY, "true");
};
