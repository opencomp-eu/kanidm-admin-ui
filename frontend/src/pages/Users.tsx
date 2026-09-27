import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listGroups, listUsers } from "../api";
import type { KanidmEntry } from "../types";
import {
  attrVal,
  entryName,
  isSuspended,
  matchesQuery,
  systemGroupNameSet,
  teamGroupNames,
  userDisplayName,
} from "../types";
import { useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import StatusBadge from "../components/StatusBadge";
import { EmptyState, ErrorBanner, LoadingState } from "../components/States";
import { CreatePersonModal } from "../components/UserModals";

type Filter = "all" | "active" | "suspended" | "incomplete";

const MAX_GROUP_CHIPS = 2;

export default function Users() {
  usePageTitle("People");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const { data, error, reload } = useLoader(() => Promise.all([listUsers(), listGroups()]), []);

  const [users, groups] = data ?? [[], []];
  const systemNames = systemGroupNameSet(groups);
  const groupsOf = (u: KanidmEntry) => teamGroupNames(u, systemNames);
  const isIncomplete = (u: KanidmEntry) =>
    !isSuspended(u) && (!attrVal(u, "mail") || groupsOf(u).length === 0);

  const filters: { id: Filter; label: string; test: (u: KanidmEntry) => boolean }[] = [
    { id: "all", label: "Everyone", test: () => true },
    { id: "active", label: "Active", test: (u) => !isSuspended(u) },
    { id: "suspended", label: "Suspended", test: isSuspended },
    { id: "incomplete", label: "Missing info", test: isIncomplete },
  ];
  const activeFilter = filters.find((f) => f.id === filter)!;
  const visible = users
    .filter(activeFilter.test)
    .filter((u) => matchesQuery(query, userDisplayName(u), entryName(u), attrVal(u, "mail")))
    .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)));

  return (
    <div>
      <PageHeader
        title="People"
        description="Everyone who has an account. Select a person to manage their access."
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="personAdd" size={16} />
            Add a person
          </button>
        }
      />

      {error !== null && <ErrorBanner error={error} onRetry={reload} />}

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, username or email…" />
        <div className="segmented" role="tablist" aria-label="Filter people">
          {filters.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={filter === f.id ? "active" : ""}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="count">{users.filter(f.test).length}</span>
            </button>
          ))}
        </div>
      </div>

      {!data && !error ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <EmptyState
          icon="people"
          title="No one here yet"
          action={
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="personAdd" size={16} />
              Add your first person
            </button>
          }
        >
          Add people to give them an account they can use to sign in to your apps.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="No matches">
          {query ? `Nobody matches “${query}”` : "Nobody matches this filter"}. Try a different search or filter.
        </EmptyState>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th className="hide-sm">Email</th>
                <th className="hide-md">Groups</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const name = entryName(u);
                const userGroups = groupsOf(u);
                const to = `/users/${encodeURIComponent(name)}`;
                return (
                  <tr key={attrVal(u, "uuid") || name} className="row-link" onClick={() => navigate(to)}>
                    <td>
                      <div className="identity">
                        <Avatar name={userDisplayName(u)} seed={name} muted={isSuspended(u)} />
                        <div>
                          <Link to={to} className="identity-name" onClick={(e) => e.stopPropagation()}>
                            {userDisplayName(u)}
                          </Link>
                          <div className="identity-sub">{name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">
                      {attrVal(u, "mail") || <span className="muted-italic">No email</span>}
                    </td>
                    <td className="hide-md">
                      {userGroups.length === 0 ? (
                        <span className="muted-italic">None</span>
                      ) : (
                        <div className="chip-list">
                          {userGroups.slice(0, MAX_GROUP_CHIPS).map((g) => (
                            <span key={g} className="chip">
                              {g}
                            </span>
                          ))}
                          {userGroups.length > MAX_GROUP_CHIPS && (
                            <span className="chip chip-muted">+{userGroups.length - MAX_GROUP_CHIPS}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge user={u} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreatePersonModal onClose={() => setShowCreate(false)} onCreated={reload} />}
    </div>
  );
}
