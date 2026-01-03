import type { ChargingStation } from "@/lib/chargingStations";

export type CommunityReportType =
  | "confirm_available"
  | "confirm_occupied"
  | "confirm_out_of_service"
  | "queue"
  | "comment"
  | "rating";

export type CommunityReport = {
  id: string;
  stationId: string;
  type: CommunityReportType;
  createdAt: number; // epoch ms
  // Optional fields by type
  minutesRemaining?: number;
  queueAhead?: number;
  rating?: number; // 1..5
  comment?: string;
  // Helpful metadata (local-only)
  userLabel?: string; // e.g. "me"
};

export type CommunitySummary = {
  stationId: string;
  lastConfirmedAt?: number;
  lastConfirmedType?: "available" | "occupied" | "out_of_service";
  lastQueueAhead?: number;
  lastQueueAt?: number;
  lastMinutesRemaining?: number;
  lastMinutesAt?: number;
  ratingAvg?: number;
  ratingCount?: number;
  recentComments: Array<{ createdAt: number; comment: string }>;
};

const STORAGE_KEY = "community_reports_v1";

function readAll(): CommunityReport[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is CommunityReport => Boolean(x && typeof x === "object"))
      .map((x) => x as CommunityReport);
  } catch {
    return [];
  }
}

function writeAll(items: CommunityReport[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-3000)));
  } catch {
    // ignore quota
  }
}

function genId() {
  return `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function addCommunityReport(report: Omit<CommunityReport, "id" | "createdAt">) {
  const item: CommunityReport = { ...report, id: genId(), createdAt: Date.now() };
  const all = readAll();
  all.push(item);
  writeAll(all);
  return item;
}

export function getCommunityReportsForStation(stationId: string): CommunityReport[] {
  return readAll()
    .filter((r) => r.stationId === stationId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function clearCommunityReportsForStation(stationId: string) {
  const next = readAll().filter((r) => r.stationId !== stationId);
  writeAll(next);
}

export function getCommunitySummary(station: ChargingStation, opts?: { recentWindowMinutes?: number }): CommunitySummary {
  const recentWindowMinutes = opts?.recentWindowMinutes ?? 90;
  const cutoff = Date.now() - recentWindowMinutes * 60 * 1000;
  const reports = getCommunityReportsForStation(station.id);
  const recent = reports.filter((r) => r.createdAt >= cutoff);

  const lastConfirm = recent.find(
    (r) =>
      r.type === "confirm_available" || r.type === "confirm_occupied" || r.type === "confirm_out_of_service"
  );
  const lastQueue = recent.find((r) => r.type === "queue" && typeof r.queueAhead === "number");
  const lastMinutes = recent.find((r) => r.type === "confirm_occupied" && typeof r.minutesRemaining === "number");

  const ratings = reports.filter((r) => r.type === "rating" && typeof r.rating === "number");
  const ratingCount = ratings.length;
  const ratingAvg =
    ratingCount > 0 ? ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / Math.max(1, ratingCount) : undefined;

  const recentComments = reports
    .filter((r) => r.type === "comment" && typeof r.comment === "string" && r.comment.trim())
    .slice(0, 3)
    .map((r) => ({ createdAt: r.createdAt, comment: r.comment!.trim() }));

  const lastConfirmedType =
    lastConfirm?.type === "confirm_available"
      ? "available"
      : lastConfirm?.type === "confirm_occupied"
        ? "occupied"
        : lastConfirm?.type === "confirm_out_of_service"
          ? "out_of_service"
          : undefined;

  return {
    stationId: station.id,
    lastConfirmedAt: lastConfirm?.createdAt,
    lastConfirmedType,
    lastQueueAhead: lastQueue?.queueAhead,
    lastQueueAt: lastQueue?.createdAt,
    lastMinutesRemaining: lastMinutes?.minutesRemaining,
    lastMinutesAt: lastMinutes?.createdAt,
    ratingAvg: ratingAvg !== undefined ? Math.round(ratingAvg * 10) / 10 : undefined,
    ratingCount: ratingCount || undefined,
    recentComments
  };
}

export function formatTimeAgo(ts?: number): string | null {
  if (!ts) return null;
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr}h ago`;
  const deltaDay = Math.floor(deltaHr / 24);
  return `${deltaDay}d ago`;
}

