import type { KanidmEntry, ResetLink, WhoamiResponse } from "./types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`${status}: ${detail}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try {
      detail = JSON.parse(body).error ?? body;
    } catch {
      // Not JSON; keep the raw body.
    }
    throw new ApiError(res.status, detail);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface FriendlyError {
  message: string;
  detail?: string;
}

/** Turns API failures into wording a non-technical admin can act on. */
export function friendlyError(error: unknown): FriendlyError {
  if (!(error instanceof ApiError)) {
    if (error instanceof TypeError) {
      return {
        message: "We couldn't reach the server. Check your connection and try again.",
        detail: error.message,
      };
    }
    return { message: "Something went wrong. Please try again.", detail: String(error) };
  }
  const { status, detail } = error;
  const text = detail.toLowerCase();
  if (text.includes("attrunique") || text.includes("duplicate") || text.includes("already exists")) {
    return { message: "That name is already in use. Please choose a different one.", detail };
  }
  if (status === 403 || text.includes("accessdenied") || text.includes("403")) {
    return {
      message:
        "The admin service isn't allowed to do this. Ask whoever manages your Kanidm server to check its permissions.",
      detail,
    };
  }
  if (status === 404) {
    return { message: "We couldn't find that. It may have been renamed or deleted.", detail };
  }
  if (status === 400) {
    return { message: detail.charAt(0).toUpperCase() + detail.slice(1) + "." };
  }
  if (text.includes("schemaviolation") || text.includes("invalid")) {
    return {
      message: "Kanidm didn't accept some of these details. Please check them and try again.",
      detail,
    };
  }
  return { message: "Something went wrong. Please try again.", detail };
}

// Auth
export async function getWhoami(): Promise<WhoamiResponse> {
  return request<WhoamiResponse>("/auth/whoami");
}

export async function logout(): Promise<void> {
  // The endpoint answers with a redirect; only the cleared cookie matters.
  await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
    redirect: "manual",
  });
}

// Users
export async function listUsers(): Promise<KanidmEntry[]> {
  return request<KanidmEntry[]>("/users");
}

export async function getUser(id: string): Promise<KanidmEntry> {
  return request<KanidmEntry>(`/users/${encodeURIComponent(id)}`);
}

export async function createUser(data: {
  name: string;
  displayname: string;
  mail?: string;
}): Promise<KanidmEntry> {
  return request<KanidmEntry>("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: { displayname: string; mail?: string },
): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function disableUser(id: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(id)}/disable`, {
    method: "POST",
  });
}

export async function enableUser(id: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(id)}/enable`, {
    method: "POST",
  });
}

export async function getSignInMethods(id: string): Promise<string[]> {
  const res = await request<{ methods: string[] }>(
    `/users/${encodeURIComponent(id)}/sign-in-status`,
  );
  return res.methods;
}

export async function addUserToGroup(
  userId: string,
  groupName: string,
): Promise<void> {
  return request<void>(
    `/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupName)}`,
    { method: "POST" },
  );
}

export async function removeUserFromGroup(
  userId: string,
  groupName: string,
): Promise<void> {
  return request<void>(
    `/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupName)}`,
    { method: "DELETE" },
  );
}

export async function generateResetToken(userId: string): Promise<ResetLink> {
  return request<ResetLink>(
    `/users/${encodeURIComponent(userId)}/set-password`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

// Groups
export async function listGroups(): Promise<KanidmEntry[]> {
  return request<KanidmEntry[]>("/groups");
}

export async function getGroup(id: string): Promise<KanidmEntry> {
  return request<KanidmEntry>(`/groups/${encodeURIComponent(id)}`);
}

export async function createGroup(data: {
  name: string;
  description?: string;
}): Promise<KanidmEntry> {
  return request<KanidmEntry>("/groups", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateGroup(
  id: string,
  data: { description?: string },
): Promise<void> {
  return request<void>(`/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteGroup(id: string): Promise<void> {
  return request<void>(`/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getGroupMembers(groupId: string): Promise<KanidmEntry[]> {
  return request<KanidmEntry[]>(
    `/groups/${encodeURIComponent(groupId)}/members`,
  );
}

export async function addGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  return request<void>(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: "POST" },
  );
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  return request<void>(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

// OAuth2
export async function listOAuth2Apps(): Promise<KanidmEntry[]> {
  return request<KanidmEntry[]>("/oauth2");
}

export async function getOAuth2App(rsName: string): Promise<KanidmEntry> {
  return request<KanidmEntry>(
    `/oauth2/${encodeURIComponent(rsName)}`,
  );
}

export async function createOAuth2App(data: {
  name: string;
  displayname: string;
  origin: string;
}): Promise<KanidmEntry> {
  return request<KanidmEntry>("/oauth2", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteOAuth2App(rsName: string): Promise<void> {
  return request<void>(`/oauth2/${encodeURIComponent(rsName)}`, {
    method: "DELETE",
  });
}

export async function grantAppAccess(rsName: string, group: string): Promise<void> {
  return request<void>(
    `/oauth2/${encodeURIComponent(rsName)}/access/${encodeURIComponent(group)}`,
    { method: "POST" },
  );
}

export async function revokeAppAccess(rsName: string, group: string): Promise<void> {
  return request<void>(
    `/oauth2/${encodeURIComponent(rsName)}/access/${encodeURIComponent(group)}`,
    { method: "DELETE" },
  );
}

/** Runs one request per item, collecting failures instead of stopping at the first. */
export async function runForEach<T>(
  items: T[],
  action: (item: T) => Promise<unknown>,
): Promise<{ succeeded: T[]; failed: T[] }> {
  const results = await Promise.allSettled(items.map(action));
  const succeeded: T[] = [];
  const failed: T[] = [];
  items.forEach((item, i) =>
    (results[i]?.status === "fulfilled" ? succeeded : failed).push(item),
  );
  return { succeeded, failed };
}
