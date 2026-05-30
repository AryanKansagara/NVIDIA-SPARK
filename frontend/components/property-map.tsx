"use client";

import { useEffect, useRef } from "react";
import type { MapGeometry } from "@/lib/report";

type Props = { geometry: MapGeometry | null };

export function PropertyMap({ geometry }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!geometry || !mapRef.current) return;
    if (mapInstanceRef.current) return; // already initialised

    // Dynamically import leaflet (avoids SSR issues)
    import("leaflet").then((L) => {
      // Fix default icon path (Next.js asset handling)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!).setView(
        [geometry.propertyLat, geometry.propertyLon],
        15,
      );
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Property pin
      L.marker([geometry.propertyLat, geometry.propertyLon])
        .addTo(map)
        .bindPopup("Property")
        .openPopup();

      // Development pressure radius (500 m)
      L.circle([geometry.propertyLat, geometry.propertyLon], {
        radius: geometry.devPressureRadiusM,
        color: "#E16B47",
        fillColor: "#E16B47",
        fillOpacity: 0.08,
        weight: 1.5,
      })
        .addTo(map)
        .bindPopup(`Development pressure radius: ${geometry.devPressureRadiusM} m`);

      // TTC proximity ring
      L.circle([geometry.propertyLat, geometry.propertyLon], {
        radius: 400,
        color: "#2B6A57",
        fillOpacity: 0,
        weight: 1,
        dashArray: "4 4",
      })
        .addTo(map)
        .bindPopup("~400 m TTC walkability ring");

      // Surrounding community pricing — clickable insight marker
      const ci = geometry.communityInsights;
      if (ci) {
        const fmt = (v: number) =>
          new Intl.NumberFormat("en-CA", {
            style: "currency",
            currency: "CAD",
            maximumFractionDigits: 0,
          }).format(v);
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

        // Custom $ pin, offset slightly NE of the property so both are visible.
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
        })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 300 });
      }

      // Flood polygon overlay
      if (geometry.floodPolygonGeojson) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        L.geoJSON(geometry.floodPolygonGeojson as any, {
          style: { color: "#3B82F6", fillColor: "#3B82F6", fillOpacity: 0.2, weight: 1.5 },
        })
          .addTo(map)
          .bindPopup("TRCA Floodline polygon");
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [geometry]);

  if (!geometry) return <_MapPlaceholder />;

  return (
    <section className="rounded-4xl overflow-hidden border border-[#D4E4DE] shadow-panel">
      <div className="px-8 pt-6 pb-2 bg-white/70 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-ink">Property Map</h2>
        <p className="text-sm text-slate mt-0.5">
          Property pin · Development pressure ({geometry.devPressureRadiusM} m) ·
          TTC walkability ring{geometry.floodPolygonGeojson ? " · Flood polygon" : ""}
          {geometry.communityInsights ? " · 💲 Click the orange pin for community pricing" : ""}
        </p>
      </div>
      {/* Leaflet CSS */}
      <style>{`
        @import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      `}</style>
      <div ref={mapRef} style={{ height: 400, width: "100%" }} />
    </section>
  );
}

function _MapPlaceholder() {
  return (
    <section className="rounded-4xl overflow-hidden border border-[#D4E4DE] shadow-panel bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 p-8 lg:p-10 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-semibold text-ink leading-tight">
              Map view should make the risk feel immediate.
            </h2>
            <p className="text-slate text-sm mt-2 leading-relaxed">
              After generating a report, an interactive map will show the property pin,
              flood polygon overlay, development pressure radius, and TTC proximity rings.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-mist/40 border border-[#C8E0D8]">
              <span className="text-moss mt-0.5">📍</span>
              <div>
                <p className="text-xs font-semibold text-ink">Property pin</p>
                <p className="text-xs text-slate">Geocoded lat/lon with normalized address</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-mist/40 border border-[#C8E0D8]">
              <span className="text-blue-500 mt-0.5">🌊</span>
              <div>
                <p className="text-xs font-semibold text-ink">Flood overlay</p>
                <p className="text-xs text-slate">TRCA polygon intersection and risk loading</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-[260px] lg:min-h-0 relative bg-gradient-to-br from-mist via-[#D4EDE7] to-[#B8D9D0] flex items-center justify-center">
          <div className="relative">
            <div className="w-4 h-4 rounded-full bg-ink ring-4 ring-white shadow-lg" />
          </div>
          <p className="absolute bottom-4 text-xs text-slate/70 px-4 text-center">
            Generate a report to see the live map
          </p>
        </div>
      </div>
    </section>
  );
}
