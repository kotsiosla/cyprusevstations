import type { ChargingStation } from "@/lib/chargingStations";

export type SuggestedConnector = "CCS" | "Type 2" | "CHAdeMO" | "Schuko" | "Type 1" | "Tesla";

export type StationSuggestion = {
  id: string;
  createdAt: number; // epoch ms
  coordinates: [number, number]; // [lon, lat]
  name: string;
  city?: string;
  address?: string;
  connectors: SuggestedConnector[];
  powerKw?: number;
  notes?: string;
  photoDataUrl?: string; // optional thumbnail-ish data URL
};

export type StoredSuggestions = {
  pending: StationSuggestion[];
  approved: StationSuggestion[];
};

const STORAGE_KEY = "station_suggestions_v1";

function safeParse(raw: string | null): StoredSuggestions {
  if (!raw) return { pending: [], approved: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSuggestions>;
    return {
      pending: Array.isArray(parsed.pending) ? (parsed.pending as StationSuggestion[]) : [],
      approved: Array.isArray(parsed.approved) ? (parsed.approved as StationSuggestion[]) : []
    };
  } catch {
    return { pending: [], approved: [] };
  }
}

function readStore(): StoredSuggestions {
  if (typeof localStorage === "undefined") return { pending: [], approved: [] };
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

function writeStore(store: StoredSuggestions) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota
  }
}

function genId() {
  return `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function listPendingSuggestions(): StationSuggestion[] {
  return readStore().pending.sort((a, b) => b.createdAt - a.createdAt);
}

export function listApprovedSuggestions(): StationSuggestion[] {
  return readStore().approved.sort((a, b) => b.createdAt - a.createdAt);
}

export function addPendingSuggestion(input: Omit<StationSuggestion, "id" | "createdAt">): StationSuggestion {
  const store = readStore();
  const suggestion: StationSuggestion = { ...input, id: genId(), createdAt: Date.now() };
  store.pending.push(suggestion);
  store.pending = store.pending.slice(-500);
  writeStore(store);
  return suggestion;
}

export function approveSuggestion(id: string) {
  const store = readStore();
  const idx = store.pending.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const [item] = store.pending.splice(idx, 1);
  store.approved.push(item);
  store.approved = store.approved.slice(-2000);
  writeStore(store);
  return item;
}

export function rejectSuggestion(id: string) {
  const store = readStore();
  store.pending = store.pending.filter((s) => s.id !== id);
  writeStore(store);
}

export function removeApprovedSuggestion(id: string) {
  const store = readStore();
  store.approved = store.approved.filter((s) => s.id !== id);
  writeStore(store);
}

export function suggestionToChargingStation(s: StationSuggestion): ChargingStation {
  const connectors = s.connectors?.length ? s.connectors : undefined;
  return {
    id: `user/${s.id}`,
    name: s.name,
    operator: "User submitted",
    address: s.address,
    city: s.city,
    connectors,
    power: typeof s.powerKw === "number" ? `${s.powerKw} kW` : undefined,
    availability: "unknown",
    statusLabel: "User suggested (unverified)",
    coordinates: s.coordinates,
    // extra optional metadata (non-breaking)
    isUserSuggested: true,
    suggestionId: s.id,
    suggestionPhotoDataUrl: s.photoDataUrl,
    suggestionNotes: s.notes,
    suggestionCreatedAt: s.createdAt
  } as ChargingStation;
}

// --- Share/import helpers (no backend) ---
function toBase64Url(text: string) {
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(b64url: string) {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const text = decodeURIComponent(escape(atob(padded)));
  return text;
}

export function makeSuggestionShareUrl(s: StationSuggestion, baseUrl?: string): string {
  const payload = toBase64Url(JSON.stringify({ v: 1, suggestion: s }));
  const origin = baseUrl ?? (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
  return `${origin}?admin=1&importSuggestion=${payload}`;
}

export function makeSuggestionApprovalUrl(s: StationSuggestion, baseUrl?: string): string {
  const payload = toBase64Url(JSON.stringify({ v: 1, suggestion: s }));
  const origin = baseUrl ?? (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
  // Admin-only link that auto-approves on open.
  return `${origin}?admin=1&autoApprove=1&importSuggestion=${payload}`;
}

export function importSuggestionFromUrlParam(payload: string): StationSuggestion | null {
  try {
    const decoded = fromBase64Url(payload);
    const parsed = JSON.parse(decoded) as { v?: number; suggestion?: StationSuggestion };
    const suggestion = parsed?.suggestion;
    if (!suggestion || typeof suggestion !== "object") return null;
    if (!Array.isArray(suggestion.coordinates) || suggestion.coordinates.length < 2) return null;
    // Do not trust incoming IDs/timestamps; regenerate.
    const normalized: Omit<StationSuggestion, "id" | "createdAt"> = {
      coordinates: [Number(suggestion.coordinates[0]), Number(suggestion.coordinates[1])],
      name: String(suggestion.name ?? "User suggested station"),
      city: suggestion.city ? String(suggestion.city) : undefined,
      address: suggestion.address ? String(suggestion.address) : undefined,
      connectors: Array.isArray(suggestion.connectors) ? (suggestion.connectors as SuggestedConnector[]) : [],
      powerKw: typeof suggestion.powerKw === "number" ? suggestion.powerKw : undefined,
      notes: suggestion.notes ? String(suggestion.notes) : undefined,
      photoDataUrl: suggestion.photoDataUrl && String(suggestion.photoDataUrl).startsWith("data:")
        ? String(suggestion.photoDataUrl)
        : undefined
    };
    return addPendingSuggestion(normalized);
  } catch {
    return null;
  }
}

