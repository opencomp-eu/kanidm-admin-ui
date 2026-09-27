import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { disableUser, listGroups, listOAuth2Apps, listUsers } from "../api";
import type { KanidmEntry } from "../types";
import {
  appDisplayName,
  attrVal,
  entryName,
  groupMemberNames,
  isSuspended,
  isSystemEntry,
  matchesQuery,
  systemGroupNameSet,
  teamGroupNames,
  userDisplayName,
} from "../types";
import { buildInsights } from "../insights";
import { useAction, useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import type { IconName } from "../components/Icon";
import InsightRow from "../components/InsightRow";
import PickerModal from "../components/PickerModal";
import { personOptions } from "../components/PickerList";
import SearchInput from "../components/SearchInput";
import StatusBadge from "../components/StatusBadge";
import { ErrorBanner, LoadingState } from "../components/States";
import { CreatePersonModal, SetupLinkModal } from "../components/UserModals";
import { CreateGroupModal } from "../components/GroupModals";

const TOP_GROUPS_LIMIT = 5;
const SEARCH_RESULTS_LIMIT = 6;

type Dialog =
  | { kind: "create-person" }
  | { kind: "create-group" }
  | { kind: "pick-link" }
  | { kind: "pick-offboard" }
  | { kind: "setup-link"; user: KanidmEntry }
  | { kind: "confirm-offboard"; user: KanidmEntry };

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
  primary,
}: {
  icon: IconName;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button className={`quick-action${primary ? " primary" : ""}`} onClick={onClick}>
      <span className="quick-action-icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="quick-action-title">{title}</span>
      <span className="quick-action-description">{description}</span>
    </button>
  );
}

