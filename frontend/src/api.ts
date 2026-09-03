import type { KanidmEntry, WhoamiResponse } from "./types";

const BASE = "/api";

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
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export async function getWhoami(): Promise<WhoamiResponse> {
  return request<WhoamiResponse>("/auth/whoami");
}

export async function logout(): Promise<void> {
  await request<void>("/auth/logout", { method: "POST" });
}

// Users
export async function listUsers(search?: string): Promise<KanidmEntry[]> {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  const qs = params.toString();
  return request<KanidmEntry[]>(`/users${qs ? `?${qs}` : ""}`);
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

export async function getUserGroups(userId: string): Promise<KanidmEntry[]> {
  return request<KanidmEntry[]>(
    `/users/${encodeURIComponent(userId)}/groups`,
  );
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

export async function copyGroupsFrom(
  userId: string,
  sourceUser: string,
): Promise<string[]> {
  return request<string[]>(
    `/users/${encodeURIComponent(userId)}/copy-groups-from`,
    {
      method: "POST",
      body: JSON.stringify({ source_user: sourceUser }),
    },
  );
}

export async function generateResetToken(
  userId: string,
): Promise<{ reset_url: string }> {
  return request<{ reset_url: string }>(
    `/users/${encodeURIComponent(userId)}/set-password`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

// Groups
export async function listGroups(search?: string): Promise<KanidmEntry[]> {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  const qs = params.toString();
  return request<KanidmEntry[]>(`/groups${qs ? `?${qs}` : ""}`);
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
  scope_maps?: Record<string, string[]>;
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
