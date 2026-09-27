import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addGroupMember,
  deleteGroup,
  getGroup,
  getGroupMembers,
  listOAuth2Apps,
  listUsers,
  removeGroupMember,
  runForEach,
} from "../api";
import type { KanidmEntry } from "../types";
import {
  appAccessGroups,
  appDisplayName,
  attrVal,
  entryName,
  isSuspended,
  isSystemEntry,
  matchesQuery,
  userDisplayName,
} from "../types";
import { useAction, useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import PickerModal from "../components/PickerModal";
import { personOptions } from "../components/PickerList";
import SearchInput from "../components/SearchInput";
import StatusBadge from "../components/StatusBadge";
import { Banner, ErrorBanner, LoadingState } from "../components/States";
import { useToast } from "../components/Toast";
import { EditGroupModal } from "../components/GroupModals";

const MEMBER_SEARCH_THRESHOLD = 8;

type Dialog =
  | { kind: "edit" }
  | { kind: "add-members" }
  | { kind: "remove-member"; member: KanidmEntry }
  | { kind: "delete" };

export default function GroupDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { run } = useAction();
  const { addToast } = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const { data, error, reload } = useLoader(
    () =>
      Promise.all([
        getGroup(id),
        getGroupMembers(id),
        listUsers(),
        listOAuth2Apps().catch(() => [] as KanidmEntry[]),
      ]),
    [id],
  );
  const close = () => setDialog(null);
  usePageTitle(data ? entryName(data[0]) : "Group");

  if (error) {
    return (
      <div>
        <PageHeader title="Group" back={{ to: "/groups", label: "All groups" }} />
        <ErrorBanner error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <LoadingState />;

  const [group, members, users, apps] = data;
  const name = entryName(group);
  const system = isSystemEntry(group);
  const memberNames = new Set(members.map(entryName));
  const nonMembers = users.filter((u) => !memberNames.has(entryName(u)));
  const grantedApps = apps.filter((a) => appAccessGroups(a).includes(name));
  const visibleMembers = members
    .filter((m) => matchesQuery(memberQuery, userDisplayName(m), entryName(m), attrVal(m, "mail")))
    .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)));

  const handleAddMembers = async (selected: string[]) => {
    const { succeeded, failed } = await runForEach(selected, (m) => addGroupMember(name, m));
    reload();
    if (succeeded.length > 0) {
      addToast(`Added ${succeeded.length} ${succeeded.length === 1 ? "person" : "people"} to ${name}`);
    }
    if (failed.length > 0) {
      addToast(`Couldn't add ${failed.join(", ")}. Please try again.`, "error");
    }
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/groups", label: "All groups" }}
        leading={
          <span className="header-icon">
            <Icon name="groups" size={24} />
          </span>
        }
        title={
          <span className="title-with-badge">
            {name}
            {system && <span className="badge badge-neutral">Built-in</span>}
          </span>
        }
        description={
          attrVal(group, "description") || (
            <span className="muted-italic">No description yet. Add one so others know what it's for.</span>
          )
        }
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setDialog({ kind: "edit" })}>
              <Icon name="edit" size={16} />
              Edit
            </button>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "add-members" })}>
              <Icon name="personAdd" size={16} />
              Add people
            </button>
          </>
        }
      />

      {system && (
        <Banner tone="warning">
          This is a built-in Kanidm group. It may grant powerful rights (such as managing accounts), so
          only add people who really need it.
        </Banner>
      )}

      <div className="detail-columns">
        <div className="detail-main">
          <Card
            title={`Members (${members.length})`}
            actions={
              members.length > MEMBER_SEARCH_THRESHOLD ? (
                <SearchInput value={memberQuery} onChange={setMemberQuery} placeholder="Search members…" />
              ) : undefined
            }
          >
            {members.length === 0 ? (
              <div className="inline-empty">
                Nobody is in this group yet.{" "}
                <button className="link-btn" onClick={() => setDialog({ kind: "add-members" })}>
                  Add people
                </button>
              </div>
            ) : visibleMembers.length === 0 ? (
              <div className="inline-empty">No members match “{memberQuery}”.</div>
            ) : (
              <ul className="row-list">
                {visibleMembers.map((m) => {
                  const memberName = entryName(m);
                  const isPerson = Boolean(attrVal(m, "uuid"));
                  return (
                    <li key={memberName}>
                      <Avatar
                        name={userDisplayName(m)}
                        seed={memberName}
                        size="sm"
                        muted={isSuspended(m)}
                      />
                      <div className="row-list-text">
                        {isPerson ? (
                          <Link to={`/users/${encodeURIComponent(memberName)}`}>{userDisplayName(m)}</Link>
                        ) : (
                          <span>{memberName}</span>
                        )}
                        <span className="muted small">
                          {isPerson ? attrVal(m, "mail") || memberName : "Group or service account"}
                        </span>
                      </div>
                      {isPerson && <StatusBadge user={m} />}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDialog({ kind: "remove-member", member: m })}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="detail-side">
          <Card title="Gives access to" description="Members can sign in to these apps.">
            {grantedApps.length === 0 ? (
              <p className="muted small">
                No apps yet. Open an app from the <Link to="/oauth2">Apps</Link> page to give this group
                access.
              </p>
            ) : (
              <ul className="mini-list">
                {grantedApps.map((a) => (
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

          <Card title="Details">
            <dl className="detail-list">
              <dt>Name</dt>
              <dd>{name}</dd>
              <dt>Members</dt>
              <dd>{members.length}</dd>
              <dt>Group ID</dt>
              <dd className="mono small">{attrVal(group, "uuid") || "—"}</dd>
            </dl>
          </Card>

          {!system && (
            <Card title="Delete group" tone="danger">
              <div className="danger-row">
                <p className="muted small">
                  People stay, but lose anything this group gave them access to.
                </p>
                <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: "delete" })}>
                  Delete
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {dialog?.kind === "edit" && <EditGroupModal group={group} onClose={close} onSaved={reload} />}
      {dialog?.kind === "add-members" && (
        <PickerModal
          title={`Add people to ${name}`}
          description={
            grantedApps.length
              ? `They'll be able to sign in to ${grantedApps.map(appDisplayName).join(", ")}.`
              : undefined
          }
          options={personOptions(nonMembers)}
          searchPlaceholder="Search people…"
          emptyMessage="Everyone is already in this group."
          confirmLabel={(n) => (n > 1 ? `Add ${n} people` : "Add person")}
          onConfirm={handleAddMembers}
          onClose={close}
        />
      )}
      {dialog?.kind === "remove-member" && (
        <ConfirmDialog
          open
          title={`Remove ${userDisplayName(dialog.member)} from ${name}?`}
          message={<p>They'll lose anything this group gives access to. You can add them back later.</p>}
          confirmLabel="Remove"
          onConfirm={async () => {
            const ok = await run(
              () => removeGroupMember(name, entryName(dialog.member)),
              `${userDisplayName(dialog.member)} removed from ${name}`,
            );
            if (ok) {
              close();
              reload();
            }
          }}
          onCancel={close}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          open
          title={`Delete the ${name} group?`}
          message={
            <p>
              The {members.length} {members.length === 1 ? "person" : "people"} in it keep their accounts,
              but lose anything this group gave them access to
              {grantedApps.length ? `, including ${grantedApps.map(appDisplayName).join(", ")}` : ""}.
            </p>
          }
          confirmLabel="Delete group"
          onConfirm={async () => {
            const ok = await run(() => deleteGroup(name), `The ${name} group was deleted`);
            if (ok) navigate("/groups");
          }}
          onCancel={close}
        />
      )}
    </div>
  );
}
