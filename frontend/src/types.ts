export interface KanidmEntry {
  attrs: Record<string, string[]>;
}

export interface WhoamiResponse {
  youare: KanidmEntry;
}

export interface ResetLink {
  reset_url: string;
  expires_at: string | null;
}

// Helpers to extract attrs
export function attrVal(entry: KanidmEntry, key: string): string {
  return entry.attrs[key]?.[0] ?? "";
}

export function attrVals(entry: KanidmEntry, key: string): string[] {
  return entry.attrs[key] ?? [];
}

export function entryName(entry: KanidmEntry): string {
  return attrVal(entry, "name");
}

export function userDisplayName(entry: KanidmEntry): string {
  return attrVal(entry, "displayname") || attrVal(entry, "name") || "Unknown";
}

/** Kanidm references entries by SPN (`name@domain`); the API accepts the bare name. */
export function spnName(spn: string): string {
  return spn.split("@")[0] ?? spn;
}

// Kanidm ships its built-in groups and accounts with UUIDs in this reserved range.
const BUILTIN_UUID_PREFIX = "00000000-0000-0000-0000-";

export function isSystemGroupName(name: string): boolean {
  return /^(idm_|system_)/.test(spnName(name));
}

export function isSystemEntry(entry: KanidmEntry): boolean {
  return (
    attrVal(entry, "uuid").startsWith(BUILTIN_UUID_PREFIX) ||
    isSystemGroupName(entryName(entry))
  );
}

/** Names of groups the person was added to directly (the only ones that can be removed). */
export function directGroupNames(user: KanidmEntry): string[] {
  const values = user.attrs["directmemberof"] ?? user.attrs["memberof"] ?? [];
  return [...new Set(values.map(spnName))].sort();
}

/** Direct groups that an organisation created itself, excluding Kanidm's built-in ones. */
export function teamGroupNames(user: KanidmEntry, systemNames: Set<string>): string[] {
  return directGroupNames(user).filter(
    (g) => !systemNames.has(g) && !isSystemGroupName(g),
  );
}

export function systemGroupNameSet(groups: KanidmEntry[]): Set<string> {
  return new Set(groups.filter(isSystemEntry).map(entryName));
}

export function groupMemberNames(group: KanidmEntry): string[] {
  return attrVals(group, "member").map(spnName).sort();
}

export type AccountStatus =
  | { kind: "active"; endsAt?: Date }
  | { kind: "suspended"; since?: Date }
  | { kind: "not_started"; startsAt: Date };

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Kanidm has no status attribute: an account is locked once `account_expire`
 * has passed and until `account_valid_from` is reached.
 */
export function accountStatus(entry: KanidmEntry, now = new Date()): AccountStatus {
  const expires = parseDate(attrVal(entry, "account_expire"));
  const validFrom = parseDate(attrVal(entry, "account_valid_from"));
  if (expires && expires <= now) return { kind: "suspended", since: expires };
  if (attrVal(entry, "status") === "disabled") return { kind: "suspended" };
  if (validFrom && validFrom > now) return { kind: "not_started", startsAt: validFrom };
  return { kind: "active", endsAt: expires };
}

export function isSuspended(entry: KanidmEntry): boolean {
  return accountStatus(entry).kind === "suspended";
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kanidm names: lowercase letters, digits and `._-`, starting with a letter. */
export const NAME_PATTERN = "[a-z][a-z0-9._\\-]*";

export function isValidName(name: string): boolean {
  return new RegExp(`^${NAME_PATTERN}$`).test(name);
}

/** Suggests a Kanidm-safe name, e.g. "Zoë O'Neil" -> "zoe.oneil". */
export function suggestName(displayName: string, separator = "."): string {
  return displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^[^a-z]+|\\${separator}+$`, "g"), "");
}

export function matchesQuery(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f.toLowerCase().includes(q));
}

// OAuth2 apps
export function appDisplayName(app: KanidmEntry): string {
  return attrVal(app, "displayname") || entryName(app);
}

export function appUrl(app: KanidmEntry): string {
  return (
    attrVal(app, "oauth2_rs_origin_landing") ||
    attrVal(app, "oauth2_rs_origin") ||
    attrVal(app, "origin")
  );
}

/** Groups allowed to sign in, from scope map values like `staff@domain: {"openid"}`. */
export function appAccessGroups(app: KanidmEntry): string[] {
  return attrVals(app, "oauth2_rs_scope_map")
    .map((v) => spnName((v.split(":")[0] ?? "").trim()))
    .filter(Boolean)
    .sort();
}
