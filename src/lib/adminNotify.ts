import type { StationSuggestion } from "@/lib/userSuggestions";

type EnvLike = Partial<Record<string, string>>;
type RuntimeConfig = {
  adminNotifyEndpoint?: string;
};
const VITE_ENV: EnvLike = (import.meta as ImportMeta & { env?: EnvLike }).env ?? {};
const RUNTIME_CONFIG = (globalThis as typeof globalThis & { __APP_CONFIG__?: RuntimeConfig }).__APP_CONFIG__;

// A public webhook/form endpoint (e.g. Formspree / Getform / Pipedream).
// It should be configured on the provider to email the admin privately.
const getAdminNotifyEndpoint = () => VITE_ENV.VITE_ADMIN_NOTIFY_ENDPOINT ?? RUNTIME_CONFIG?.adminNotifyEndpoint;

export type AdminNotifyResult = { ok: boolean; reason?: string };

export function isAdminNotifyConfigured(): boolean {
  return Boolean(getAdminNotifyEndpoint());
}

async function postJson(endpoint: string, body: unknown) {
  return await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function postForm(endpoint: string, body: Record<string, string>) {
  const params = new URLSearchParams(body);
  return await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: params.toString()
  });
}

export async function notifyAdminNewSuggestion(args: {
  approvalUrl: string;
  suggestion: StationSuggestion;
}): Promise<AdminNotifyResult> {
  const adminNotifyEndpoint = getAdminNotifyEndpoint();
  if (!adminNotifyEndpoint) {
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
    const res = await postJson(adminNotifyEndpoint, body);
    if (res.ok) return { ok: true };

    // Some form providers only accept form-encoded payloads.
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405 || res.status === 415) {
      const formRes = await postForm(adminNotifyEndpoint, Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
      ));
      if (formRes.ok) return { ok: true };
      return { ok: false, reason: `http_${formRes.status}` };
    }

    return { ok: false, reason: `http_${res.status}` };
  } catch {
    // Last resort: attempt a simple "no-cors" POST. This can still deliver data to some webhook providers,
    // but the browser will hide the response (opaque) so we cannot verify delivery.
    try {
      await fetch(adminNotifyEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: {
          // Must be a "simple" content-type for no-cors requests.
          "Content-Type": "text/plain"
        },
        body: JSON.stringify(body)
      });
      return { ok: true, reason: "opaque_no_cors" };
    } catch {
      return { ok: false, reason: "network_error" };
    }
  }
}
