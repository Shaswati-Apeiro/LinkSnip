import { useMemo } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import { countryCentroids } from "../data/countryCentroids";

// Fully offline map: country shapes come from a bundled TopoJSON (world-atlas),
// projected with d3-geo. No tiles, no external requests. Markers are placed at
// bundled country centroids, sized by click share.

const W = 800;
const H = 380;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = worldTopo as any;
const countriesFC = feature(topo, topo.objects.countries) as unknown as {
  type: "FeatureCollection";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any[];
};

// ISO-2 -> flag emoji (regional indicator letters) — offline, no images.
export const flag = (code: string): string =>
  /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "🏳️";

// ISO-2 -> English country name via the built-in Intl API (offline, no data file).
const displayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
export const regionName = (code: string): string => {
  if (!/^[A-Za-z]{2}$/.test(code)) return "Unknown";
  try {
    return displayNames?.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
};

export type MapDatum = { code: string; count: number };

export default function WorldMap({ data }: { data: MapDatum[] }) {
  const { paths, markers } = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([W, H], { type: "Sphere" });
    const path = geoPath(projection);
    const paths = countriesFC.features.map((f) => path(f) || "");

    const total = data.reduce((s, d) => s + d.count, 0) || 1;
    const max = Math.max(1, ...data.map((d) => d.count));

    const markers = data
      .map((d) => {
        const c = countryCentroids[d.code];
        if (!c) return null;
        const p = projection(c);
        if (!p) return null;
        const share = d.count / total;
        const color =
          share >= 0.2
            ? "var(--color-accent-mint-fg)"
            : share >= 0.1
            ? "var(--color-accent-sky-fg)"
            : share >= 0.05
            ? "var(--color-accent-amber-fg)"
            : "var(--color-accent-rose-fg)";
        return {
          code: d.code,
          x: p[0],
          y: p[1],
          r: 4 + 12 * Math.sqrt(d.count / max),
          color,
          count: d.count,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.r - a.r); // big markers first so small ones stay clickable on top

    return { paths, markers };
  }, [data]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 12 }}
      role="img"
      aria-label="Visitors by country"
    >
      <rect x={0} y={0} width={W} height={H} fill="var(--color-mist-20)" />
      {paths.map((d, i) => (
        <path key={i} d={d} fill="var(--color-mist-60)" stroke="var(--color-mist-100)" strokeWidth={0.4} />
      ))}
      {markers.map((m) => (
        <circle
          key={m.code}
          cx={m.x}
          cy={m.y}
          r={m.r}
          fill={m.color}
          fillOpacity={0.72}
          stroke="#fff"
          strokeWidth={1}
        >
          <title>{`${flag(m.code)} ${regionName(m.code)}: ${m.count} click${m.count === 1 ? "" : "s"}`}</title>
        </circle>
      ))}
    </svg>
  );
}
