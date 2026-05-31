"use client";

import { useEffect, useRef } from "react";
import type { MapGeometry } from "@/lib/report";

type Props = { geometry: MapGeometry | null; address?: string };

export function PropertyMap({ geometry, address }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!geometry || !mapRef.current) return;
    // Guard against React StrictMode double-invoke and hot-reload
    if (mapInstanceRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((mapRef.current as any)._leaflet_id) return;

    import("leaflet").then((L) => {
      if (!mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((mapRef.current as any)._leaflet_id) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, { zoomControl: true }).setView(
        [geometry.propertyLat, geometry.propertyLon],
        15,
      );
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Property pin — show the actual address
      const propertyLabel = address ?? "Property";
      L.marker([geometry.propertyLat, geometry.propertyLon])
        .addTo(map)
        .bindPopup(
          `<div style="font-weight:600;font-size:13px;max-width:240px;">${propertyLabel}</div>`,
          { maxWidth: 280 },
        )
        .openPopup();

      // Community insights: price-range rings at different radii
      const ci = geometry.communityInsights;
      if (ci) {
        const fmt = (v: number) =>
          new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v);

        // Inner ring (200m) — tightest comparable pocket
        L.circle([geometry.propertyLat, geometry.propertyLon], {
          radius: 200,
          color: "#5266EB",
          fillColor: "#5266EB",
          fillOpacity: 0.06,
          weight: 1.5,
          dashArray: "3 3",
        }).addTo(map).bindPopup(
          `<div style="font-size:12px;min-width:200px;"><b>~200m vicinity</b><br/>
           Estimated: ~${fmt(Math.round(ci.medianEstimate * 0.98))}/sqft range<br/>
           ~$${ci.pricePerSqftEstimate.toLocaleString("en-CA")}/sq ft</div>`
        );

        // Development pressure radius (500m)
        L.circle([geometry.propertyLat, geometry.propertyLon], {
          radius: geometry.devPressureRadiusM,
          color: "#E16B47",
          fillColor: "#E16B47",
          fillOpacity: 0.07,
          weight: 1.5,
        }).addTo(map).bindPopup(
          `<div style="font-size:12px;min-width:200px;"><b>${geometry.devPressureRadiusM}m development pressure zone</b><br/>
           Community median: ${fmt(ci.medianEstimate)}<br/>
           Range: ${fmt(ci.typicalRangeLow)} – ${fmt(ci.typicalRangeHigh)}<br/>
           Trend: ${ci.trend === "rising" ? "▲ Rising" : ci.trend === "cooling" ? "▼ Cooling" : "▬ Stable"}</div>`,
          { maxWidth: 280 }
        );

        // 1km radius — broader neighbourhood pricing
        L.circle([geometry.propertyLat, geometry.propertyLon], {
          radius: 1000,
          color: "#B99239",
          fillColor: "#B99239",
          fillOpacity: 0.04,
          weight: 1,
          dashArray: "6 4",
        }).addTo(map).bindPopup(
          `<div style="font-size:12px;min-width:200px;"><b>~1km neighbourhood band</b><br/>
           Broader area pricing: ${fmt(ci.typicalRangeLow)} – ${fmt(ci.typicalRangeHigh)}</div>`
        );

        // TTC walkability ring (400m)
        L.circle([geometry.propertyLat, geometry.propertyLon], {
          radius: 400,
          color: "#2B6A57",
          fillOpacity: 0,
          weight: 1.5,
          dashArray: "4 4",
        }).addTo(map).bindPopup("~400 m TTC walkability ring");

        // $ community insights marker (offset NE)
        const trendBadge =
          ci.trend === "rising"
            ? '<span style="color:#E16B47;font-weight:600;">▲ Rising</span>'
            : ci.trend === "cooling"
              ? '<span style="color:#2B6A57;font-weight:600;">▼ Cooling</span>'
              : '<span style="color:#B99239;font-weight:600;">▬ Stable</span>';

        const popupHtml = `
          <div style="min-width:230px;max-width:280px;font-family:inherit;">
            <div style="font-weight:700;font-size:13px;color:#10212B;margin-bottom:4px;">
              💲 ${ci.headline}
            </div>
            <div style="font-size:12px;color:#10212B;margin-bottom:6px;">
              Median ≈ <b>${fmt(ci.medianEstimate)}</b> &nbsp;|&nbsp; ${trendBadge}<br/>
              Typical range: ${fmt(ci.typicalRangeLow)} – ${fmt(ci.typicalRangeHigh)}<br/>
              ~$${ci.pricePerSqftEstimate.toLocaleString("en-CA")} / sq ft
            </div>
            <ul style="margin:0;padding-left:16px;font-size:11px;color:#41555C;line-height:1.5;">
              ${ci.notes.map((n) => `<li>${n}</li>`).join("")}
            </ul>
          </div>`;

        const dollarIcon = L.divIcon({
          className: "",
          html:
            '<div style="background:#E16B47;color:#fff;width:30px;height:30px;border-radius:50%;' +
            "display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;" +
            'border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;">$</div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([geometry.propertyLat + 0.0012, geometry.propertyLon + 0.0016], {
          icon: dollarIcon,
          title: "Community pricing insights",
        }).addTo(map).bindPopup(popupHtml, { maxWidth: 300 });
      } else {
        // No community insights — just show dev pressure and TTC rings
        L.circle([geometry.propertyLat, geometry.propertyLon], {
          radius: geometry.devPressureRadiusM,
          color: "#E16B47",
          fillColor: "#E16B47",
          fillOpacity: 0.08,
          weight: 1.5,
        }).addTo(map).bindPopup(`Development pressure radius: ${geometry.devPressureRadiusM} m`);

        L.circle([geometry.propertyLat, geometry.propertyLon], {
          radius: 400,
          color: "#2B6A57",
          fillOpacity: 0,
          weight: 1,
          dashArray: "4 4",
        }).addTo(map).bindPopup("~400 m TTC walkability ring");
      }

      // Flood polygon overlay
      if (geometry.floodPolygonGeojson) {
        L.geoJSON(geometry.floodPolygonGeojson as any, {
          style: { color: "#3B82F6", fillColor: "#3B82F6", fillOpacity: 0.2, weight: 1.5 },
        }).addTo(map).bindPopup("TRCA Floodline polygon");
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [geometry, address]);

  if (!geometry) return null;

  return (
    <section
      className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]"
      style={{ position: "relative", zIndex: 0 }}
    >
      <div className="px-6 pb-3 pt-5">
        <h2 className="text-[15px] font-medium text-[color:var(--text-primary)]">Property Map</h2>
        <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
          Property pin · Price rings (200m / 500m / 1km) · TTC walkability ring
          {geometry.floodPolygonGeojson ? " · Flood polygon" : ""}
          {geometry.communityInsights ? " · click $ for community pricing" : ""}
        </p>
      </div>
      <style>{`@import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");`}</style>
      <div ref={mapRef} style={{ height: 400, width: "100%" }} />
    </section>
  );
}
