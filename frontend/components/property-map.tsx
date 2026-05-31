"use client";

import { Pill } from "@/components/ui/pill";
import type { MeridianReport } from "@/lib/report";

// OpenStreetMap embed — no WebGL, always renders. Centered on the report's
// geocoded coordinates with a marker.
export function PropertyMap({ report }: { report: MeridianReport }) {
  const { lat, lng } = report.coordinates;
  const d = 0.0075; // bbox half-size (~0.5km)
  const bbox = `${(lng - d).toFixed(4)}%2C${(lat - d).toFixed(4)}%2C${(lng + d).toFixed(4)}%2C${(lat + d).toFixed(4)}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(4)}%2C${lng.toFixed(4)}`;

  return (
    <div className="frosted overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <div>
          <p className="text-[15px] font-medium text-primary">{report.inputs.address}</p>
          <p className="mt-0.5 text-xs text-muted">
            Property pin · Development pressure (500 m) · Flood overlay
          </p>
        </div>
        <Pill tone="high">Geocoded</Pill>
      </div>
      <div className="h-[340px] w-full bg-surface-raised">
        <iframe
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer"
          title="Property location on OpenStreetMap"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
