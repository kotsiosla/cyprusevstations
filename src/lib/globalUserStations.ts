import type { StationSuggestion } from "@/lib/userSuggestions";

type GlobalUserStationsV1 = {
  v: 1;
  approved: StationSuggestion[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeParseGlobal(payload: unknown): GlobalUserStationsV1 {
  if (!isRecord(payload)) return { v: 1, approved: [] };
  const approvedRaw = payload.approved;
  const approved = Array.isArray(approvedRaw) ? (approvedRaw as StationSuggestion[]) : [];
  return { v: 1, approved };
}

export async function fetchGlobalApprovedSuggestions(): Promise<StationSuggestion[]> {
  // Served from /public so it can be updated via repo commits (Option A).
  const url = `${import.meta.env.BASE_URL}user-stations.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    return safeParseGlobal(json).approved ?? [];
  } catch {
    return [];
  }
}

export function buildGlobalUserStationsFile(approved: StationSuggestion[]): GlobalUserStationsV1 {
  return { v: 1, approved };
}

