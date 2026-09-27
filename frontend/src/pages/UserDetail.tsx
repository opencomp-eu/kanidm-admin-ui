import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addUserToGroup,
  deleteUser,
  disableUser,
  enableUser,
  getSignInMethods,
  getUser,
  listGroups,
  listOAuth2Apps,
  listUsers,
  removeUserFromGroup,
  runForEach,
} from "../api";
import type { KanidmEntry } from "../types";
import {
  accountStatus,
  appAccessGroups,
  appDisplayName,
  attrVal,
  attrVals,
  directGroupNames,
  entryName,
  formatDate,
  isSystemEntry,
  isSystemGroupName,
  spnName,
  systemGroupNameSet,
  teamGroupNames,
  userDisplayName,
} from "../types";
import { useAction, useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import PickerModal from "../components/PickerModal";
import { groupOptions, personOptions } from "../components/PickerList";
import StatusBadge from "../components/StatusBadge";
import { Banner, ErrorBanner, LoadingState } from "../components/States";
import { useToast } from "../components/Toast";
import { EditPersonModal, GroupPreview, SetupLinkModal } from "../components/UserModals";

type Dialog =
  | { kind: "edit" }
  | { kind: "link" }
  | { kind: "add-groups" }
  | { kind: "pick-colleague" }
  | { kind: "confirm-copy"; colleague: KanidmEntry; groups: string[] }
  | { kind: "remove-group"; group: string }
  | { kind: "suspend" }
  | { kind: "delete" };

function SignInCard({ username, onSendLink }: { username: string; onSendLink: () => void }) {
  const { data: methods, error } = useLoader(() => getSignInMethods(username), [username]);
  return (
    <Card title="Sign-in" description="How this person proves who they are.">
      {error ? (
        <p className="muted small">We couldn't check their sign-in methods right now.</p>
      ) : !methods ? (
        <LoadingState label="Checking…" />
      ) : methods.length === 0 ? (
        <div className="callout callout-warning">
          <Icon name="alert" size={18} />
          <div>
            <strong>Not set up yet</strong>
            <p>They haven't chosen a password or passkey, so they can't sign in.</p>
            <button className="btn btn-secondary btn-sm" onClick={onSendLink}>
              <Icon name="key" size={15} />
              Send setup link
            </button>
          </div>
        </div>
      ) : (
        <ul className="check-list">
          {methods.map((m, i) => (
            <li key={`${m}-${i}`}>
              <Icon name="check" size={16} />
              {m}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function UserDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { run } = useAction();
  const { addToast } = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [colleagues, setColleagues] = useState<KanidmEntry[] | null>(null);
  const { data, error, reload } = useLoader(
    () =>
      Promise.all([
        getUser(id),
        listGroups(),
        // App access is extra context; the page still works without it.
        listOAuth2Apps().catch(() => [] as KanidmEntry[]),
      ]),
    [id],
  );
  const close = () => setDialog(null);
  usePageTitle(data ? userDisplayName(data[0]) : "Person");

  if (error) {
    return (
      <div>
        <PageHeader title="Person" back={{ to: "/users", label: "All people" }} />
        <ErrorBanner error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <LoadingState />;

  const [user, groups, apps] = data;
  const name = entryName(user);
  const displayName = userDisplayName(user);
  const firstName = displayName.split(" ")[0];
  const status = accountStatus(user);
  const suspended = status.kind === "suspended";
  const systemNames = systemGroupNameSet(groups);
  const memberGroups = teamGroupNames(user, systemNames);
  const builtinGroups = directGroupNames(user).filter(
    (g) => systemNames.has(g) || isSystemGroupName(g),
  );
  const allMemberships = new Set(attrVals(user, "memberof").map(spnName));
  const usableApps = apps.filter((a) => appAccessGroups(a).some((g) => allMemberships.has(g)));
  const availableGroups = groups.filter(
    (g) => !isSystemEntry(g) && !memberGroups.includes(entryName(g)),
  );

  const openCopyFromColleague = async () => {
    setDialog({ kind: "pick-colleague" });
    if (!colleagues) setColleagues(await listUsers().catch(() => []));
  };

  const handleAddGroups = async (selected: string[]) => {
    const { succeeded, failed } = await runForEach(selected, (g) => addUserToGroup(name, g));
    reload();
    if (succeeded.length > 0) {
      addToast(`Added ${firstName} to ${succeeded.join(", ")}`);
    }
    if (failed.length > 0) {
      addToast(`Couldn't add ${firstName} to ${failed.join(", ")}. Please try again.`, "error");
    }
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/users", label: "All people" }}
        leading={<Avatar name={displayName} seed={name} size="xl" muted={suspended} />}
        title={
          <span className="title-with-badge">
            {displayName}
            <StatusBadge user={user} />
          </span>
        }
        description={[name, attrVal(user, "mail")].filter(Boolean).join(" · ")}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setDialog({ kind: "edit" })}>
              <Icon name="edit" size={16} />
              Edit details
            </button>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "link" })}>
              <Icon name="key" size={16} />
              Send sign-in link
            </button>
          </>
        }
      />

      {suspended && (
        <div className="banner banner-danger banner-action">
          <Icon name="lock" size={18} />
          <div className="banner-body">
            <strong>Access suspended{status.since ? ` since ${formatDate(status.since)}` : ""}.</strong>{" "}
            {firstName} can't sign in to anything right now.
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              run(() => enableUser(name), `${firstName}'s access has been restored`).then(reload)
            }
          >
            <Icon name="unlock" size={15} />
            Restore access
          </button>
        </div>
      )}
      {status.kind === "not_started" && (
        <Banner tone="warning" icon="clock">
          This account becomes usable on {formatDate(status.startsAt)}.
        </Banner>
      )}

      <div className="detail-columns">
        <div className="detail-main">
          <Card
            title="Groups"
            description="Groups decide which apps and resources someone can use."
            actions={
              <>
                <button className="btn btn-ghost btn-sm" onClick={openCopyFromColleague}>
                  <Icon name="copy" size={15} />
                  Copy from a colleague
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: "add-groups" })}>
                  <Icon name="plus" size={15} />
                  Add to groups
                </button>
              </>
            }
          >
            {memberGroups.length === 0 ? (
              <div className="inline-empty">
                {firstName} isn't in any groups yet, so they probably can't use your apps.
              </div>
            ) : (
              <ul className="row-list">
                {memberGroups.map((g) => {
                  const entry = groups.find((x) => entryName(x) === g);
                  return (
                    <li key={g}>
                      <span className="option-icon">
                        <Icon name="groups" size={16} />
                      </span>
                      <div className="row-list-text">
                        <Link to={`/groups/${encodeURIComponent(g)}`}>{g}</Link>
                        {entry && attrVal(entry, "description") && (
                          <span className="muted small">{attrVal(entry, "description")}</span>
                        )}
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDialog({ kind: "remove-group", group: g })}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {builtinGroups.length > 0 && (
              <details className="builtin-groups">
                <summary>Also in {builtinGroups.length} built-in Kanidm {builtinGroups.length === 1 ? "group" : "groups"}</summary>
                <p className="muted small">
                  These are managed by Kanidm itself (for example admin rights). Change them only if you
                  know what they do.
                </p>
                <div className="chip-list">
                  {builtinGroups.map((g) => (
                    <Link key={g} to={`/groups/${encodeURIComponent(g)}`} className="chip chip-muted">
                      {g}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </Card>

          <Card title="Apps they can use" description="Worked out from their groups.">
            {usableApps.length === 0 ? (
              <div className="inline-empty">
                {apps.length === 0
                  ? "No apps have been connected yet."
                  : `${firstName} can't sign in to any connected app yet. Add them to a group that has access.`}
              </div>
            ) : (
              <ul className="mini-list">
                {usableApps.map((a) => (
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

        <div className="detail-side">
          <Card
            title="Details"
            actions={
              <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "edit" })}>
                Edit
              </button>
            }
          >
            <dl className="detail-list">
              <dt>Full name</dt>
              <dd>{attrVal(user, "displayname") || "—"}</dd>
              <dt>Username</dt>
              <dd>{name}</dd>
              <dt>Email</dt>
              <dd>{attrVal(user, "mail") || <span className="muted-italic">Not set</span>}</dd>
              {status.kind === "active" && status.endsAt && (
                <>
                  <dt>Access ends</dt>
                  <dd>{formatDate(status.endsAt)}</dd>
                </>
              )}
              <dt>Account ID</dt>
              <dd className="mono small">{attrVal(user, "uuid") || "—"}</dd>
            </dl>
          </Card>

          <SignInCard username={name} onSendLink={() => setDialog({ kind: "link" })} />

          <Card title="Leaving or pausing" tone="danger">
            <div className="danger-row">
              <div>
                <strong>{suspended ? "Restore access" : "Suspend access"}</strong>
                <p className="muted small">
                  {suspended
                    ? "Let them sign in again. Their groups are unchanged."
                    : "For leavers or extended leave. Blocks sign-in straight away; nothing is deleted."}
                </p>
              </div>
              {suspended ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    run(() => enableUser(name), `${firstName}'s access has been restored`).then(reload)
                  }
                >
                  Restore
                </button>
              ) : (
                <button className="btn btn-danger-soft btn-sm" onClick={() => setDialog({ kind: "suspend" })}>
                  Suspend
                </button>
              )}
            </div>
            <div className="danger-row">
              <div>
                <strong>Delete account</strong>
                <p className="muted small">Permanently removes the account. Suspending is usually safer.</p>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: "delete" })}>
                Delete
              </button>
            </div>
          </Card>
        </div>
      </div>

      {dialog?.kind === "edit" && <EditPersonModal user={user} onClose={close} onSaved={reload} />}
      {dialog?.kind === "link" && <SetupLinkModal user={user} onClose={close} />}
      {dialog?.kind === "add-groups" && (
        <PickerModal
          title={`Add ${firstName} to groups`}
          options={groupOptions(availableGroups)}
          searchPlaceholder="Search groups…"
          emptyMessage="They're already in every group. Create a new group from the Groups page."
          confirmLabel={(n) => (n > 1 ? `Add to ${n} groups` : "Add to group")}
          onConfirm={handleAddGroups}
          onClose={close}
        />
      )}
      {dialog?.kind === "pick-colleague" && (
        colleagues ? (
          <PickerModal
            title="Copy groups from a colleague"
            description={`${firstName} will be added to the same groups as the person you choose. Built-in Kanidm groups (like admin rights) are never copied.`}
            options={personOptions(colleagues.filter((u) => entryName(u) !== name))}
            multiple={false}
            searchPlaceholder="Search people…"
            emptyMessage="There's nobody else to copy from."
            confirmLabel={() => "Continue"}
            onConfirm={([colleagueName]) => {
              const colleague = colleagues.find((u) => entryName(u) === colleagueName);
              if (colleague) {
                const groupsToAdd = teamGroupNames(colleague, systemNames).filter(
                  (g) => !memberGroups.includes(g),
                );
                setDialog({ kind: "confirm-copy", colleague, groups: groupsToAdd });
              }
              return false;
            }}
            onClose={close}
          />
        ) : (
          <LoadingState />
        )
      )}
      {dialog?.kind === "confirm-copy" && (
        <ConfirmDialog
          open
          tone="primary"
          title={`Copy groups from ${userDisplayName(dialog.colleague)}`}
          message={
            dialog.groups.length === 0 ? (
              <p>{firstName} is already in all of the groups {userDisplayName(dialog.colleague)} is in.</p>
            ) : (
              <GroupPreview groups={dialog.groups} />
            )
          }
          confirmLabel={dialog.groups.length === 0 ? "OK" : "Add to these groups"}
          onConfirm={async () => {
            if (dialog.groups.length > 0) await handleAddGroups(dialog.groups);
            close();
          }}
          onCancel={close}
        />
      )}
      {dialog?.kind === "remove-group" && (
        <ConfirmDialog
          open
          title={`Remove from ${dialog.group}?`}
          message={<p>{firstName} will lose anything this group gives access to. You can add them back later.</p>}
          confirmLabel="Remove"
          onConfirm={async () => {
            const ok = await run(
              () => removeUserFromGroup(name, dialog.group),
              `Removed from ${dialog.group}`,
            );
            if (ok) {
              close();
              reload();
            }
          }}
          onCancel={close}
        />
      )}
      {dialog?.kind === "suspend" && (
        <ConfirmDialog
          open
          title={`Suspend ${displayName}'s access?`}
          message={
            <p>
              They won't be able to sign in to this account or any connected app. Their account and
              groups are kept, so you can restore access at any time.
            </p>
          }
          confirmLabel="Suspend access"
          onConfirm={async () => {
            const ok = await run(() => disableUser(name), `${firstName}'s access has been suspended`);
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
          title={`Delete ${displayName}'s account?`}
          message={
            <>
              <p>
                This removes <strong>{name}</strong> and their group memberships. They won't be able to
                sign in again.
              </p>
              {!suspended && (
                <p className="muted">
                  Tip: if they might come back, or you're not sure yet, suspend their access instead.
                </p>
              )}
            </>
          }
          confirmLabel="Delete account"
          onConfirm={async () => {
            const ok = await run(() => deleteUser(name), `${displayName}'s account was deleted`);
            if (ok) navigate("/users");
          }}
          onCancel={close}
        />
      )}
    </div>
  );
}
