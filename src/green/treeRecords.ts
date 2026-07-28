import type { TreeSummary } from "../types/domain";

export const isHiddenSupportPlaceholderTree = (tree?: Pick<TreeSummary, "record_profile_data"> | null) => {
  const profile = tree?.record_profile_data;
  if (!profile || typeof profile !== "object") return false;
  if (profile.hidden_from_records === true) return true;
  if (profile.support_placeholder === true) return true;
  return ["support_visit_before_plot_capture", "field_capture_before_plot_capture"].includes(
    String(profile.placeholder_reason || "").trim().toLowerCase(),
  );
};

export const filterVisibleTreeRecords = <T extends Pick<TreeSummary, "record_profile_data">>(trees: T[]) =>
  trees.filter((tree) => !isHiddenSupportPlaceholderTree(tree));
