import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dropzone,
  ErrorState,
  Badge,
} from "ui-common-components";
import { Table, type TableColumn } from "ui-common-components/table";
import AppShellLayout from "../components/AppShellLayout";
import CopyButton from "../components/CopyButton";
import { api } from "../api";
import type { BulkImportResult, BulkLinkRow } from "../types";

type Row = BulkLinkRow & Record<string, unknown>;

const columns: TableColumn<Row>[] = [
  {
    key: "row",
    header: "#",
    width: 60,
    align: "center",
    render: (v) => String(v),
  },
  {
    key: "status",
    header: "Status",
    width: 120,
    render: (v) => {
      switch (v) {
        case "created":
          return <Badge variant="success" tone="soft" shape="pill" size="sm">Created</Badge>;
        case "updated":
          return <Badge variant="info" tone="soft" shape="pill" size="sm">Updated</Badge>;
        case "skipped":
          return <Badge variant="neutral" tone="soft" shape="pill" size="sm">No changes</Badge>;
        default:
          return <Badge variant="danger" tone="soft" shape="pill" size="sm">Failed</Badge>;
      }
    },
  },
  {
    key: "url",
    header: "URL",
    render: (v) => (
      <span
        title={String(v ?? "")}
        style={{
          display: "inline-block",
          maxWidth: 300,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          verticalAlign: "bottom",
        }}
      >
        {String(v ?? "—")}
      </span>
    ),
  },
  {
    key: "alias",
    header: "Alias",
    width: 110,
    render: (v) => (v ? String(v) : <span style={{ color: "var(--color-text-secondary)" }}>—</span>),
  },
  {
    key: "short_url",
    header: "Short link",
    render: (_v, row) =>
      row.status === "created" && row.short_url ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <a href={row.short_url} target="_blank" rel="noreferrer">
            /{String(row.short_url).split("/").pop()}
          </a>
          <CopyButton text={row.short_url} label="Copy" />
        </div>
      ) : (
        <span style={{ color: "var(--color-text-secondary)" }}>—</span>
      ),
  },
  {
    key: "error",
    header: "Details / Reason",
    render: (_v, row) => {
      if (row.status === "failed") {
        return (
          <span style={{ color: "var(--color-text-danger, #b42318)", whiteSpace: "normal" }}>
            {row.error ? String(row.error) : "Failed to import"}
          </span>
        );
      }
      if (row.status === "updated" && row.changed && row.changed.length) {
        return (
          <span style={{ color: "var(--color-text-secondary)", whiteSpace: "normal" }}>
            Changed: {row.changed.join(", ")}
          </span>
        );
      }
      if (row.status === "skipped") {
        return (
          <span style={{ color: "var(--color-text-secondary)", whiteSpace: "normal" }}>
            {row.details ?? "Link already matches imported values — no update was required."}
          </span>
        );
      }
      // created
      return <span style={{ color: "var(--color-text-secondary)" }}>—</span>;
    },
  },
];

export default function BulkCreate() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  async function downloadTemplate(kind: "csv" | "excel") {
    setError(null);
    try {
      const { blob, filename } =
        kind === "excel"
          ? await api.downloadExcelTemplate()
          : await api.downloadBulkTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template download failed");
    }
  }

  async function onFilesChange(files: File[]) {
    const file = files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.bulkCsv(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShellLayout title="Bulk import" activeItemId="bulk">
      <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
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

        <Card variant="elevated" elevation="sm" style={{ borderRadius: 16 }}>
          <CardHeader>
            <CardTitle>Bulk import links</CardTitle>
            <CardDescription>
              Upload a CSV or Excel (.xlsx) file to create many short links at once.
              One URL per row (with an optional alias). The{" "}
              <b>Excel template</b> also supports optional{" "}
              <code>expires_at</code>, <code>click_limit</code>, <code>tags</code>,{" "}
              <code>folder</code>, <code>has_qr</code> and <code>password</code> columns;
              <b> CSV</b> carries just <code>url</code>/<code>alias</code>. Every URL is
              scanned for malware/phishing first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadTemplate("excel")}
                  style={{ fontSize: 13 }}
                >
                  Download Excel template
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadTemplate("csv")}
                  style={{ fontSize: 13 }}
                >
                  Download CSV template
                </Button>
              </div>
              <Dropzone
                label="Choose a CSV or Excel file (max 5,000 rows)"
                description="Drag & drop or click to browse — .csv or .xlsx files"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                allowedExtensions={[".csv", ".xlsx"]}
                multiple={false}
                clearInputAfterSelect
                disabled={busy}
                onFilesChange={onFilesChange}
              />

              {busy && <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Importing…</div>}

              {error && (
                <ErrorState
                  title="Import failed"
                  description={error}
                  tone="danger"
                  onRetry={() => setError(null)}
                />
              )}

              {result && (
                <Card variant="bordered" style={{ borderRadius: 12 }}>
                  <CardContent>
                    <div style={{ display: "flex", gap: 20, alignItems: "baseline", flexWrap: "wrap" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-accent-mint-fg)" }}>
                        {result.success_count} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>created</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-accent-blue-fg)" }}>
                        {result.updated_count ?? 0} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>updated</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-secondary)" }}>
                        {result.skipped_count ?? 0} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>no changes</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: result.failed_count ? "var(--color-accent-rose-fg)" : "var(--color-text-secondary)" }}>
                        {result.failed_count} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>failed</span>
                      </div>
                    </div>

                    <Table
                      columns={columns}
                      data={result.rows as Row[]}
                      rowKey="row"
                      pagination={{ pageSize: 10 }}
                      hover
                      striped
                      emptyText="No rows."
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>

        {result && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Import another file
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate("/dashboard")}>
              Go to My Links
            </Button>
          </div>
        )}
      </div>
    </AppShellLayout>
  );
}