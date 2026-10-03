import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Badge, Button, Card, CardContent, EmptyState, ErrorState } from "ui-common-components";
import { useAsyncData, useAsyncContentPhase } from "ui-common-hooks";
import AppShellLayout from "../components/AppShellLayout";
import { api } from "../api";
import type { LinkOut } from "../types";

const Ico = ({ children }: { children: ReactNode }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
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
        color: hover ? "var(--color-accent-sky-fg)" : "var(--color-text-secondary)",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

function CopyIconBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconBtn
      label={copied ? "Copied!" : "Copy link"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? (
        <Ico>
          <polyline points="20 6 9 17 4 12" />
        </Ico>
      ) : (
        <Ico>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </Ico>
      )}
    </IconBtn>
  );
}

// One QR card row per link — the QR encodes the short_url, so scans are tracked in analytics.
function LinkQrCard({ link, onAnalytics }: { link: LinkOut; onAnalytics: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link.short_url, { width: 180, margin: 1 })
      .then((d) => alive && setQr(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [link.short_url]);

  return (
    <Card variant="elevated" elevation="sm" style={{ borderRadius: 14 }}>
      <CardContent>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={qr || undefined}
            alt={`QR code for ${link.short_url}`}
            width={76}
            height={76}
            style={{
              minWidth: 76,
              borderRadius: 10,
              background: "#fff",
              border: "1px solid var(--color-border-subtle)",
              padding: 4,
              visibility: qr ? "visible" : "hidden",
            }}
          />

          <div style={{ flex: 1, minWidth: 180, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {link.folder ? (
                <Badge variant="neutral" tone="soft" shape="pill" size="sm">
                  {link.folder}
                </Badge>
              ) : (link.tags?.length ? (
                <Badge variant="info" tone="soft" shape="pill" size="sm">
                  {link.tags[0]}
                </Badge>
              ) : (
                <Badge variant="neutral" tone="soft" shape="pill" size="sm">
                  Link
                </Badge>
              ))}
              <a href={link.short_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                {link.short_url}
              </a>
            </div>
            <div
              style={{
                color: "var(--color-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 480,
              }}
            >
              ↳ {link.original_url}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              {link.click_count} scans · {new Date(link.created_at).toLocaleDateString()}
            </div>
          </div>

          {/* actions: copy · analytics · download */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <CopyIconBtn text={link.short_url} />
            <IconBtn label="View analytics" onClick={onAnalytics}>
              <Ico>
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </Ico>
            </IconBtn>
            {qr && (
              <a href={qr} download={`linksnip-${link.short_code}.png`} style={{ textDecoration: "none" }}>
                <Button variant="outlinePrimary" size="sm">
                  Download
                </Button>
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QRCodes() {
  const navigate = useNavigate();
  const { data, loading, error } = useAsyncData("links-qr", () => api.listLinks());
  // Only links created with the "Generate a QR Code" toggle on.
  const qrLinks = (data ?? []).filter((l) => l.has_qr);
  const { phase } = useAsyncContentPhase({ items: qrLinks, loading, error, requireNetwork: true });

  return (
    <AppShellLayout title="QR Codes" activeItemId="qr">
      <div style={{ padding: 24, display: "grid", gap: 12, maxWidth: 900, margin: "0 auto" }}>
        {phase === "loading" && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>Loading…</div>
        )}

        {(phase === "offline" || phase === "error") && (
          <ErrorState
            title={phase === "offline" ? "You're offline" : "Couldn't load your QR codes"}
            description={error instanceof Error ? error.message : undefined}
            tone={phase === "error" ? "danger" : undefined}
          />
        )}

        {phase === "empty" && (
          <EmptyState
            title="No QR codes yet"
            description="Create a link with the “Generate a QR Code” toggle on — it'll show up here."
            action={
              <Button variant="primary" onClick={() => navigate("/dashboard/new")}>
                Create link
              </Button>
            }
          />
        )}

        {phase === "ready" &&
          qrLinks.map((link) => (
            <LinkQrCard key={link.id} link={link} onAnalytics={() => navigate(`/dashboard/links/${link.id}`)} />
          ))}
      </div>
    </AppShellLayout>
  );
}
