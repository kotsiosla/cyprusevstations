import type { StationSuggestion } from "@/lib/userSuggestions";

type EnvLike = Partial<Record<string, string>>;
const VITE_ENV: EnvLike = (import.meta as ImportMeta & { env?: EnvLike }).env ?? {};

// A public webhook/form endpoint (e.g. Formspree / Getform / Pipedream).
// It should be configured on the provider to email the admin privately.
const ADMIN_NOTIFY_ENDPOINT = VITE_ENV.VITE_ADMIN_NOTIFY_ENDPOINT;

export type AdminNotifyResult = { ok: boolean; reason?: string };

export async function notifyAdminNewSuggestion(args: {
  approvalUrl: string;
  suggestion: StationSuggestion;
}): Promise<AdminNotifyResult> {
  if (!ADMIN_NOTIFY_ENDPOINT) {
    return { ok: false, reason: "admin_notify_endpoint_not_configured" };
  }

  const { approvalUrl, suggestion } = args;
  const [lon, lat] = suggestion.coordinates;

  const messageLines = [
    "New charging station suggestion",
    "",
    `Name: ${suggestion.name}`,
    suggestion.city ? `City: ${suggestion.city}` : null,
    suggestion.address ? `Address: ${suggestion.address}` : null,
    typeof suggestion.powerKw === "number" ? `Power: ${suggestion.powerKw} kW` : null,
    suggestion.connectors?.length ? `Connectors: ${suggestion.connectors.join(", ")}` : null,
    `Coords: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
    suggestion.notes ? "" : null,
    suggestion.notes ? `Notes: ${suggestion.notes}` : null,
    "",
    "Approve / add to map:",
    approvalUrl
  ].filter(Boolean) as string[];

  // Keep payload simple for broad compatibility with form/webhook providers.
  const body = {
    type: "station_suggestion",
    subject: "New EV charger suggestion (Cyprus)",
    approval_url: approvalUrl,
    name: suggestion.name,
    city: suggestion.city ?? "",
    address: suggestion.address ?? "",
    power_kw: typeof suggestion.powerKw === "number" ? suggestion.powerKw : "",
    connectors: (suggestion.connectors ?? []).join(", "),
    coordinates: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
    notes: suggestion.notes ?? "",
    message: messageLines.join("\n")
  };

  try {
    const res = await fetch(ADMIN_NOTIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

