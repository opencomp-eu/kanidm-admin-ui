import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listGroups, listOAuth2Apps, listUsers } from "../api";
import type { KanidmEntry } from "../types";
import {
  appAccessGroups,
  appDisplayName,
  attrVal,
  entryName,
  groupMemberNames,
  isSystemEntry,
  matchesQuery,
  userDisplayName,
} from "../types";
import { useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import { Banner, EmptyState, ErrorBanner, LoadingState } from "../components/States";
import { CreateGroupModal } from "../components/GroupModals";

const AVATAR_STACK_LIMIT = 4;

function GroupCard({
  group,
  displayNames,
  appNames,
}: {
  group: KanidmEntry;
  displayNames: Map<string, string>;
  appNames: string[];
}) {
  const name = entryName(group);
  const members = groupMemberNames(group);
  return (
    <Link to={`/groups/${encodeURIComponent(name)}`} className="group-card">
      <div className="group-card-head">
        <span className="option-icon">
          <Icon name="groups" size={18} />
        </span>
        <span className="group-card-name">{name}</span>
      </div>
      <p className="group-card-description">
        {attrVal(group, "description") || <span className="muted-italic">No description</span>}
      </p>
      {appNames.length > 0 && (
        <p className="group-card-apps">
          <Icon name="apps" size={14} />
          {appNames.join(", ")}
        </p>
      )}
      <div className="group-card-foot">
        <div className="avatar-stack">
          {members.slice(0, AVATAR_STACK_LIMIT).map((m) => (
            <Avatar key={m} name={displayNames.get(m) ?? m} seed={m} size="sm" />
          ))}
        </div>
        <span className="muted small">
          {members.length === 0 ? "No members" : `${members.length} ${members.length === 1 ? "member" : "members"}`}
        </span>
      </div>
    </Link>
  );
}

export default function Groups() {
  usePageTitle("Groups");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { data, error, reload } = useLoader(
    () =>
      Promise.all([
        listGroups(),
        listUsers(),
        listOAuth2Apps().catch(() => [] as KanidmEntry[]),
      ]),
    [],
  );

  const [groups, users, apps] = data ?? [[], [], []];
  const displayNames = new Map(users.map((u) => [entryName(u), userDisplayName(u)]));
  const appsByGroup = new Map<string, string[]>();
  for (const app of apps) {
    for (const g of appAccessGroups(app)) {
      appsByGroup.set(g, [...(appsByGroup.get(g) ?? []), appDisplayName(app)]);
    }
  }
  const matching = groups
    .filter((g) => matchesQuery(query, entryName(g), attrVal(g, "description")))
    .sort((a, b) => entryName(a).localeCompare(entryName(b)));
  const orgGroups = matching.filter((g) => !isSystemEntry(g));
  const systemGroups = matching.filter(isSystemEntry);
  const systemTotal = groups.filter(isSystemEntry).length;

  const renderGrid = (list: KanidmEntry[]) => (
    <div className="card-grid">
      {list.map((g) => (
        <GroupCard
          key={entryName(g)}
          group={g}
          displayNames={displayNames}
          appNames={appsByGroup.get(entryName(g)) ?? []}
        />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Groups"
        description="Put people in groups (teams, departments, projects) and give each group access to the apps it needs."
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={16} />
            Create a group
          </button>
        }
      />

      {error !== null && <ErrorBanner error={error} onRetry={reload} />}

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search groups…" />
        {systemTotal > 0 && (
          <label className="toggle">
            <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
            <span className="toggle-track" aria-hidden="true" />
            Show built-in groups ({systemTotal})
          </label>
        )}
      </div>

      {!data && !error ? (
        <LoadingState />
      ) : (
        <>
          {orgGroups.length > 0 ? (
            renderGrid(orgGroups)
          ) : query ? (
            <EmptyState icon="search" title="No matching groups">
              Nothing matches “{query}”. Try a different search.
            </EmptyState>
          ) : (
            <EmptyState
              icon="groups"
              title="No groups yet"
              action={
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <Icon name="plus" size={16} />
                  Create your first group
                </button>
              }
            >
              Groups make it easy to give a whole team access at once, and to see who has access to what.
            </EmptyState>
          )}

          {showSystem && systemGroups.length > 0 && (
            <section className="system-section">
              <h2>Built-in Kanidm groups</h2>
              <Banner tone="warning">
                These groups come with Kanidm and control things like admin rights. Only change them if you
                know exactly what they do.
              </Banner>
              {renderGrid(systemGroups)}
            </section>
          )}
        </>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(name) => navigate(`/groups/${encodeURIComponent(name)}`)}
        />
      )}
    </div>
  );
}
