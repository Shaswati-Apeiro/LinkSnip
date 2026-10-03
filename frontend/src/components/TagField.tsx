import { useState, type KeyboardEvent } from "react";
import { Input, Select } from "ui-common-components";
import { TAG_PRESETS } from "../types";

// Small removable chip used for the selected tags / folder suggestions.
function Chip({
  label,
  onRemove,
  accent = false,
}: {
  label: string;
  onRemove?: () => void;
  accent?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        padding: "3px 8px",
        borderRadius: 999,
        background: accent ? "var(--color-accent-primary-subtle)" : "var(--color-mist-40)",
        color: accent ? "var(--color-accent-primary-fg)" : "var(--color-text-primary)",
      }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
            color: "inherit",
            opacity: 0.7,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// Renders selected tags as removable chips plus a text input to add new ones
// (Enter or comma adds). Preset tags are offered as toggle suggestions.
function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft) {
        add(draft);
        setDraft("");
      }
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 26 }}>
        {tags.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No tags</span>
        ) : (
          tags.map((t) => (
            <Chip
              key={t}
              label={t}
              accent
              onRemove={() => onChange(tags.filter((x) => x !== t))}
            />
          ))
        )}
      </div>
      <Input
        placeholder="Type a tag and press Enter…"
        value={draft}
        onChange={setDraft}
        onKeyDown={onKeyDown}
        size="sm"
        fullWidth
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TAG_PRESETS.filter((p) => !tags.includes(p)).map((p) => (
          <span
            key={p}
            onClick={() => add(p)}
            style={{
              fontSize: 12,
              padding: "2px 10px",
              borderRadius: 999,
              cursor: "pointer",
              border: "1px solid var(--color-border-subtle)",
              color: "var(--color-text-secondary)",
            }}
          >
            + {p}
          </span>
        ))}
      </div>
    </div>
  );
}

// Folder selector: when folders already exist show a dropdown (existing folders
// for reference + a "+ New folder…" choice that reveals a text input). When no
// folders exist yet, only the text input is shown so the first folder can be created.
function FolderInput({
  value,
  onChange,
  folders,
}: {
  value: string;
  onChange: (folder: string) => void;
  folders: string[];
}) {
  const [creating, setCreating] = useState(() => !!value && !folders.includes(value));
  const existing = Array.from(new Set([value, ...folders].filter((f) => f !== undefined && f !== "")));

  if (existing.length === 0 || creating) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <Input
          placeholder="Folder name…"
          value={value}
          onChange={onChange}
          size="sm"
          fullWidth
        />
        {!creating && folders.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setCreating(false)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--color-accent-sky-fg)",
              }}
            >
              ← Pick an existing folder
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Select
        size="sm"
        fullWidth
        value={existing.includes(value) ? value : ""}
        onValueChange={(v) => {
          if (v === "__new__") {
            setCreating(true);
            onChange("");
          } else {
            onChange(v);
            setCreating(false);
          }
        }}
        options={[
          { value: "", label: "No folder" },
          ...existing.map((f) => ({ value: f, label: f })),
          { value: "__new__", label: "＋ New folder…" },
        ]}
      />
      {value && folders.includes(value) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 12.5,
              color: "var(--color-accent-sky-fg)",
            }}
          >
            Rename / type new folder…
          </button>
        </div>
      )}
    </div>
  );
}

// Tag + folder editor used in create/edit forms. Tags are multiple; a link
// belongs to exactly one folder (or none).
export default function TagField({
  tags,
  onTagsChange,
  folder = "",
  onFolderChange,
  folders = [],
}: {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  folder?: string;
  onFolderChange: (folder: string) => void;
  /** Existing folder names across the user's links, offered as quick picks. */
  folders?: string[];
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, marginBottom: 6, color: "var(--color-text-secondary)" }}>
          Tags (optional) — add one or more
        </div>
        <TagInput tags={tags} onChange={onTagsChange} />
      </div>
      <div>
        <div style={{ fontSize: 13, marginBottom: 6, color: "var(--color-text-secondary)" }}>
          Folder (optional)
        </div>
        <FolderInput value={folder} onChange={onFolderChange} folders={folders} />
      </div>
    </div>
  );
}