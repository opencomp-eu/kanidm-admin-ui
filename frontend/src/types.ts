export interface KanidmEntry {
  attrs: Record<string, string[]>;
}

export interface WhoamiResponse {
  youare: KanidmEntry;
}

export interface ApiToken {
  account_id: string;
  token_id: string;
  label: string;
  expiry: string | null;
  issued_at: string;
  purpose: string;
}

export type Filter =
  | { eq: [string, string] }
  | { cnt: [string, string] }
  | { pres: string }
  | { or: Filter[] }
  | { and: Filter[] }
  | { andnot: Filter }
  | "self";

export type Modify =
  | { present: [string, string] }
  | { removed: [string, string] }
  | { purged: string };

// Helpers to extract attrs
export function attrVal(entry: KanidmEntry, key: string): string {
  return entry.attrs[key]?.[0] ?? "";
}

export function attrVals(entry: KanidmEntry, key: string): string[] {
  return entry.attrs[key] ?? [];
}

export function userDisplayName(entry: KanidmEntry): string {
  return attrVal(entry, "displayname") || attrVal(entry, "name") || "Unknown";
}

export function userStatus(entry: KanidmEntry): string {
  return attrVal(entry, "status") || "unknown";
}
