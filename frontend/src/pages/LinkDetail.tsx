import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  Modal,
  AlertDialog,
  EmptyState,
  ErrorState,
} from "ui-common-components";
import { BarChart } from "ui-common-components/charts";
import { useAsyncData } from "ui-common-hooks";
import AppShellLayout from "../components/AppShellLayout";
import EditLinkForm from "../components/EditLinkForm";
import WorldMap, { flag, regionName } from "../components/WorldMap";
import { api } from "../api";
import type { CountItem } from "../types";

// Tiny inline SVG wrapper (Lucide-style, inherits currentColor) — keeps the header markup compact.
const Ico = ({ s = 16, children }: { s?: number; children: ReactNode }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

// Subtle meta pill used under the title (clicks / date / tag).
const Chip = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12.5,
      color: "var(--color-text-secondary)",
      background: "var(--color-mist-40)",
      padding: "4px 10px",
      borderRadius: 999,
    }}
  >
    {children}
  </span>
);

// Copy-to-clipboard glyph next to the short link (flashes a check on success).
function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied!" : "Copy link"}
      title={copied ? "Copied!" : "Copy link"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 2,
        display: "inline-flex",
        color: copied ? "var(--color-accent-mint-fg)" : "var(--color-accent-sky-fg)",
      }}
    >
      {copied ? (
        <Ico s={15}>
          <polyline points="20 6 9 17 4 12" />
        </Ico>
      ) : (
        <Ico s={15}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </Ico>
      )}
    </button>
  );
}