function HomeSearch({ users, groups }: { users: KanidmEntry[]; groups: KanidmEntry[] }) {
  const [query, setQuery] = useState("");
  const people = users
    .filter((u) => matchesQuery(query, userDisplayName(u), entryName(u), attrVal(u, "mail")))
    .slice(0, SEARCH_RESULTS_LIMIT);
  const matchingGroups = groups
    .filter((g) => matchesQuery(query, entryName(g), attrVal(g, "description")))
    .slice(0, 3);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="home-search">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Find a person or group by name, username or email…"
      />
      {hasQuery && (
        <div className="search-results">
          {people.length === 0 && matchingGroups.length === 0 ? (
            <div className="search-empty">Nobody or nothing matches “{query}”.</div>
          ) : (
            <>
              {people.map((u) => (
                <Link key={entryName(u)} to={`/users/${encodeURIComponent(entryName(u))}`} className="search-result">
                  <Avatar name={userDisplayName(u)} seed={entryName(u)} size="sm" />
                  <span className="search-result-text">
                    <span>{userDisplayName(u)}</span>
                    <span className="muted">{attrVal(u, "mail") || entryName(u)}</span>
                  </span>
                  <StatusBadge user={u} />
                </Link>
              ))}
              {matchingGroups.map((g) => (
                <Link key={entryName(g)} to={`/groups/${encodeURIComponent(entryName(g))}`} className="search-result">
                  <span className="option-icon">
                    <Icon name="groups" size={16} />
                  </span>
                  <span className="search-result-text">
                    <span>{entryName(g)}</span>
                    <span className="muted">Group · {groupMemberNames(g).length} members</span>
                  </span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  usePageTitle("Home");
  const me = useOutletContext<KanidmEntry>();
  const navigate = useNavigate();
  const { run } = useAction();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { data, error, reload } = useLoader(
    () => Promise.all([listUsers(), listGroups(), listOAuth2Apps()]),
    [],
  );
  const close = () => setDialog(null);

  const firstName = userDisplayName(me).split(" ")[0];

  if (error) return <ErrorBanner error={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Gathering an overview…" />;

  const [users, groups, apps] = data;
  const systemNames = systemGroupNameSet(groups);
  const orgGroups = groups.filter((g) => !isSystemEntry(g));
  const activeUsers = users.filter((u) => !isSuspended(u));
  const suspendedCount = users.length - activeUsers.length;
  const fullySetUp = activeUsers.filter(
    (u) => attrVal(u, "mail") && teamGroupNames(u, systemNames).length > 0,
  ).length;
  const health = activeUsers.length ? Math.round((fullySetUp / activeUsers.length) * 100) : 100;
  const insights = buildInsights(users, groups, apps);
  const topGroups = [...orgGroups]
    .sort((a, b) => groupMemberNames(b).length - groupMemberNames(a).length)
    .slice(0, TOP_GROUPS_LIMIT);
  const maxMembers = Math.max(1, ...topGroups.map((g) => groupMemberNames(g).length));

  return (
    <div className="dashboard">
      <section className="hero">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p className="page-description">
            Here's an overview of your organisation's accounts and anything that needs a look.
          </p>
        </div>
        <HomeSearch users={users} groups={orgGroups} />
      </section>

      <section className="quick-actions" aria-label="Quick actions">
        <QuickAction
          primary
          icon="personAdd"
          title="Add a person"
          description="Set up an account for a new starter"
          onClick={() => setDialog({ kind: "create-person" })}
        />
        <QuickAction
          icon="key"
          title="Send a sign-in link"
          description="For a forgotten password or lost device"
          onClick={() => setDialog({ kind: "pick-link" })}
        />
        <QuickAction
          icon="personOff"
          title="Offboard someone"
          description="Suspend access for a leaver"
          onClick={() => setDialog({ kind: "pick-offboard" })}
        />
        <QuickAction
          icon="groups"
          title="Create a group"
          description="Organise a team or department"
          onClick={() => setDialog({ kind: "create-group" })}
        />
      </section>

      <section className="stat-grid">
        <Link to="/users" className="stat-card">
          <span className="stat-icon stat-icon-people">
            <Icon name="people" size={20} />
          </span>
          <span className="stat-value">{activeUsers.length}</span>
          <span className="stat-label">Active {activeUsers.length === 1 ? "person" : "people"}</span>
          {suspendedCount > 0 && <span className="stat-sub">{suspendedCount} suspended</span>}
        </Link>
        <Link to="/groups" className="stat-card">
          <span className="stat-icon stat-icon-groups">
            <Icon name="groups" size={20} />
          </span>
          <span className="stat-value">{orgGroups.length}</span>
          <span className="stat-label">{orgGroups.length === 1 ? "Group" : "Groups"}</span>
        </Link>
        <Link to="/oauth2" className="stat-card">
          <span className="stat-icon stat-icon-apps">
            <Icon name="apps" size={20} />
          </span>
          <span className="stat-value">{apps.length}</span>
          <span className="stat-label">Connected {apps.length === 1 ? "app" : "apps"}</span>
        </Link>
        <div className="stat-card">
          <span className="stat-icon stat-icon-health">
            <Icon name="check" size={20} />
          </span>
          <span className="stat-value">{health}%</span>
          <span className="stat-label">Profiles complete</span>
          <div className="meter" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${health}%` }} />
          </div>
          <span className="stat-sub">
            {fullySetUp} of {activeUsers.length} have an email and a group
          </span>
        </div>
      </section>

      <div className="dash-columns">
        <Card
          title="Suggested actions"
          description={
            insights.length ? "A few things that could use your attention." : undefined
          }
        >
          {users.length === 0 ? (
            <div className="all-clear">
              <span className="all-clear-icon">
                <Icon name="sparkles" size={20} />
              </span>
              <div>
                <strong>Welcome! Let's add your first person.</strong>
                <div className="muted">
                  Create an account, choose their groups, and send them a link to set up their sign-in.
                </div>
              </div>
            </div>
          ) : insights.length === 0 ? (
            <div className="all-clear">
              <span className="all-clear-icon">
                <Icon name="check" size={20} />
              </span>
              <div>
                <strong>Everything looks tidy.</strong>
                <div className="muted">
                  Everyone has an email and a group, and every app has people who can use it.
                </div>
              </div>
            </div>
          ) : (
            <div className="insight-list">
              {insights.map((i) => (
                <InsightRow key={i.id} insight={i} />
              ))}
            </div>
          )}
        </Card>

        <div className="dash-side">
          <Card
            title="Biggest groups"
            actions={
              <Link to="/groups" className="link-subtle">
                View all
              </Link>
            }
          >
            {topGroups.length === 0 ? (
              <p className="muted small">No groups yet.</p>
            ) : (
              <ul className="group-bars">
                {topGroups.map((g) => {
                  const count = groupMemberNames(g).length;
                  return (
                    <li key={entryName(g)}>
                      <div className="group-bar-label">
                        <Link to={`/groups/${encodeURIComponent(entryName(g))}`}>{entryName(g)}</Link>
                        <span className="muted">{count}</span>
                      </div>
                      <div className="meter">
                        <div className="meter-fill" style={{ width: `${(count / maxMembers) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card
            title="Connected apps"
            actions={
              <Link to="/oauth2" className="link-subtle">
                Manage
              </Link>
            }
          >
            {apps.length === 0 ? (
              <p className="muted small">
                No apps yet. <Link to="/oauth2">Connect one</Link> so people can sign in with their
                company account.
              </p>
            ) : (
              <ul className="mini-list">
                {apps.slice(0, 5).map((a) => (
                  <li key={entryName(a)}>
                    <Link to={`/oauth2/${encodeURIComponent(entryName(a))}`}>
                      <Avatar name={appDisplayName(a)} size="sm" />
                      <span>{appDisplayName(a)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {dialog?.kind === "create-person" && <CreatePersonModal onClose={close} onCreated={reload} />}
      {dialog?.kind === "create-group" && (
        <CreateGroupModal
          onClose={close}
          onCreated={(name) => navigate(`/groups/${encodeURIComponent(name)}`)}
        />
      )}
      {dialog?.kind === "pick-link" && (
        <PickerModal
          title="Send a sign-in link"
          description="Choose who needs help signing in. You'll get a one-time link to send them."
          options={personOptions(activeUsers)}
          multiple={false}
          searchPlaceholder="Search people…"
          emptyMessage="There's nobody here yet."
          confirmLabel={() => "Create link"}
          onConfirm={([name]) => {
            const user = users.find((u) => entryName(u) === name);
            if (user) setDialog({ kind: "setup-link", user });
            return false;
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === "setup-link" && <SetupLinkModal user={dialog.user} onClose={close} />}
      {dialog?.kind === "pick-offboard" && (
        <PickerModal
          title="Offboard someone"
          description="Choose who is leaving. Their access is suspended straight away, and nothing is deleted."
          options={personOptions(activeUsers)}
          multiple={false}
          searchPlaceholder="Search people…"
          emptyMessage="There's nobody active to offboard."
          confirmLabel={() => "Continue"}
          onConfirm={([name]) => {
            const user = users.find((u) => entryName(u) === name);
            if (user) setDialog({ kind: "confirm-offboard", user });
            return false;
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === "confirm-offboard" && (
        <ConfirmDialog
          open
          title={`Suspend ${userDisplayName(dialog.user)}'s access?`}
          message={
            <>
              <p>
                They won't be able to sign in to this account or any connected app. Their account,
                groups and history are kept, so you can restore access at any time.
              </p>
            </>
          }
          confirmLabel="Suspend access"
          onConfirm={async () => {
            const user = dialog.user;
            const ok = await run(
              () => disableUser(entryName(user)),
              `${userDisplayName(user)}'s access has been suspended`,
            );
            if (ok) {
              close();
              reload();
            }
          }}
          onCancel={close}
        />
      )}
    </div>
  );
}
