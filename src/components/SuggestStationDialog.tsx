import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
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

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (!v) reset();
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest a new charging station</DialogTitle>
          <DialogDescription>
            Add a station based on the map location. Your submission will be pending until the admin approves it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Location</div>
            {coordsLabel ? <div>{coordsLabel}</div> : <div>Click on the map to choose the station location.</div>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marina Fast Charge" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">City (optional)</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Limassol" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Address (optional)</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, landmark…" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Max power (kW) (optional)</label>
              <Input value={powerKw} onChange={(e) => setPowerKw(e.target.value)} inputMode="numeric" placeholder="e.g. 150" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connectors</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CONNECTOR_OPTIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={connectors.includes(c)} onCheckedChange={() => toggleConnector(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything helpful (access, parking, issues)…" />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Photo (optional)</label>
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
              <img src={photoDataUrl} alt="Suggestion preview" className="rounded-lg border max-h-40 object-cover" />
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            Submit suggestion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

