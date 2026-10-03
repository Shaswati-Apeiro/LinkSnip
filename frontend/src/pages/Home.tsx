import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  GradientText,
  Badge,
} from "ui-common-components";
import { AreaChart, BarChart } from "ui-common-components/charts";
import ShortenForm from "../components/ShortenForm";
import CopyButton from "../components/CopyButton";
import BrandLogo from "../components/BrandLogo";
import { useAuth } from "../auth";
import type { LinkOut } from "../types";

const HERO_GRADIENT =
  "linear-gradient(135deg, var(--color-accent-lavender-40) 0%, var(--color-accent-sky-40) 100%)";

// Static demo data — a visual preview of the analytics feature (not real user data).
const CHART_DATA = [
  { day: "Mon", clicks: 42 },
  { day: "Tue", clicks: 88 },
  { day: "Wed", clicks: 71 },
  { day: "Thu", clicks: 134 },
  { day: "Fri", clicks: 96 },
  { day: "Sat", clicks: 168 },
  { day: "Sun", clicks: 210 },
];

const FEATURES = [
  { icon: "🏷️", tag: "naming", title: "Custom alias", desc: "linksnip.io/diwali-sale beats /x7Kq2f — a name people remember and trust." },
  { icon: "⏰", tag: "timing", title: "Set an expiry", desc: "Pick a date — the link retires itself when the offer ends." },
  { icon: "🎯", tag: "control", title: "Cap the clicks", desc: "Limit a link to 50, 500, or any number of opens." },
];

const PAGE_BG =
  "radial-gradient(1100px 520px at 50% -12%, var(--color-accent-lavender-10), transparent 60%), " +
  "radial-gradient(820px 460px at 88% 4%, var(--color-accent-sky-10), transparent 55%), " +
  "var(--color-bg-subtle, #f6f7f9)";

export default function Home() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [result, setResult] = useState<LinkOut | null>(null);

  // Home is anonymous-only — logged-in users go straight to their dashboard.
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 24px",
          maxWidth: 1040,
          margin: "0 auto",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
          <BrandLogo size={24} /> LinkSnip
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
            Log in
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate("/auth")}>
            Sign up free
          </Button>
        </div>
      </header>

      {/* ── Section 1: hero ── */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px 8px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 28,
            alignItems: "center",
          }}
        >
          <div>
            <Badge variant="primary" tone="soft" shape="pill" dot>
              Free URL shortener
            </Badge>
            <GradientText
              as="h1"
              gradient={HERO_GRADIENT}
              style={{
                display: "block",
                fontSize: 46,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                margin: "14px 0 12px",
              }}
            >
              Shorten. Share. Track.
            </GradientText>
            <p style={{ margin: 0, fontSize: 17, color: "var(--color-text-secondary)", maxWidth: 460 }}>
              LinkSnip turns long, messy URLs into short, shareable links — and shows you exactly how
              they perform with built-in click analytics.
            </p>
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-secondary)" }}>
              ⚡ Instant &nbsp;·&nbsp; 📊 Click analytics &nbsp;·&nbsp; 🎯 Custom aliases
            </div>
            <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => navigate("/auth")}>
                Get started
              </Button>
              <Button variant="outlinePrimary" onClick={() => navigate("/auth")}>
                Log in
              </Button>
            </div>
          </div>

          <Card variant="elevated" elevation="lg" style={{ borderRadius: 16 }}>
            <CardHeader>
              <CardTitle>Your link analytics</CardTitle>
              <CardDescription>A preview of what you get after signing in.</CardDescription>
            </CardHeader>
            <CardContent>
              <AreaChart
                data={CHART_DATA}
                xAxisKey="day"
                series={[{ dataKey: "clicks", name: "Clicks" }]}
                curve="monotone"
                width="100%"
                height={200}
                showLegend={false}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <Badge variant="success" tone="soft" shape="pill">1.2k clicks</Badge>
                <Badge variant="info" tone="soft" shape="pill">Top: Mobile</Badge>
                <Badge variant="neutral" tone="soft" shape="pill">3 referrers</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Section 2: shortener band — "Paste. Snip. Share." ── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 8px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <Badge variant="primary" tone="soft" shape="pill">no login needed</Badge>
          <h2 style={{ margin: "12px 0 8px", fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Paste. <GradientText as="span" gradient={HERO_GRADIENT}>Snip.</GradientText> Share.
          </h2>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Drop any long URL below and get a short link in under a second — free for everyone.
          </p>
        </div>

        <Card variant="elevated" elevation="lg" style={{ borderRadius: 16, boxShadow: "0 24px 60px rgba(20,30,60,0.16)" }}>
          <CardContent>
            <ShortenForm
              inline
              submitLabel="✂️ Snip it"
              canAlias={false}
              showAdvanced={false}
              onCreated={setResult}
            />
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
              Free &amp; instant for everyone. Basic snips need no account.
            </p>

            {result && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border-subtle)", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                  Snipped from{" "}
                  <span style={{ textDecoration: "line-through" }}>{result.original_url}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                  <a href={result.short_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 16 }}>
                    {result.short_url}
                  </a>
                  <CopyButton text={result.short_url} />
                  <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                    Snip another
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Section 3: features band — "Your links, your rules." ── */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <Badge variant="primary" tone="soft" shape="pill">free account perks</Badge>
          <h2 style={{ margin: "12px 0 6px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em" }}>
            Your links, your rules.
          </h2>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Create a free account and every snip becomes yours to name, time, limit and measure.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <Card key={f.title} variant="bordered" style={{ borderRadius: 14 }}>
              <CardContent>
                <Badge variant="neutral" tone="soft" shape="pill" size="sm">{f.tag}</Badge>
                <div style={{ fontSize: 26, margin: "10px 0 6px" }}>{f.icon}</div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{f.desc}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* featured: See every click */}
        <Card variant="elevated" elevation="lg" style={{ borderRadius: 16, marginTop: 16 }}>
          <CardContent>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 24,
                alignItems: "center",
              }}
            >
              <div>
                <Badge variant="neutral" tone="soft" shape="pill" size="sm">insights</Badge>
                <div style={{ fontSize: 26, margin: "10px 0 6px" }}>📊</div>
                <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>See every click</h3>
                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
                  A live log of each visit — where it came from, the device, OS &amp; browser, and the
                  city it was opened in. Know your audience, not just your count.
                </p>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  <span>linksnip.io/<strong>diwali-sale</strong></span>
                  <span>last 7 days</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                  1,248 <span style={{ fontSize: 13, fontWeight: 400, color: "var(--color-text-secondary)" }}>clicks</span>
                </div>
                <BarChart
                  data={CHART_DATA}
                  xAxisKey="day"
                  series={[{ dataKey: "clicks", name: "Clicks" }]}
                  width="100%"
                  height={140}
                  showLegend={false}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <Badge variant="info" tone="soft" shape="pill">instagram.com 41%</Badge>
                  <Badge variant="success" tone="soft" shape="pill">Android · Chrome 63%</Badge>
                  <Badge variant="neutral" tone="soft" shape="pill">Mumbai, IN 318</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
