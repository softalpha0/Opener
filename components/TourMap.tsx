"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MlMap,
  type Marker,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapStop {
  order: number;
  city: string;
  lat: number;
  lng: number;
}

export interface MapHeat {
  lat: number;
  lng: number;
  affinity: number;
}

// Free Carto basemap (OpenStreetMap data), no token needed.
const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0E0C16" } }],
};

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function heatGeoJson(heat: MapHeat[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: heat.map((h) => ({
      type: "Feature",
      properties: { a: h.affinity },
      geometry: { type: "Point", coordinates: [h.lng, h.lat] },
    })),
  };
}

function routeGeoJson(stops: MapStop[]): GeoJSON.FeatureCollection {
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  return {
    type: "FeatureCollection",
    features:
      sorted.length > 1
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: sorted.map((s) => [s.lng, s.lat]) },
            },
          ]
        : [],
  };
}

export default function TourMap({
  heat,
  stops,
  activeOrder,
  onSelect,
  label,
}: {
  heat: MapHeat[];
  stops: MapStop[];
  activeOrder?: number | undefined;
  onSelect?: (order: number) => void;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [-50, 30],
      zoom: 1.3,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      fadeDuration: reducedMotion() ? 0 : 300,
    });
    mapRef.current = map;
    let loaded = false;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", () => {
      // If the basemap can't load (offline, blocked), fall back to a plain dark canvas.
      if (!loaded) {
        loaded = true;
        map.setStyle(FALLBACK_STYLE);
      }
    });
    map.on("style.load", () => {
      loaded = true;
      if (!map.getSource("heat")) {
        map.addSource("heat", { type: "geojson", data: heatGeoJson([]) });
        map.addLayer({
          id: "heat",
          type: "heatmap",
          source: "heat",
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "a"], 0, 0, 1, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 1, 0.9, 8, 2.2],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 1, 14, 6, 34, 10, 60],
            "heatmap-opacity": 0.85,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(14,12,22,0)",
              0.25,
              "rgba(255,122,69,0.35)",
              0.6,
              "rgba(255,122,69,0.75)",
              1,
              "rgba(255,196,92,0.95)",
            ],
          },
        });
      }
      if (!map.getSource("route")) {
        map.addSource("route", { type: "geojson", data: routeGeoJson([]) });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#FF7A45",
            "line-width": 2,
            "line-dasharray": [2, 2.5],
            "line-opacity": 0.9,
          },
        });
      }
      setReady(true);
    });
    return () => {
      markers.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("heat") as GeoJSONSource | undefined)?.setData(heatGeoJson(heat));
    (map.getSource("route") as GeoJSONSource | undefined)?.setData(routeGeoJson(stops));

    markers.current.forEach((m) => m.remove());
    markers.current = stops.map((stop) => {
      // Pointer-only shortcut: the route list next to the map is the accessible equivalent.
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.title = `Stop ${stop.order}: ${stop.city}`;
      el.className =
        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-ember text-xs font-bold text-ink shadow-[0_0_0_4px_rgba(255,122,69,0.25)]";
      el.textContent = String(stop.order);
      el.addEventListener("click", () => onSelectRef.current?.(stop.order));
      return new maplibregl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
    });

    const points: Array<[number, number]> = stops.length
      ? stops.map((s) => [s.lng, s.lat])
      : heat.map((h) => [h.lng, h.lat]);
    if (points.length) {
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 56, maxZoom: 6.5, duration: reducedMotion() ? 0 : 900 });
    }
  }, [heat, stops, ready]);

  useEffect(() => {
    markers.current.forEach((m, i) => {
      const el = m.getElement();
      const active = stops[i]?.order === activeOrder;
      el.style.background = active ? "#FFC45C" : "#FF7A45";
      el.style.boxShadow = active
        ? "0 0 0 6px rgba(255,196,92,0.35)"
        : "0 0 0 4px rgba(255,122,69,0.25)";
    });
  }, [activeOrder, stops]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className="h-full min-h-[320px] w-full overflow-hidden rounded-2xl"
    />
  );
}
