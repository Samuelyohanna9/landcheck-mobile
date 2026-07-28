import type { ProjectSummary } from "../types/domain";

export type SponsorGreetingIcon = "sunny-outline" | "partly-sunny-outline" | "moon-outline";
export type SponsorChipTone = "online" | "warning" | "neutral" | "offline";

export const getSponsorGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export const getSponsorGreetingIcon = (): SponsorGreetingIcon => {
  const hour = new Date().getHours();
  if (hour < 12) return "sunny-outline";
  if (hour < 18) return "partly-sunny-outline";
  return "moon-outline";
};

export const getSponsorFirstName = (value?: string | null): string => {
  const text = String(value || "").trim();
  if (!text) return "there";
  return text.split(/\s+/)[0] || text;
};

export const getSponsorProjectAvailability = (project?: ProjectSummary | null): {
  label: string;
  note: string;
  tone: SponsorChipTone;
  ready: boolean;
  ctaLabel: string;
} => {
  const ready = Boolean(project?.sponsor_checkout_ready);
  const available = project?.slots_available;
  if (ready) {
    return {
      label: available === null || available === undefined ? "Open now" : `${available} trees open`,
      note:
        String(project?.sponsor_launch_note || "").trim() ||
        "Reserve trees now and receive verified planting updates, photos, maps, and climate impact evidence.",
      tone: "online",
      ready: true,
      ctaLabel: "Sponsor this project",
    };
  }
  return {
    label: "Preparing launch",
    note:
      String(project?.sponsor_launch_note || "").trim() ||
      "This project is being prepared for sponsorship. It will open to supporters as soon as the final details are ready.",
    tone: "warning",
    ready: false,
    ctaLabel: "Project details",
  };
};

