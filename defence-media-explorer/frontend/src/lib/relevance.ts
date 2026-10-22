import type { SearchRelevance } from "@/lib/api";

export function formatRelevanceScore(score: number) {
  if (!Number.isFinite(score)) return "";
  const abs = Math.abs(score);
  if (abs >= 100) return score.toFixed(2);
  if (abs >= 1) return score.toFixed(4);
  return score.toFixed(4);
}

export function relevanceLabelKey(relevance: SearchRelevance) {
  const key = relevance.scoreType || "unknown";
  return `search.relevance.${key}`;
}
