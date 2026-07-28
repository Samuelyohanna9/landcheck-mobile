import { API_URL } from "../config/env";
import { normalizePhotoList, normalizeTreeSummary } from "../green/normalize";
import type { TreeSummary } from "../types/domain";
import { appendGreenAssetRenderParams, cacheGreenAssetLocally, resolveGreenAssetCandidates } from "../utils/assets";

const treePhotoEndpoint = (treeId: number) => `${API_URL}/green/trees/${treeId}/photo?w=1280&q=76&fm=jpeg`;

const uniqueStrings = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    output.push(next);
  }
  return output;
};

const buildPrimaryPhotoSources = (tree: TreeSummary) => {
  const sourceUrls = normalizePhotoList([tree.photo_url, ...(tree.photo_urls || [])]);
  const endpoint = tree.id > 0 ? treePhotoEndpoint(tree.id) : "";
  return uniqueStrings([...sourceUrls, endpoint]);
};

const resolvePrimaryOfflinePhoto = async (tree: TreeSummary) => {
  for (const source of buildPrimaryPhotoSources(tree)) {
    const candidates = resolveGreenAssetCandidates(source).map((candidate) =>
      appendGreenAssetRenderParams(candidate, { w: 1280, q: 76, fm: "jpeg" }),
    );
    for (const candidate of candidates) {
      try {
        const localUri = await cacheGreenAssetLocally(candidate, `tree-${tree.id}`);
        const next = String(localUri || "").trim();
        if (next) return next;
      } catch {
        // Fall through to the next candidate.
      }
    }
  }
  return "";
};

const hydratePrimaryTreePhoto = async (tree: TreeSummary): Promise<TreeSummary> => {
  const originalUrls = normalizePhotoList([tree.photo_url, ...(tree.photo_urls || [])]);
  if (!originalUrls.length && !(tree.id > 0)) {
    return normalizeTreeSummary(tree);
  }

  const offlineUri = await resolvePrimaryOfflinePhoto(tree);
  if (!offlineUri) {
    return normalizeTreeSummary(tree);
  }

  return normalizeTreeSummary({
    ...tree,
    photo_url: offlineUri,
    photo_urls: uniqueStrings([offlineUri, ...originalUrls]),
  });
};

export const hydrateTreePhotosForOffline = async (trees: TreeSummary[]) => {
  const output: TreeSummary[] = [];
  for (const tree of trees) {
    output.push(await hydratePrimaryTreePhoto(tree));
  }
  return output;
};
