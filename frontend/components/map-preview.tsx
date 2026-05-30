import { MapPinned, Waves } from "lucide-react";
import { Panel } from "@/components/ui/panel";

export function MapPreview() {
  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
            Spatial Layer
          </p>
          <h3 className="font-display text-3xl text-ink">
            Map view should make the risk feel immediate.
          </h3>
          <p className="text-sm leading-7 text-slate">
            This panel is the placeholder for the property map, flood polygons,
            transit proximity, and nearby development markers. Build the
            UI contract first, then wire Leaflet or Mapbox once the backend
            starts returning geometry.
          </p>
          <div className="grid gap-3">
            <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
              <div className="flex items-center gap-2 text-moss">
                <MapPinned className="h-4 w-4" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">
                  Property pin
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate">
                43.6470, -79.3950 with normalized address lookup.
              </p>
            </div>
            <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
              <div className="flex items-center gap-2 text-ember">
                <Waves className="h-4 w-4" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">
                  Flood overlay
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate">
                Polygon intersection state and risk loading should appear here.
              </p>
            </div>
          </div>
        </div>
        <div className="grid-noise relative min-h-[320px] overflow-hidden rounded-[2rem] border border-[#D7E7E2] bg-[#EFF6F3]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(43,106,87,0.16),transparent_14%),radial-gradient(circle_at_68%_62%,rgba(225,107,71,0.14),transparent_18%),radial-gradient(circle_at_80%_22%,rgba(185,146,57,0.14),transparent_12%)]" />
          <div className="absolute left-[16%] top-[21%] h-4 w-4 rounded-full bg-ink ring-8 ring-white/70" />
          <div className="absolute right-[18%] top-[27%] h-28 w-28 rounded-full border-2 border-moss/35" />
          <div className="absolute left-[32%] top-[48%] h-36 w-36 rounded-full border-2 border-ember/30" />
          <div className="absolute bottom-[16%] right-[28%] h-24 w-24 rounded-full border-2 border-brass/35" />
          <div className="absolute bottom-6 left-6 rounded-3xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              Planned map states
            </p>
            <p className="mt-2 text-sm text-ink">
              Property pin, TTC rings, floodline, development radius.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
