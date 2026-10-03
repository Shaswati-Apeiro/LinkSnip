import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Input,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "ui-common-components";
import TagField from "./TagField";
import ShieldIcon from "./ShieldIcon";
import { api } from "../api";
import type { LinkOut } from "../types";

interface Props {
  /** Custom alias flow only shows for logged-in users (login-gated feature). */
  canAlias: boolean;
  /** Expiry + click-limit + tag (and the QR footer) — hidden on the public Home page. */
  showAdvanced?: boolean;
  /** Render URL input + submit button in one row (used by the Home shortener band). */
  inline?: boolean;
  /** Submit button label. */
  submitLabel?: string;
  /** Optional content (e.g. QR toggle) rendered inside the advanced settings section. */
  footer?: ReactNode;
  /** Fires as the Long URL field changes (used for a live QR preview). */
  onUrlChange?: (url: string) => void;
  /** Persisted so the QR Codes page can show only links created with a QR. */
  qrEnabled?: boolean;
  onCreated: (link: LinkOut) => void;
}

export default function ShortenForm({
  canAlias,
  showAdvanced = true,
  inline = false,
  submitLabel = "Shorten",
  footer,
  onUrlChange,
  qrEnabled = false,
  onCreated,
}: Props) {
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [mode, setMode] = useState("plain"); // "plain" | "alias"
  const [expiry, setExpiry] = useState(""); // YYYY-MM-DD
  const [clickLimit, setClickLimit] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [aliasHintOpen, setAliasHintOpen] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!canAlias) return;
    api.listFolders().then((r) => setFolders(r.folders)).catch(() => {});
  }, [canAlias]);

  async function submit() {
    setError(null);
    setAliasError(null);
    if (!url.trim()) {
      setError("Please enter a URL to shorten.");
      return;
    }
    setSubmitting(true);
    try {
      const link = await api.shorten({
        url: url.trim(),
        alias: canAlias && mode === "alias" && alias.trim() ? alias.trim() : null,
        expires_at: expiry ? `${expiry}T23:59:59` : null,
        click_limit: clickLimit ? Number(clickLimit) : null,
        tags: tags,
        folder: folder.trim() || null,
        has_qr: qrEnabled,
        password: passwordEnabled && password.trim() ? password.trim() : null,
      });
      setUrl("");
      setAlias("");
      setMode("plain");
      setExpiry("");
      setClickLimit("");
      setTags([]);
      setFolder("");
      setPasswordEnabled(false);
      setPassword("");
      onCreated(link);
    } catch (e) {
      // Backend alias errors arrive as "Value error, Alias: …" — drop the pydantic wrapper.
      const msg = (e instanceof Error ? e.message : "Something went wrong").replace(/^Value error,\s*/i, "");
      if (/alias/i.test(msg)) setAliasError(msg);
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const urlField = (
    <Input
      label={inline ? undefined : "Long URL"}
      type="url"
      size={inline ? "lg" : undefined}
      placeholder="Paste a long link — https://example.com/really/long/path"
      value={url}
      onChange={(v) => {
        setUrl(v);
        onUrlChange?.(v);
      }}
      onPressEnter={submit}
      fullWidth
      required
    />
  );

  const submitBtn = (
    <Button variant="primary" onClick={submit} loading={submitting} disabled={submitting}>
      {submitLabel}
    </Button>
  );

  // Advanced settings live in a collapsible section so the primary flow stays simple.
  const advancedSection = (
    <Accordion
      type="single"
      collapsible
      variant="bordered"
      style={{ marginTop: 4 }}
    >
      <AccordionItem value="advanced">
        <AccordionTrigger>Advanced settings (optional)</AccordionTrigger>
        <AccordionContent>
          <div style={{ display: "grid", gap: 16, paddingTop: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
              <Input
                label="Expiry date (optional)"
                type="date"
                value={expiry}
                onChange={setExpiry}
                size="md"
                fullWidth
              />
              <Input
                label="Click limit (optional)"
                type="text"
                inputMode="numeric"
                validation="numeric"
                placeholder="e.g. 100"
                value={clickLimit}
                onChange={setClickLimit}
                size="md"
                fullWidth
              />
            </div>
            <TagField tags={tags} onTagsChange={setTags} folder={folder} onFolderChange={setFolder} folders={folders} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderTop: "1px solid var(--color-border-subtle)",
                padding: "12px 0",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  🔒 Password protection
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Require a password before this link opens.
                </div>
              </div>
              <Switch checked={passwordEnabled} onCheckedChange={setPasswordEnabled} aria-label="Enable password protection" />
            </div>
            {passwordEnabled && (
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Set an access password"
                fullWidth
              />
            )}
            {footer}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {inline ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 260px" }}>{urlField}</div>
          {submitBtn}
        </div>
      ) : (
        urlField
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--color-text-muted, #64748b)",
        }}
      >
        <ShieldIcon size={15} />
        <span>Links are scanned for malware &amp; phishing — unsafe links are blocked.</span>
      </div>

      {canAlias && !inline && (
        <Tabs
          value={mode}
          onValueChange={setMode}
          variant="segmented"
          listLayout="equal"
        >
          <TabsList ariaLabel="Choose how to shorten">
            <TabsTrigger value="plain">Shorten URL</TabsTrigger>
            <TabsTrigger value="alias">Use custom alias</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {canAlias && !inline && mode === "alias" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}>
            <span>Custom alias</span>
            <span
              aria-label="Custom alias help"
              role="img"
              onMouseEnter={() => setAliasHintOpen(true)}
              onMouseLeave={() => setAliasHintOpen(false)}
              onFocus={() => setAliasHintOpen(true)}
              onBlur={() => setAliasHintOpen(false)}
              tabIndex={0}
              style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: "help", color: "var(--color-accent-sky-fg)", fontWeight: 700 }}
            >
              &#9432;
              {aliasHintOpen && (
                <span
                  role="tooltip"
                  style={{
                    position: "absolute",
                    left: 22,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 50,
                    width: "max-content",
                    maxWidth: 260,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "var(--color-bg-surface)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-subtle)",
                    boxShadow: "var(--shadow-md, 0 4px 16px rgba(0,0,0,0.10))",
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "normal",
                  }}
                >
                  Give your link a friendly name people can read and remember (e.g.
                  diwali-sale) instead of a random string. Use letters, numbers and
                  hyphens — 3 to 30 characters.
                </span>
              )}
            </span>
          </div>
          <Input
            placeholder="my-sale"
            value={alias}
            onChange={setAlias}
            aria-label="Custom alias"
            fullWidth
          />
          {aliasError && (
            <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14, marginTop: 6 }}>
              {aliasError}
            </div>
          )}
        </div>
      )}

      {showAdvanced && !inline && advancedSection}

      {error && (
        <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14 }}>
          {error}
        </div>
      )}

      {!inline && submitBtn}
    </div>
  );
}