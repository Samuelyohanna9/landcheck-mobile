export type SponsorAvatarBorderId = "gold" | "emerald";
export type SponsorMapIconId = "pine_cone" | "gold_leaf";

export type SponsorAvatarBorderMeta = {
  id: SponsorAvatarBorderId;
  label: string;
  borderColor: string;
  glowColor: string;
  accentTextColor: string;
  subtitle: string;
};

export type SponsorMapIconMeta = {
  id: SponsorMapIconId;
  label: string;
  iconName: "leaf" | "flower" | "diamond";
  iconColor: string;
  iconSecondaryColor: string;
  backgroundColor: string;
  borderColor: string;
  description: string;
};

export type SponsorMapIconCelebration = {
  title: string;
  message: string;
};

export const SPONSOR_AVATAR_BORDERS: SponsorAvatarBorderMeta[] = [
  {
    id: "gold",
    label: "Golden Canopy Border",
    borderColor: "#d4a63f",
    glowColor: "rgba(212,166,63,0.42)",
    accentTextColor: "#8a6111",
    subtitle: "Warm gold trim for premium supporters.",
  },
  {
    id: "emerald",
    label: "Emerald Shadow Border",
    borderColor: "#0f8b59",
    glowColor: "rgba(15,139,89,0.38)",
    accentTextColor: "#0a5b3d",
    subtitle: "Deep green halo for active restoration leaders.",
  },
];

export const SPONSOR_MAP_ICONS: SponsorMapIconMeta[] = [
  {
    id: "pine_cone",
    label: "3D Pine Icon",
    iconName: "diamond",
    iconColor: "#85532a",
    iconSecondaryColor: "#2f7d32",
    backgroundColor: "#f7efe7",
    borderColor: "#d5b28b",
    description: "A sculpted pine marker to style your sponsored tree presence.",
  },
  {
    id: "gold_leaf",
    label: "Golden Leaf Icon",
    iconName: "leaf",
    iconColor: "#d4a63f",
    iconSecondaryColor: "#fff3b0",
    backgroundColor: "#fff7dd",
    borderColor: "#e6cb73",
    description: "A luminous gold leaf marker for high-visibility climate support.",
  },
];

export const normalizeSponsorAvatarBorder = (value: unknown): SponsorAvatarBorderId | null => {
  const key = String(value || "").trim().toLowerCase();
  if (!key || key === "none" || key === "default" || key === "null") return null;
  if (key.includes("gold")) return "gold";
  if (key.includes("emerald")) return "emerald";
  return null;
};

export const normalizeSponsorMapIcon = (value: unknown): SponsorMapIconId | null => {
  const key = String(value || "").trim().toLowerCase();
  if (!key || key === "none" || key === "default" || key === "null") return null;
  if (key.includes("pine")) return "pine_cone";
  if (key.includes("gold")) return "gold_leaf";
  return null;
};

export const getSponsorAvatarBorderMeta = (value: unknown) => {
  const key = normalizeSponsorAvatarBorder(value);
  return key ? SPONSOR_AVATAR_BORDERS.find((item) => item.id === key) || null : null;
};

export const getSponsorMapIconMeta = (value: unknown) => {
  const key = normalizeSponsorMapIcon(value);
  return key ? SPONSOR_MAP_ICONS.find((item) => item.id === key) || null : null;
};

export const getSponsorMapIconCelebration = (value: unknown): SponsorMapIconCelebration | null => {
  const meta = getSponsorMapIconMeta(value);
  if (!meta) return null;
  if (meta.id === "pine_cone") {
    return {
      title: "3D Pine Icon active",
      message:
        "Your 3D Pine icon is now live across your sponsor journey. It gives your tree story a richer forest feel and highlights that your support is tied to real field planting, care, and verified growth.",
    };
  }
  return {
    title: `${meta.label} active`,
    message: `${meta.description} Your sponsor identity styling is now visible across your premium tree experience.`,
  };
};
