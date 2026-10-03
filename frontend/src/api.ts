import type {
  TokenOut,
  UserOut,
  LinkOut,
  LinkAnalytics,
  ShortenIn,
  LinkUpdate,
} from "./types";

// API base is the backend. VITE_API_BASE lets a container/Docker set the host;
// default keeps local dev working (backend published on host port 8000).
const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const TOKEN_KEY = "linksnip_token";
const PENDING_VERIFY_KEY = "linksnip_pending_verify_email";

// Raw token in localStorage (no JSON quoting) so the fetch wrapper below can read
// it synchronously outside React.
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Email awaiting verification, surfaced on the "verify your email" screen so the
// Resend action knows which address to target.
export function getPendingVerifyEmail(): string | null {
  return localStorage.getItem(PENDING_VERIFY_KEY);
}
export function setPendingVerifyEmail(email: string | null): void {
  if (email) localStorage.setItem(PENDING_VERIFY_KEY, email);
  else localStorage.removeItem(PENDING_VERIFY_KEY);
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) {
        if (typeof body.detail === "string") {
          detail = body.detail;
        } else if (Array.isArray(body.detail)) {
          // Pydantic 422: [{ msg, loc, ... }] — surface the first readable message
          detail = body.detail[0]?.msg ?? JSON.stringify(body.detail);
        } else {
          detail = JSON.stringify(body.detail);
        }
      }
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  signup: (email: string, password: string) =>
    req<TokenOut>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    req<TokenOut>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<UserOut>("/api/auth/me"),
  verifyEmail: (token: string) =>
    req<UserOut>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: (email: string) =>
    req<{ message: string }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  forgotPassword: (email: string) =>
    req<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    req<TokenOut>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  shorten: (data: ShortenIn) =>
    req<LinkOut>("/api/shorten", { method: "POST", body: JSON.stringify(data) }),
  listLinks: () => req<LinkOut[]>("/api/links"),
  listFolders: () => req<{ folders: string[] }>("/api/links/folders"),
  getLink: (id: number) => req<LinkAnalytics>(`/api/links/${id}`),
  updateLink: (id: number, data: LinkUpdate) =>
    req<LinkOut>(`/api/links/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteLink: (id: number) =>
    req<{ deleted: boolean }>(`/api/links/${id}`, { method: "DELETE" }),
  bulkDelete: (ids: number[]) =>
    req<{ deleted: number; not_found: number[] }>("/api/links/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  // Upload a CSV or Excel (.xlsx) file for logged-in bulk creation. Uses FormData so
  // the browser sets the multipart boundary (the JSON helper above is not suitable
  // here). The filename carries the extension the backend uses to choose the parser.
  bulkCsv: async (file: File) => {
    const token = getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(BASE + "/api/links/bulk", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        /* keep generic message */
      }
      throw new Error(detail);
    }
    return (await res.json()) as import("./types").BulkImportResult;
  },
  // Download a link's analytics as CSV (per-click rows). Returns the file as a Blob
  // plus the filename suggested by the server's Content-Disposition header.
  exportCsv: async (linkId: number) => {
    const token = getToken();
    const res = await fetch(BASE + `/api/links/${linkId}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        /* keep generic message */
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") || "");
    const filename = match ? match[1] : `linksnip-analytics.csv`;
    return { blob, filename };
  },
  // Download the CSV template for bulk import (header url,alias + example rows).
  // Same Blob/Content-Disposition pattern as exportCsv.
  downloadBulkTemplate: async () => {
    const token = getToken();
    const res = await fetch(BASE + "/api/links/bulk/template", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        /* keep generic message */
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") || "");
    const filename = match ? match[1] : `linksnip-bulk-import-template.csv`;
    return { blob, filename };
  },
  // Download the official Excel (.xlsx) template for bulk import (Import Data +
  // Instructions sheets, full url/alias/expires_at/click_limit/tags/folder/has_qr/
  // password columns). Same Blob/Content-Disposition pattern as the CSV template.
  downloadExcelTemplate: async () => {
    const token = getToken();
    const res = await fetch(BASE + "/api/links/bulk/template/excel", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        /* keep generic message */
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") || "");
    const filename = match ? match[1] : `linksnip-bulk-import-template.xlsx`;
    return { blob, filename };
  },
};
