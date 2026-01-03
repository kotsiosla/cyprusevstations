import { useMemo, useState } from "react";
import type { ChargingStation } from "@/lib/chargingStations";
import { addCommunityReport, clearCommunityReportsForStation, formatTimeAgo, getCommunitySummary } from "@/lib/community";
import { toggleWatch, isWatched, getWatchState } from "@/lib/alerts";
import type { VehicleProfile } from "@/lib/vehicleProfiles";
import { estimateChargeMinutes20to80, stationFitsVehicle } from "@/lib/vehicleProfiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Bell, CheckCircle2, MessageSquare, Star, Timer, Users } from "lucide-react";

type Props = {
  station: ChargingStation;
  vehicleProfile?: VehicleProfile | null;
};

export default function CommunityFeedback({ station, vehicleProfile }: Props) {
  const summary = useMemo(() => getCommunitySummary(station), [station]);
  const [open, setOpen] = useState(false);

  const [statusChoice, setStatusChoice] = useState<"available" | "occupied" | "out_of_service">("available");
  const [minutesRemaining, setMinutesRemaining] = useState("");
  const [queueAhead, setQueueAhead] = useState("");
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");

  const watched = useMemo(() => isWatched(station.id), [station.id]);

  const canFit = vehicleProfile ? stationFitsVehicle(station, vehicleProfile) : true;
  const est2080 = vehicleProfile ? estimateChargeMinutes20to80(station, vehicleProfile) : null;

  const lastConfirmedAgo = formatTimeAgo(summary.lastConfirmedAt);
  const queueAgo = formatTimeAgo(summary.lastQueueAt);
  const minutesAgo = formatTimeAgo(summary.lastMinutesAt);

  const confirmStyles =
    summary.lastConfirmedType === "available"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : summary.lastConfirmedType === "occupied"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : summary.lastConfirmedType === "out_of_service"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-muted";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {vehicleProfile ? (
          <Badge variant="outline" className={cn("text-[0.65rem]", canFit ? "border-emerald-200" : "border-rose-200")}>
            {canFit ? "Fits your EV ✅" : "Doesn’t fit your EV ❌"}
          </Badge>
        ) : null}
        {vehicleProfile && est2080 ? (
          <Badge variant="outline" className="text-[0.65rem]">
            20→80% ~{est2080} min
          </Badge>
        ) : null}
        {summary.ratingAvg ? (
          <Badge variant="secondary" className="text-[0.65rem] flex items-center gap-1">
            <Star className="h-3 w-3" /> {summary.ratingAvg} ({summary.ratingCount ?? 0})
          </Badge>
        ) : null}
        {summary.lastConfirmedAt ? (
          <Badge variant="outline" className={cn("text-[0.65rem]", confirmStyles)}>
            Last confirmed {summary.lastConfirmedType} · {lastConfirmedAgo}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[0.65rem]">
            No recent community confirmations
          </Badge>
        )}
        {typeof summary.lastQueueAhead === "number" ? (
          <Badge variant="outline" className="text-[0.65rem] flex items-center gap-1">
            <Users className="h-3 w-3" /> Queue: {summary.lastQueueAhead} · {queueAgo}
          </Badge>
        ) : null}
        {typeof summary.lastMinutesRemaining === "number" ? (
          <Badge variant="outline" className="text-[0.65rem] flex items-center gap-1">
            <Timer className="h-3 w-3" /> ~{summary.lastMinutesRemaining} min left · {minutesAgo}
          </Badge>
        ) : null}
      </div>

      {summary.recentComments.length ? (
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Latest comments
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            {summary.recentComments.map((c) => (
              <div key={c.createdAt} className="flex items-start justify-between gap-3">
                <span className="flex-1">{c.comment}</span>
                <span className="shrink-0 opacity-80">{formatTimeAgo(c.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
          <CheckCircle2 className="h-4 w-4" />
          Confirm / report
        </Button>
        <Button
          size="sm"
          variant={watched ? "secondary" : "outline"}
          className="gap-2"
          onClick={() => {
            const res = toggleWatch(station);
            const count = getWatchState().rules.length;
            toast(res.watched ? "Watching charger" : "Stopped watching", {
              description: `${station.name}${count ? ` · ${count} watched` : ""}`
            });
          }}
        >
          <Bell className="h-4 w-4" />
          {watched ? "Watching" : "Watch"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Community updates</DialogTitle>
            <DialogDescription>
              Lightweight crowd reporting (stored on this device). Use it when live availability isn’t reliable.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="status" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="feedback">Feedback</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="space-y-4">
              <RadioGroup
                value={statusChoice}
                onValueChange={(v) => setStatusChoice(v as "available" | "occupied" | "out_of_service")}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="available" id="st-available" />
                  <label htmlFor="st-available" className="text-sm">
                    🟢 Available
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="occupied" id="st-occupied" />
                  <label htmlFor="st-occupied" className="text-sm">
                    🔴 Occupied
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="out_of_service" id="st-oos" />
                  <label htmlFor="st-oos" className="text-sm">
                    ⚠️ Out of service
                  </label>
                </div>
              </RadioGroup>

              {statusChoice === "occupied" ? (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Minutes remaining (optional)</label>
                  <Input value={minutesRemaining} onChange={(e) => setMinutesRemaining(e.target.value)} inputMode="numeric" />
                </div>
              ) : null}

              <Button
                className="w-full"
                onClick={() => {
                  const minutes = Number(minutesRemaining);
                  addCommunityReport({
                    stationId: station.id,
                    type:
                      statusChoice === "available"
                        ? "confirm_available"
                        : statusChoice === "occupied"
                          ? "confirm_occupied"
                          : "confirm_out_of_service",
                    minutesRemaining:
                      statusChoice === "occupied" && Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined
                  });
                  toast.success("Thanks! Saved report.", { description: station.name });
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </TabsContent>

            <TabsContent value="queue" className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">People ahead of you</label>
                <Input value={queueAhead} onChange={(e) => setQueueAhead(e.target.value)} inputMode="numeric" />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const n = Number(queueAhead);
                  if (!Number.isFinite(n) || n < 0) {
                    toast.error("Enter a valid number.");
                    return;
                  }
                  addCommunityReport({ stationId: station.id, type: "queue", queueAhead: Math.round(n) });
                  toast.success("Queue updated.", { description: station.name });
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </TabsContent>

            <TabsContent value="feedback" className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Rating (optional)</label>
                <Input value={rating} onChange={(e) => setRating(e.target.value)} inputMode="numeric" placeholder="1-5" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Comment</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. cuts to 30kW, left plug only, ICE’d spots…"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const r = Number(rating);
                  const hasRating = Number.isFinite(r) && r >= 1 && r <= 5;
                  const text = comment.trim();
                  if (!hasRating && !text) {
                    toast.error("Add a rating or a comment.");
                    return;
                  }
                  if (hasRating) addCommunityReport({ stationId: station.id, type: "rating", rating: Math.round(r) });
                  if (text) addCommunityReport({ stationId: station.id, type: "comment", comment: text });
                  toast.success("Thanks! Saved feedback.", { description: station.name });
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </TabsContent>
          </Tabs>

          <DialogFooter className="sm:justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clearCommunityReportsForStation(station.id);
                toast("Cleared local reports.", { description: station.name });
                setOpen(false);
              }}
            >
              Clear local
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