// Ghost icon button for the right-side header actions.
function HeaderIconBtn({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const active = danger ? "var(--color-accent-rose-fg)" : "var(--color-accent-sky-fg)";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 34,
        height: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 9,
        cursor: "pointer",
        background: hover ? "var(--color-mist-40)" : "transparent",
        color: hover ? active : "var(--color-text-secondary)",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

// ---- analytics dashboard helpers (Image-#10 style) ----

// Panel header glyphs.
const IconBars = () => (
  <Ico s={16}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Ico>
);
const IconGlobe = () => (
  <Ico s={16}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
  </Ico>
);
const IconDevice = () => (
  <Ico s={16}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </Ico>
);
const IconTraffic = () => (
  <Ico s={16}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </Ico>
);
const IconBrowser = () => (
  <Ico s={16}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </Ico>
);
const IconPin = () => (
  <Ico s={16}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </Ico>
);

// Referrer URL -> a short, readable source label.
function refLabel(raw: string): string {
  if (!raw || raw === "unknown") return "Direct / unknown";
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

// Day-by-day clicks for a single month, zero-filled. Length auto-adjusts to the
// month (28/29/30/31). `raw` labels are "YYYY-MM-DD" from the backend.
function buildMonthSeries(raw: CountItem[], year: number, month: number) {
  const counts = new Map<string, number>();
  for (const c of raw) counts.set(c.label, (counts.get(c.label) ?? 0) + c.count);

  const days = new Date(year, month + 1, 0).getDate(); // 28/29/30/31
  const mm = String(month + 1).padStart(2, "0");
  const out: { bucket: string; clicks: number }[] = [];
  for (let d = 1; d <= days; d++) {
    const key = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    out.push({ bucket: String(d), clicks: counts.get(key) ?? 0 });
  }
  return out;
}

// Ranked horizontal %-bars (Geographic / Devices / Traffic / Browsers).
function RankBars({
  items,
  color,
}: {
  items: { key: string; label: string; left?: ReactNode; count: number }[];
  color: string;
}) {
  if (items.length === 0)
    return <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>No data yet.</div>;
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div style={{ display: "grid", gap: 11 }}>
      {items.map((it) => (
        <div key={it.key}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              marginBottom: 5,
              gap: 8,
            }}
          >
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", minWidth: 0 }}>
              {it.left}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            </span>
            <span style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {((it.count / total) * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--color-mist-40)", overflow: "hidden" }}>
            <div
              style={{ width: `${(it.count / max) * 100}%`, height: "100%", background: color, borderRadius: 6, transition: "width 200ms ease" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Card with a colored icon chip in the header.
function Panel({
  icon,
  title,
  accent = "var(--color-accent-sky-fg)",
  right,
  children,
}: {
  icon: ReactNode;
  title: string;
  accent?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="bordered" style={{ borderRadius: 14 }}>
      <CardContent>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--color-mist-40)",
              color: accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
          {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const LegendDot = ({ color, children }: { color: string; children: ReactNode }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--color-text-secondary)" }}>
    <span style={{ width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0 }} />
    {children}
  </span>
);

export default function LinkDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const linkId = Number(id);

  // useAsyncData has no refetch(); bump the key to re-run the fetcher.
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);
  const { data, loading, error } = useAsyncData(`link-${linkId}-${reload}`, () => api.getLink(linkId));
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const { blob, filename } = await api.exportCsv(data.link.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Surface download failures unobtrusively.
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // Accesses-over-time controls (client-side only).
  // Day-by-day view of one month; corner arrows switch months.
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const series = useMemo(
    () =>
      data ? buildMonthSeries(data.clicks_over_time, monthDate.getFullYear(), monthDate.getMonth()) : [],
    [data, monthDate],
  );
  const now = new Date();
  const isCurrentMonth =
    monthDate.getFullYear() === now.getFullYear() && monthDate.getMonth() === now.getMonth();
  const shiftMonth = (delta: number) =>
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  const monthLabel = monthDate.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  // Detected countries (drop "unknown"/local) for the always-visible map.
  const geoDetected = useMemo(
    () =>
      data
        ? data.countries
            .filter((c) => c.label !== "unknown")
            .map((c) => ({ code: c.label, count: c.count }))
        : [],
    [data],
  );

  // Chart width: fill the card, but grow (→ horizontal scroll) when there are many buckets.
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const measure = () => setWrapW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);
  const chartW = Math.max(wrapW || 640, series.length * 34);

  return (
    <AppShellLayout title="Link analytics" activeItemId="links">
      <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 1120, margin: "0 auto" }}>
        <Button variant="link" size="sm" onClick={() => navigate("/dashboard")}>
          ← Back to links
        </Button>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>Loading…</div>
        )}

        {error && (
          <ErrorState
            title="Couldn't load analytics"
            description={error instanceof Error ? error.message : undefined}
            onRetry={refetch}
            tone="danger"
          />
        )}

        {data && (
          <>
            <Card variant="elevated" elevation="sm" style={{ borderRadius: 16 }}>
              <CardContent>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  {/* link icon box */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: 42,
                      height: 42,
                      borderRadius: 11,
                      background: "var(--color-mist-40)",
                      color: "var(--color-accent-sky-fg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ico s={20}>
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </Ico>
                  </div>

                  {/* title + short link + destination + meta */}
                  <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>/{data.link.short_code}</div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      <a
                        href={data.link.short_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--color-accent-sky-fg)",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {data.link.short_url}
                      </a>
                      <CopyInline text={data.link.short_url} />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <span style={{ flexShrink: 0, display: "inline-flex" }}>
                        <Ico s={15}>
                          <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                          <polyline points="15 10 20 15 15 20" />
                        </Ico>
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {data.link.original_url}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      <Chip>
                        <Ico s={14}>
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </Ico>
                        {data.link.click_count} clicks
                      </Chip>
                      <Chip>
                        <Ico s={14}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </Ico>
                        {new Date(data.link.created_at).toLocaleDateString()}
                        {data.link.expires_at
                          ? ` · exp ${new Date(data.link.expires_at).toLocaleDateString()}`
                          : ""}
                        {data.link.click_limit != null ? ` · limit ${data.link.click_limit}` : ""}
                      </Chip>
                      <Chip>
                        <Ico s={14}>
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                          <line x1="7" y1="7" x2="7.01" y2="7" />
                        </Ico>
                        {(data.link.tags?.length ?? 0) > 0
                          ? data.link.tags.join(", ")
                          : "No tags"}
                        {data.link.folder ? ` · ${data.link.folder}` : ""}
                      </Chip>
                    </div>
                  </div>

                  {/* right-side actions */}
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <HeaderIconBtn label={exporting ? "Exporting…" : "Export CSV"} onClick={exportCsv}>
                      <Ico s={17}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </Ico>
                    </HeaderIconBtn>
                    <HeaderIconBtn label="Edit" onClick={() => setEditOpen(true)}>
                      <Ico s={17}>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </Ico>
                    </HeaderIconBtn>
                    <HeaderIconBtn label="Delete" danger onClick={() => setConfirmDelete(true)}>
                      <Ico s={17}>
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </Ico>
                    </HeaderIconBtn>
                  </div>
                </div>
              </CardContent>
            </Card>

            {data.link.click_count === 0 ? (
              <EmptyState
                title="No clicks yet"
                description="Share your short link — analytics will appear here as people click."
              />
            ) : (
              <>
                {/* Accesses over time */}
                <Card variant="bordered" style={{ borderRadius: 14 }}>
                  <CardContent>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: "var(--color-mist-40)",
                            color: "var(--color-accent-sky-fg)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <IconBars />
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>Accesses Over Time</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                            {monthLabel} · by day
                          </div>
                        </div>
                      </div>
                      {/* month switcher */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          type="button"
                          aria-label="Previous month"
                          onClick={() => shiftMonth(-1)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: "1px solid var(--color-mist-80)",
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--color-text-secondary)",
                            fontSize: 16,
                            lineHeight: 1,
                          }}
                        >
                          ‹
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: "center" }}>
                          {monthLabel}
                        </span>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() => shiftMonth(1)}
                          disabled={isCurrentMonth}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: "1px solid var(--color-mist-80)",
                            background: "transparent",
                            cursor: isCurrentMonth ? "not-allowed" : "pointer",
                            opacity: isCurrentMonth ? 0.4 : 1,
                            color: "var(--color-text-secondary)",
                            fontSize: 16,
                            lineHeight: 1,
                          }}
                        >
                          ›
                        </button>
                      </div>
                    </div>

                    {/* Fills the card; too many buckets → grows and scrolls horizontally. */}
                    <div ref={chartWrapRef} style={{ overflowX: "auto", overflowY: "hidden" }}>
                      <BarChart
                        data={series}
                        xAxisKey="bucket"
                        series={[{ dataKey: "clicks", name: "Clicks" }]}
                        colors={["#1a6bb5"]}
                        radius={[6, 6, 0, 0]}
                        width={chartW}
                        height={280}
                        showGrid
                        showTooltip
                        showLegend={false}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* ranked breakdown panels */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                  <Panel icon={<IconGlobe />} title="Geographic Distribution" accent="var(--color-accent-mint-fg)">
                    <RankBars
                      color="var(--color-accent-mint-fg)"
                      items={data.countries
                        .filter((c) => c.label !== "unknown")
                        .map((c) => ({
                          key: c.label,
                          left: <span style={{ fontSize: 15 }}>{flag(c.label)}</span>,
                          label: regionName(c.label),
                          count: c.count,
                        }))}
                    />
                  </Panel>

                  <Panel icon={<IconDevice />} title="Device Types" accent="var(--color-accent-lavender-fg)">
                    <RankBars
                      color="var(--color-accent-lavender-fg)"
                      items={data.devices.map((d) => ({ key: d.label, label: d.label, count: d.count }))}
                    />
                  </Panel>

                  <Panel icon={<IconTraffic />} title="Traffic Sources" accent="var(--color-accent-sky-fg)">
                    <RankBars
                      color="var(--color-accent-sky-fg)"
                      items={data.top_referrers.map((r, i) => ({
                        key: `${r.label}-${i}`,
                        label: refLabel(r.label),
                        count: r.count,
                      }))}
                    />
                  </Panel>

                  <Panel icon={<IconBrowser />} title="Browsers" accent="var(--color-accent-amber-fg)">
                    <RankBars
                      color="var(--color-accent-amber-fg)"
                      items={data.browsers.map((b) => ({ key: b.label, label: b.label, count: b.count }))}
                    />
                  </Panel>
                </div>

              </>
            )}

            {/* Visitors by Region — ALWAYS shown: empty base map until a public-IP click is geolocated. */}
            <Panel
              icon={<IconPin />}
              title="Visitors by Region"
              accent="var(--color-accent-rose-fg)"
              right={
                (data.countries.find((c) => c.label === "unknown")?.count ?? 0) > 0 ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {data.countries.find((c) => c.label === "unknown")?.count} local/unknown
                  </span>
                ) : undefined
              }
            >
              <WorldMap data={geoDetected} />
              {geoDetected.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, justifyContent: "center" }}>
                  <LegendDot color="var(--color-accent-mint-fg)">High (≥20%)</LegendDot>
                  <LegendDot color="var(--color-accent-sky-fg)">Good (10–19%)</LegendDot>
                  <LegendDot color="var(--color-accent-amber-fg)">Medium (5–9%)</LegendDot>
                  <LegendDot color="var(--color-accent-rose-fg)">Low (&lt;5%)</LegendDot>
                </div>
              ) : (
                <div style={{ marginTop: 10, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
                  No region detected yet — the map fills in as clicks arrive from public IPs.
                </div>
              )}
            </Panel>

            <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit link" hideFooter>
              <EditLinkForm
                link={data.link}
                onCancel={() => setEditOpen(false)}
                onSaved={() => {
                  setEditOpen(false);
                  refetch();
                }}
              />
            </Modal>

            <AlertDialog
              isOpen={confirmDelete}
              onClose={() => setConfirmDelete(false)}
              title="Delete this link?"
              description={`${data.link.short_url} will stop working. This cannot be undone.`}
              destructive
              confirmText="Delete"
              onConfirm={async () => {
                await api.deleteLink(data.link.id);
                navigate("/dashboard");
              }}
            />
          </>
        )}
      </div>
    </AppShellLayout>
  );
}
