import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, listGroups, listOAuth2Apps } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, attrVals, userDisplayName, userStatus } from "../types";
import { usePageTitle } from "../components/Layout";
import { CreateUserModal } from "../components/UserModals";
import { CreateGroupModal } from "../components/GroupModals";

const ATTENTION_PREVIEW_LIMIT = 20;
const TOP_GROUPS_LIMIT = 5;

function memberCount(group: KanidmEntry): number {
  return (group.attrs["member"] ?? []).length;
}

function AttentionItem({ label, users }: { label: string; users: KanidmEntry[] }) {
  const shown = users.slice(0, ATTENTION_PREVIEW_LIMIT);
  const hidden = users.length - shown.length;
  return (
    <details className="attention-item">
      <summary>
        <span>{label}</span>
        <span className="attention-count">{users.length}</span>
      </summary>
      <ul className="attention-users">
        {shown.map((u) => (
          <li key={attrVal(u, "uuid")}>
            <Link to={`/users/${encodeURIComponent(attrVal(u, "name"))}`}>
              {userDisplayName(u)}
            </Link>
            <span className="attention-username">{attrVal(u, "name")}</span>
          </li>
        ))}
        {hidden > 0 && (
          <li className="attention-more">
            + {hidden} more — see the <Link to="/users">full user list</Link>
          </li>
        )}
      </ul>
    </details>
  );
}

export default function Dashboard() {
  const [users, setUsers] = useState<KanidmEntry[] | null>(null);
  const [groups, setGroups] = useState<KanidmEntry[] | null>(null);
  const [apps, setApps] = useState<KanidmEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  usePageTitle("Dashboard");

  const load = () => {
    setLoading(true);
    Promise.all([listUsers(), listGroups(), listOAuth2Apps()])
      .then(([u, g, a]) => {
        setUsers(u);
        setGroups(g);
        setApps(a);
        setError("");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const allUsers = users ?? [];
  const disabledUsers = allUsers.filter((u) => userStatus(u) === "disabled");
  const noGroupUsers = allUsers.filter((u) => attrVals(u, "memberof").length === 0);
  const noMailUsers = allUsers.filter((u) => !attrVal(u, "mail"));
  const activeCount = allUsers.length - disabledUsers.length;
  const totalMemberships = (groups ?? []).reduce((n, g) => n + memberCount(g), 0);
  const topGroups = [...(groups ?? [])]
    .filter((g) => memberCount(g) > 0)
    .sort((a, b) => memberCount(b) - memberCount(a))
    .slice(0, TOP_GROUPS_LIMIT);
  const maxGroupMembers = Math.max(...topGroups.map(memberCount), 1);
  const attention = [
    { label: "Users without group memberships", users: noGroupUsers },
    { label: "Users without an email address", users: noMailUsers },
    { label: "Disabled users", users: disabledUsers },
  ].filter((a) => a.users.length > 0);

  return (
    <div>
      <div className="toolbar">
        <h1 style={{ marginRight: "auto", marginBottom: 0 }}>Dashboard</h1>
        <button className="btn-ghost" onClick={() => setShowCreateGroup(true)}>
          Create Group
        </button>
        <button className="btn-primary" onClick={() => setShowCreateUser(true)}>
          Create User
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          <div className="stat-grid">
            <Link to="/users" className="card-link">
              <div className="card">
                <div className="stat-label">Users</div>
                <div className="stat-value">{users?.length ?? "—"}</div>
                <div className="stat-sub">
                  {activeCount} active · {disabledUsers.length} disabled
                </div>
              </div>
            </Link>
            <Link to="/groups" className="card-link">
              <div className="card">
                <div className="stat-label">Groups</div>
                <div className="stat-value">{groups?.length ?? "—"}</div>
                <div className="stat-sub">{totalMemberships} memberships</div>
              </div>
            </Link>
            <Link to="/oauth2" className="card-link">
              <div className="card">
                <div className="stat-label">OAuth2 Apps</div>
                <div className="stat-value">{apps?.length ?? "—"}</div>
              </div>
            </Link>
          </div>

          <div className="dash-columns">
            <div className="card dash-card">
              <h2>Needs attention</h2>
              {attention.length === 0 ? (
                <div className="all-clear">
                  <span className="all-clear-dot" />
                  Every user has group memberships and an email address, and no
                  accounts are disabled.
                </div>
              ) : (
                attention.map((a) => (
                  <AttentionItem key={a.label} label={a.label} users={a.users} />
                ))
              )}
            </div>

            <div className="card dash-card">
              <h2>Largest groups</h2>
              {topGroups.length === 0 ? (
                <div className="stat-sub">No groups with members yet.</div>
              ) : (
                <ul className="group-bars">
                  {topGroups.map((g) => {
                    const count = memberCount(g);
                    return (
                      <li key={attrVal(g, "uuid")}>
                        <div className="group-bar-label">
                          <Link
                            to={`/groups/${encodeURIComponent(attrVal(g, "name"))}`}
                          >
                            {attrVal(g, "name")}
                          </Link>
                          <span>{count}</span>
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${(count / maxGroupMembers) * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {showCreateUser && (
        <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={load} />
      )}
      {showCreateGroup && (
        <CreateGroupModal onClose={() => setShowCreateGroup(false)} onCreated={load} />
      )}
    </div>
  );
}
