import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Switch,
  Button,
} from "ui-common-components";
import { useDebounce } from "ui-common-hooks";
import AppShellLayout from "../components/AppShellLayout";
import ShortenForm from "../components/ShortenForm";
import CopyButton from "../components/CopyButton";
import type { LinkOut } from "../types";

export default function CreateLink() {
  const navigate = useNavigate();
  const [qrEnabled, setQrEnabled] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [result, setResult] = useState<LinkOut | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Live preview of the typed URL (debounced) while the QR toggle is on.
  const debouncedUrl = useDebounce(urlValue, 300);
  useEffect(() => {
    if (!qrEnabled) {
      setPreviewDataUrl("");
      return;
    }
    // Empty field → show a sample QR so a live preview is always visible.
    const target = debouncedUrl.trim() || "https://linksnip.io";
    let alive = true;
    QRCode.toDataURL(target, { width: 200, margin: 1 })
      .then((d) => alive && setPreviewDataUrl(d))
      .catch(() => alive && setPreviewDataUrl(""));
    return () => {
      alive = false;
    };
  }, [qrEnabled, debouncedUrl]);

  // On create: the final QR encodes the SHORT URL (scanning it hits the redirect →
  // the click is logged in analytics, no backend change needed).
  async function handleCreated(link: LinkOut) {
    setResult(link);
    if (qrEnabled) {
      try {
        setQrDataUrl(await QRCode.toDataURL(link.short_url, { width: 240, margin: 1 }));
      } catch {
        setQrDataUrl("");
      }
    }
  }

  function reset() {
    setResult(null);
    setQrDataUrl("");
    setUrlValue("");
  }

  const showQr = qrEnabled && !!qrDataUrl;

  return (
    <AppShellLayout title="Create link" activeItemId="new">
      <div style={{ padding: 24, maxWidth: 620, margin: "0 auto", display: "grid", gap: 16 }}>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            justifySelf: "start",
          }}
        >
          ← Back to My Links
        </button>

        <Card variant="elevated" elevation="lg" style={{ borderRadius: 16 }}>
          <CardHeader>
            <CardTitle>Create a short link</CardTitle>
            <CardDescription>Paste a link to shorten — add a custom alias, or set more options in Advanced settings.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <ShortenForm
                canAlias
                showAdvanced
                submitLabel="Create your link"
                qrEnabled={qrEnabled}
                onUrlChange={setUrlValue}
                onCreated={handleCreated}
                footer={
                  <div
                    style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 16, display: "grid", gap: 14 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          🔳 Generate a QR Code
                        </div>
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                          Turn on before creating — every scan is tracked in analytics.
                        </div>
                      </div>
                      <Switch checked={qrEnabled} onCheckedChange={setQrEnabled} aria-label="Generate a QR Code" />
                    </div>

                    {qrEnabled && (
                      <div
                        style={{
                          display: "grid",
                          justifyItems: "center",
                          gap: 8,
                          textAlign: "center",
                          background: "var(--color-mist-40)",
                          borderRadius: 12,
                          padding: 16,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-secondary)" }}>Preview</div>
                        <img
                          src={previewDataUrl || undefined}
                          alt="QR code preview"
                          width={150}
                          height={150}
                          style={{
                            borderRadius: 8,
                            background: "#fff",
                            padding: 6,
                            minHeight: 150,
                            visibility: previewDataUrl ? "visible" : "hidden",
                          }}
                        />
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 240 }}>
                          {debouncedUrl.trim()
                            ? "Live preview — your short-link QR is ready after creating."
                            : "Create a QR Code to connect with your audience offline."}
                        </div>
                      </div>
                    )}
                  </div>
                }
              />
            ) : (
              <div style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>✅ Your short link</div>
                <a href={result.short_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 16 }}>
                  {result.short_url}
                </a>

                {showQr && (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${result.short_url}`}
                    width={220}
                    height={220}
                    style={{ borderRadius: 12, border: "1px solid var(--color-border-subtle)" }}
                  />
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <CopyButton text={result.short_url} label="Copy link" />
                  {showQr && (
                    <a href={qrDataUrl} download={`linksnip-${result.short_code}.png`} style={{ textDecoration: "none" }}>
                      <Button variant="primary" size="sm">
                        Download QR
                      </Button>
                    </a>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/dashboard/links/${result.id}`)}>
                    View analytics
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Create another
                  </Button>
                </div>

                {showQr && (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 320 }}>
                    Scanning the QR opens this short link — counted in analytics like any click.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellLayout>
  );
}
