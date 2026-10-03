import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Table, type TableColumn } from "ui-common-components/table";
import {
  Button,
  AlertDialog,
  EmptyState,
  ErrorState,
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
  Select,
  Badge,
  Modal,
} from "ui-common-components";
import { useAsyncData, useAsyncContentPhase } from "ui-common-hooks";
import AppShellLayout from "../components/AppShellLayout";
import EditLinkForm from "../components/EditLinkForm";
import { api } from "../api";
import type { LinkOut } from "../types";

// Table rows need an index signature (Table<T extends Record<string, unknown>>).
type Row = LinkOut & Record<string, unknown>;

const isExpired = (l: LinkOut): boolean =>
  (!!l.expires_at && new Date(l.expires_at) < new Date()) ||
  (l.click_limit != null && l.click_count >= l.click_limit);

// Shared props for the inline row-action glyphs (Lucide-style, inherit currentColor).
const iconSvgProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const BarChartIcon = () => (
  <svg {...iconSvgProps}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const CopyIcon = () => (
  <svg {...iconSvgProps}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg {...iconSvgProps}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PencilIcon = () => (
  <svg {...iconSvgProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const TrashIcon = () => (
  <svg {...iconSvgProps}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

// One inline, ghost-style icon button for the row Actions column.
function IconAction({
  label,
  onClick,
  danger = false,
  iconColor,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  iconColor?: string;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const activeColor = danger ? "var(--color-accent-rose-fg)" : "var(--color-accent-sky-fg)";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        border: "none",
        background: hover ? "var(--color-theme-surface-hover)" : "transparent",
        color: iconColor ?? (hover ? activeColor : "var(--color-text-secondary)"),
        cursor: "pointer",
        borderRadius: 8,
        padding: 0,
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

// Copy-to-clipboard row action: shows a check + success color briefly after copying.
function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconAction
      label={copied ? "Copied!" : "Copy link"}
      iconColor={copied ? "var(--color-accent-mint-fg)" : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </IconAction>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  // useAsyncData has no refetch(); bump the key to re-run the fetcher.
  const [reload, setReload] = useState(0);
  const refetch = () => setReload((n) => n + 1);
  const { data, loading, error } = useAsyncData(`links-${reload}`, () => api.listLinks());
  const { phase } = useAsyncContentPhase({ items: data, loading, error, requireNetwork: true });

  const [deleteTarget, setDeleteTarget] = useState<LinkOut | null>(null);
  const [editTarget, setEditTarget] = useState<LinkOut | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const all = data ?? [];
  const expiredCount = all.filter(isExpired).length;
  const tagOptions = Array.from(new Set(all.flatMap((l) => l.tags ?? []).filter(Boolean)));
  const folderOptions = Array.from(new Set(all.map((l) => l.folder).filter((f): f is string => !!f)));
  const stats = [
    { key: "all", label: "Total links", value: all.length, color: "var(--color-accent-sky-fg)" },
    { key: "active", label: "Active", value: all.length - expiredCount, color: "var(--color-accent-mint-fg)" },
    { key: "expired", label: "Expired", value: expiredCount, color: "var(--color-accent-rose-fg)" },
  ];

  const filtered = all.filter((l) => {
    const statusOk =
      statusFilter === "all" ? true : statusFilter === "expired" ? isExpired(l) : !isExpired(l);
    const tagOk = tagFilter === "all" ? true : (l.tags ?? []).includes(tagFilter);
    const folderOk = folderFilter === "all" ? true : (l.folder ?? null) === folderFilter;
    return statusOk && tagOk && folderOk;
  });

  const selectedLinks = filtered.filter((l) => selectedKeys.includes(String(l.id)));

  async function confirmBulkDelete() {
    if (!selectedLinks.length || busyBulk) return;
    setBusyBulk(true);
    try {
      const res = await api.bulkDelete(selectedLinks.map((l) => l.id));
      const parts = [`Deleted ${res.deleted} link${res.deleted === 1 ? "" : "s"}.`];
      if (res.not_found.length) {
        parts.push(`${res.not_found.length} not found (may not belong to you).`);
      }
      setNotice(parts.join(" "));
      setSelectedKeys([]);
      setBulkDeleteOpen(false);
      refetch();
    } catch (e) {
      setNotice(e instanceof Error ? `Delete failed: ${e.message}` : "Delete failed.");
      setBulkDeleteOpen(false);
    } finally {
      setBusyBulk(false);
    }
  }

  const columns: TableColumn<Row>[] = [
    {
      key: "short_code",
      header: "Short link",
      sortable: true,
      width: 140,
      render: (_v, row) => (
        <a href={row.short_url} target="_blank" rel="noreferrer">
          /{row.short_code}
        </a>
      ),
    },
    {
      key: "original_url",
      header: "Destination",
      render: (v) => (
        <span
          title={String(v)}
          style={{
            display: "inline-block",
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            verticalAlign: "bottom",
          }}
        >
          {String(v)}
        </span>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      width: 130,
      render: (v) => {
        const tags = Array.isArray(v) ? (v as string[]) : [];
        return tags.length ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {tags.map((t) => (
              <Badge key={t} variant="info" tone="soft" shape="pill" size="sm">
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <span style={{ color: "var(--color-text-secondary)" }}>—</span>
        );
      },
    },
    {
      key: "folder",
      header: "Folder",
      width: 110,
      render: (v) =>
        v ? (
          <Badge variant="neutral" tone="soft" shape="pill" size="sm">
            {String(v)}
          </Badge>
        ) : (
          <span style={{ color: "var(--color-text-secondary)" }}>—</span>
        ),
    },
    { key: "click_count", header: "Clicks", align: "center", sortable: true, sortType: "number", width: 90 },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      sortType: "string",
      width: 120,
      render: (v) => new Date(String(v)).toLocaleDateString(),
    },
    {
      key: "expires_at",
      header: "Expiry / limit",
      width: 130,
      render: (v, row) => {
        const parts: string[] = [];
        if (v) parts.push(new Date(String(v)).toLocaleDateString());
        if (row.click_limit != null) parts.push(`${row.click_count}/${row.click_limit}`);
        return parts.length ? parts.join(" · ") : "—";
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: 150,
      render: (_v, row) => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
          <CopyAction text={row.short_url} />
          <IconAction label="View analytics" onClick={() => navigate(`/dashboard/links/${row.id}`)}>
            <BarChartIcon />
          </IconAction>
          <IconAction label="Edit" onClick={() => setEditTarget(row)}>
            <PencilIcon />
          </IconAction>
          <IconAction label="Delete" danger onClick={() => setDeleteTarget(row)}>
            <TrashIcon />
          </IconAction>
        </div>
      ),
    },
  ];

  return (
    <AppShellLayout
      title="Dashboard"
      activeItemId="links"
      topbarRight={
        <Button variant="primary" size="sm" onClick={() => navigate("/dashboard/new")}>
          Create link
        </Button>
      }
    >
      <div style={{ padding: 24, display: "grid", gap: 20 }}>
        {phase === "loading" && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>Loading…</div>
        )}

        {phase === "offline" && (
          <ErrorState title="You're offline" description="Check your connection and try again." onRetry={refetch} />
        )}

        {phase === "error" && (
          <ErrorState
            title="Couldn't load your links"
            description={error instanceof Error ? error.message : undefined}
            onRetry={refetch}
            tone="danger"
          />
        )}

        {phase === "empty" && (
          <EmptyState
            title="No links yet"
            description="Create your first short link to see it here."
            action={
              <Button variant="primary" onClick={() => navigate("/dashboard/new")}>
                Create link
              </Button>
            }
          />
        )}

        {phase === "ready" && data && (
          <>
            {/* stat cards — colored, hoverable, and click to filter */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              {stats.map((s) => {
                const selected = statusFilter === s.key;
                return (
                  <div key={s.key} onClick={() => setStatusFilter(s.key)} style={{ cursor: "pointer" }}>
                    <Card
                      variant="elevated"
                      elevation="sm"
                      hoverable
                      style={{
                        borderRadius: 14,
                        borderLeft: `4px solid ${s.color}`,
                        outline: selected ? `2px solid ${s.color}` : "2px solid transparent",
                        outlineOffset: -2,
                      }}
                    >
                      <CardContent>
                        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: s.color }}>{s.value}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: "var(--color-text-secondary)" }}>{s.label}</div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>

            {/* my links card: filter + search + table */}
            <Card variant="elevated" elevation="sm" style={{ borderRadius: 16 }}>
              <CardHeader>
                <CardTitle>My Links</CardTitle>
                <CardAction>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Select
                      size="sm"
                      value={tagFilter}
                      onValueChange={setTagFilter}
                      options={[{ value: "all", label: "All tags" }, ...tagOptions.map((t) => ({ value: t, label: t }))]}
                    />
                    <Select
                      size="sm"
                      value={folderFilter}
                      onValueChange={setFolderFilter}
                      options={[{ value: "all", label: "All folders" }, ...folderOptions.map((f) => ({ value: f, label: f }))]}
                    />
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent>
                {notice && (
                  <div
                    role="status"
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      marginBottom: 12,
                      fontSize: 13.5,
                      background: "var(--color-theme-surface-hover, #eff6ff)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    {notice}
                  </div>
                )}

                {selectedKeys.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "10px 14px",
                      marginBottom: 12,
                      borderRadius: 10,
                      background: "var(--color-accent-sky-fg)",
                      color: "#fff",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {selectedKeys.length} link{selectedKeys.length === 1 ? "" : "s"} selected
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="outlineSecondary" size="sm" onClick={() => setSelectedKeys([])}>
                        Cancel
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                        Delete selected
                      </Button>
                    </div>
                  </div>
                )}

                <Table
                  columns={columns}
                  data={filtered as Row[]}
                  rowKey="id"
                  selectionMode="multiple"
                  selectedRowKeys={selectedKeys}
                  onSelectionChange={(keys) => setSelectedKeys(Array.isArray(keys) ? keys : [keys])}
                  searchable
                  searchPlaceholder="Search links…"
                  searchColumns={["short_code", "original_url", "folder", "tags"]}
                  pagination={{ pageSize: 10 }}
                  hover
                  striped
                  emptyText="No links match this filter."
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit link" hideFooter>
        {editTarget && (
          <EditLinkForm
            link={editTarget}
            onCancel={() => setEditTarget(null)}
            onSaved={() => {
              setEditTarget(null);
              refetch();
            }}
          />
        )}
      </Modal>

      <AlertDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this link?"
        description={deleteTarget ? `${deleteTarget.short_url} will stop working. This cannot be undone.` : ""}
        destructive
        confirmText="Delete"
        onConfirm={async () => {
          if (deleteTarget) {
            await api.deleteLink(deleteTarget.id);
            setDeleteTarget(null);
            refetch();
          }
        }}
      />

      <AlertDialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title={`Delete ${selectedKeys.length} link${selectedKeys.length === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected links and their short URLs. This cannot be undone."
        destructive
        confirmText="Delete"
        onConfirm={confirmBulkDelete}
      />
    </AppShellLayout>
  );
}
