import { useEffect, useState } from "react";
import { Button, Input, DatePicker, Switch } from "ui-common-components";
import TagField from "./TagField";
import { api } from "../api";
import type { LinkOut, LinkUpdate } from "../types";

// ISO (YYYY-MM-DD) → DD-MM-YYYY for the DatePicker's native display format.
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// DatePicker value is DD-MM-YYYY (its stable default); convert to ISO for the API.
function toISO(s: string): string {
  const t = (s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export default function EditLinkForm({
  link,
  onSaved,
  onCancel,
}: {
  link: LinkOut;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [originalUrl, setOriginalUrl] = useState(link.original_url);
  const [alias, setAlias] = useState(link.short_code);
  const [expiry, setExpiry] = useState(toDateInput(link.expires_at));
  const [clickLimit, setClickLimit] = useState(link.click_limit != null ? String(link.click_limit) : "");
  const [tags, setTags] = useState<string[]>(link.tags ?? []);
  const [folder, setFolder] = useState(link.folder ?? "");
  const [folders, setFolders] = useState<string[]>([]);
  const [hasQr, setHasQr] = useState(link.has_qr);
  const [passwordEnabled, setPasswordEnabled] = useState(link.has_password);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listFolders().then((r) => setFolders(r.folders)).catch(() => {});
  }, []);

  async function save() {
    setError(null);
    setAliasError(null);
    setSaving(true);
    try {
      const pwProto: LinkUpdate = {
        original_url: originalUrl.trim() || undefined,
        alias: alias.trim() || undefined,
        expires_at: expiry ? `${toISO(expiry)}T23:59:59` : null,
        click_limit: clickLimit ? Number(clickLimit) : null,
        tags: tags,
        folder: folder.trim() || null,
        has_qr: hasQr,
      };
      const pwTrim = password.trim();
      if (!passwordEnabled && link.has_password) {
        // Disabling protection: "" clears the stored hash.
        pwProto.password = "";
      } else if (passwordEnabled && pwTrim) {
        // Enabling (first password) or changing to a new one.
        pwProto.password = pwTrim;
      }
      // (Enabled but no typed password, and already protected => leave unchanged.)
      await api.updateLink(link.id, pwProto);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/alias/i.test(msg)) setAliasError(msg);
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Input label="Destination URL" type="url" value={originalUrl} onChange={setOriginalUrl} fullWidth />
      <Input
        label="Custom alias"
        value={alias}
        onChange={setAlias}
        status={aliasError ? "error" : undefined}
        errorMessage={aliasError ?? undefined}
        fullWidth
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
        <DatePicker label="Expiry date" dateFormat="DD-MM-YYYY" value={expiry} onChange={setExpiry} size="md" fullWidth />
        <Input label="Click limit" type="number" value={clickLimit} onChange={setClickLimit} size="md" fullWidth />
      </div>
      <TagField tags={tags} onTagsChange={setTags} folder={folder} onFolderChange={setFolder} folders={folders} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderTop: "1px solid var(--color-border-subtle)",
          borderBottom: "1px solid var(--color-border-subtle)",
          padding: "12px 0",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            🔳 QR Code
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Show this link on the QR Codes page — every scan is tracked in analytics.
          </div>
        </div>
        <Switch checked={hasQr} onCheckedChange={setHasQr} aria-label="Enable QR code" />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: "1px solid var(--color-border-subtle)",
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
          label={link.has_password ? "New password (leave blank to keep current)" : "Password"}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Set an access password"
          fullWidth
        />
      )}

      {error && (
        <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outlineSecondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={saving}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
