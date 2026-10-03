// Mirrors backend/schemas.py — the API contract.

export interface TokenOut {
  access_token: string;
  token_type: string;
}

export interface UserOut {
  id: number;
  email: string;
}

export interface LinkOut {
  id: number;
  short_code: string;
  short_url: string;
  original_url: string;
  created_at: string;
  expires_at: string | null;
  click_limit: number | null;
  tags: string[];
  folder: string | null;
  has_qr: boolean;
  has_password: boolean;
  click_count: number;
}

// Preset tag options shown in the create/edit forms (plus a custom entry).
export const TAG_PRESETS = ["Marketing", "Social", "Campaign", "Personal"];

export interface CountItem {
  label: string;
  count: number;
}

export interface LinkAnalytics {
  link: LinkOut;
  clicks_over_time: CountItem[];
  top_referrers: CountItem[];
  devices: CountItem[];
  countries: CountItem[]; // label = ISO-2 country code (or "unknown")
  browsers: CountItem[];
}

// POST /api/shorten body — note the field is `url` (not original_url).
export interface ShortenIn {
  url: string;
  alias?: string | null;
  expires_at?: string | null;
  click_limit?: number | null;
  tags?: string[] | null;
  folder?: string | null;
  has_qr?: boolean;
  password?: string | null;
}

// PATCH /api/links/{id} body — all optional (partial update).
export interface LinkUpdate {
  original_url?: string | null;
  alias?: string | null;
  expires_at?: string | null;
  click_limit?: number | null;
  tags?: string[] | null;
  folder?: string | null;
  has_qr?: boolean | null;
  // "" disables protection; a non-empty value sets/changes it; omit to leave unchanged.
  password?: string | null;
}

export interface BulkLinkRow {
  row: number;
  status: "created" | "updated" | "skipped" | "failed";
  url?: string | null;
  alias?: string | null;
  short_url?: string | null;
  error?: string | null;
  changed?: string[] | null;
  details?: string | null;
}

export interface BulkImportResult {
  success_count: number;
  failed_count: number;
  updated_count?: number;
  skipped_count?: number;
  rows: BulkLinkRow[];
}
