export const normalizeName = (value?: string | null) => String(value || "").trim().toLowerCase();

export const normalizeTaskState = (value?: string | null) =>
  normalizeName(value).replaceAll("-", "_").replaceAll(" ", "_");

export const normalizeTreeStatus = (value?: string | null) => normalizeTaskState(value);

export const formatTreeConditionLabel = (value?: string | null) =>
  normalizeTreeStatus(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Healthy";

export const HEALTHY_TREE_STATUSES = new Set(["alive", "healthy"]);
export const DEAD_TREE_STATUSES = new Set(["dead", "removed"]);
export const ATTENTION_TREE_STATUSES = new Set([
  "needs_attention",
  "pest",
  "disease",
  "need_replacement",
  "damaged",
  "need_watering",
  "need_protection",
]);

export const INSPECTION_STATUS_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "damaged", label: "Damaged" },
  { value: "removed", label: "Removed" },
  { value: "need_watering", label: "Need watering" },
  { value: "need_protection", label: "Need protection" },
];

export const TASK_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
  { value: "overdue", label: "Overdue" },
];

export const PLANTING_TASK_TYPES = new Set(["planting", "existing_inventory_intake"]);

export const EXISTING_TREE_STATUS_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "alive", label: "Alive" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "damaged", label: "Damaged" },
  { value: "removed", label: "Removed" },
  { value: "need_watering", label: "Need watering" },
  { value: "need_protection", label: "Need protection" },
];

export const NEW_TREE_STATUS_OPTIONS = [
  { value: "alive", label: "Alive" },
  { value: "pending_planting", label: "Pending planting" },
];

export const TREE_RECORD_STATUS_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "alive", label: "Alive" },
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "damaged", label: "Damaged" },
  { value: "removed", label: "Removed" },
  { value: "need_watering", label: "Need watering" },
  { value: "need_protection", label: "Need protection" },
  { value: "pending_planting", label: "Pending planting" },
];

export const TREE_RECORD_ACTION_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "need_replacement", label: "Need replacement" },
  { value: "damaged", label: "Damaged" },
  { value: "removed", label: "Removed" },
];

export const isLegacyDoneWithoutReview = (task: { status?: string | null; review_state?: string | null }) => {
  const status = normalizeTaskState(task?.status);
  const review = normalizeTaskState(task?.review_state || "none");
  return (status === "done" || status === "completed" || status === "closed") && review === "none";
};

export const isTaskApproved = (task: { review_state?: string | null; status?: string | null }) =>
  normalizeTaskState(task?.review_state) === "approved" || isLegacyDoneWithoutReview(task);

export const isTaskSubmitted = (task: { review_state?: string | null }) =>
  normalizeTaskState(task?.review_state) === "submitted";

export const isTaskMetadataEditRequested = (task: { review_state?: string | null }) =>
  normalizeTaskState(task?.review_state) === "metadata_edit";

export const isTaskRejected = (task: { review_state?: string | null }) =>
  normalizeTaskState(task?.review_state) === "rejected";

export const isTaskLockedForField = (task: { review_state?: string | null; status?: string | null }) =>
  isTaskApproved(task) || isTaskSubmitted(task);

export const isTaskDoneForSummary = (task: { review_state?: string | null; status?: string | null }) =>
  isTaskApproved(task);
