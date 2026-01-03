import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronDown, X } from "lucide-react";
import type { SuggestedConnector, StationSuggestion } from "@/lib/userSuggestions";
import { addPendingSuggestion, makeSuggestionApprovalUrl } from "@/lib/userSuggestions";
import { notifyAdminNewSuggestion } from "@/lib/adminNotify";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordinates: [number, number] | null;
};

const CONNECTOR_OPTIONS: SuggestedConnector[] = ["CCS", "Type 2", "CHAdeMO", "Schuko", "Type 1", "Tesla"];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export default function SuggestStationDialog({ open, onOpenChange, coordinates }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [powerKw, setPowerKw] = useState("");
  const [notes, setNotes] = useState("");
  const [connectors, setConnectors] = useState<SuggestedConnector[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isMobile = useIsMobile();
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (open) setDetailsOpen(!isMobile);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const coordsLabel = useMemo(() => {
    if (!coordinates) return null;
    return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
  }, [coordinates]);

  const reset = () => {
    setName("");
    setCity("");
    setAddress("");
    setPowerKw("");
    setNotes("");
    setConnectors([]);
    setPhotoDataUrl(null);
  };

  const toggleConnector = (c: SuggestedConnector) => {
    setConnectors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const handleSubmit = async () => {
    if (!coordinates) {
      toast.error("Pick a location on the map first.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a station name.");
      return;
    }
    const power = Number(powerKw);
    const powerNum = Number.isFinite(power) && power > 0 ? power : undefined;
    const payload: Omit<StationSuggestion, "id" | "createdAt"> = {
      coordinates,
      name: trimmed,
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      connectors,
      powerKw: powerNum,
      notes: notes.trim() || undefined,
      photoDataUrl: photoDataUrl ?? undefined
    };
    const suggestion = addPendingSuggestion(payload);
    const approvalUrl = makeSuggestionApprovalUrl(suggestion);

    const notify = await notifyAdminNewSuggestion({ approvalUrl, suggestion });
    if (notify.ok) {
      toast.success("Submitted!", { description: "Sent to admin for approval." });
    } else {
      // Fallback: copy the approval link so the user can manually send it to admin.
      try {
        await navigator.clipboard.writeText(approvalUrl);
        toast.success("Suggestion saved. Link copied!", {
          description: "Auto-email is not configured. Send the copied link to the admin."
        });
      } catch {
        toast.message("Suggestion saved.", { description: "Please share the approval link with the admin." });
      }
      reset();
      onOpenChange(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(approvalUrl);
    } catch {
      // ok
    }
    reset();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      className={[
        "absolute z-20 rounded-xl border bg-background/95 backdrop-blur shadow-soft pointer-events-auto",
        isMobile ? "left-3 right-3 bottom-3 max-h-[55vh]" : "left-4 top-4 w-[380px] max-h-[70vh]"
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="text-base font-semibold">Suggest a new charging station</div>
          <div className="text-xs text-muted-foreground">Reviewed by admin before appearing on the map.</div>
        </div>
        <button
          type="button"
          className="rounded-md p-2 hover:bg-muted"
          aria-label="Close"
          onClick={() => {
            reset();
            onOpenChange(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-4 pt-3 overflow-y-auto">
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
            <div className="font-medium text-foreground">Location</div>
            <div className="font-mono">{coordsLabel ?? "Drag pin to set"}</div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marina Fast Charge" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connectors</p>
            <div className="grid gap-2 grid-cols-2">
              {CONNECTOR_OPTIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={connectors.includes(c)} onCheckedChange={() => toggleConnector(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <span className="text-sm font-medium">More details (optional)</span>
                <ChevronDown className={`h-4 w-4 transition ${detailsOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">City</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Limassol" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Max power (kW)</label>
                  <Input
                    value={powerKw}
                    onChange={(e) => setPowerKw(e.target.value)}
                    inputMode="numeric"
                    placeholder="e.g. 150"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Address</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, landmark…" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything helpful (access, parking, issues)…"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1_500_000) {
                      toast.error("Image too large. Please upload a smaller photo (<1.5MB).");
                      return;
                    }
                    setBusy(true);
                    try {
                      const dataUrl = await fileToDataUrl(file);
                      if (!dataUrl.startsWith("data:image/")) {
                        toast.error("Unsupported image format.");
                        return;
                      }
                      setPhotoDataUrl(dataUrl);
                    } catch {
                      toast.error("Failed to load image.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="Suggestion preview" className="rounded-lg border max-h-32 object-cover" />
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={busy}>
              Submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

