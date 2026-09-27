import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteOAuth2App,
  getOAuth2App,
  grantAppAccess,
  listGroups,
  revokeAppAccess,
  runForEach,
} from "../api";
import {
  appAccessGroups,
  appDisplayName,
  appUrl,
  attrVal,
  entryName,
  groupMemberNames,
  isSystemEntry,
} from "../types";
import { useAction, useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import PickerModal from "../components/PickerModal";
import { groupOptions } from "../components/PickerList";
import { Banner, ErrorBanner, LoadingState } from "../components/States";
import { useToast } from "../components/Toast";

type Dialog = { kind: "grant" } | { kind: "revoke"; group: string } | { kind: "delete" };

export default function OAuthAppDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { run } = useAction();
  const { addToast } = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { data, error, reload } = useLoader(() => Promise.all([getOAuth2App(id), listGroups()]), [id]);
  const close = () => setDialog(null);
  usePageTitle(data ? appDisplayName(data[0]) : "App");

  if (error) {
    return (
      <div>
        <PageHeader title="App" back={{ to: "/oauth2", label: "All apps" }} />
        <ErrorBanner error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <LoadingState />;

  const [app, groups] = data;
  const name = entryName(app);
  const displayName = appDisplayName(app);
  const url = appUrl(app);
  const access = appAccessGroups(app);
  const groupByName = new Map(groups.map((g) => [entryName(g), g]));
  const peopleWithAccess = new Set(access.flatMap((g) => {
    const entry = groupByName.get(g);
    return entry ? groupMemberNames(entry) : [];
  }));
  const grantable = groups.filter((g) => !isSystemEntry(g) && !access.includes(entryName(g)));

  const handleGrant = async (selected: string[]) => {
    const { succeeded, failed } = await runForEach(selected, (g) => grantAppAccess(name, g));
    reload();
    if (succeeded.length > 0) addToast(`${succeeded.join(", ")} can now sign in to ${displayName}`);
    if (failed.length > 0) addToast(`Couldn't give access to ${failed.join(", ")}. Please try again.`, "error");
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/oauth2", label: "All apps" }}
        leading={<Avatar name={displayName} size="xl" />}
        title={displayName}
        description={url || name}
        actions={
          <>
            {url && (
              <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={16} />
                Open app
              </a>
            )}
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "grant" })}>
              <Icon name="plus" size={16} />
              Give a group access
            </button>
          </>
        }
      />

      {access.length === 0 && (
        <Banner tone="warning">
          Nobody can sign in to {displayName} yet. Give at least one group access to get started.
        </Banner>
      )}

      <div className="detail-columns">
        <div className="detail-main">
          <Card
            title="Who can sign in"
            description={
              access.length
                ? `${peopleWithAccess.size} ${peopleWithAccess.size === 1 ? "person" : "people"} across ${access.length} ${access.length === 1 ? "group" : "groups"}.`
                : "Members of these groups can sign in with their company account."
            }
          >
            {access.length === 0 ? (
              <div className="inline-empty">
                No groups yet.{" "}
                <button className="link-btn" onClick={() => setDialog({ kind: "grant" })}>
                  Give a group access
                </button>
              </div>
            ) : (
              <ul className="row-list">
                {access.map((g) => {
                  const entry = groupByName.get(g);
                  const count = entry ? groupMemberNames(entry).length : 0;
                  return (
                    <li key={g}>
                      <span className="option-icon">
                        <Icon name="groups" size={16} />
                      </span>
                      <div className="row-list-text">
                        <Link to={`/groups/${encodeURIComponent(g)}`}>{g}</Link>
                        <span className="muted small">
                          {(entry && attrVal(entry, "description")) ||
                            `${count} ${count === 1 ? "member" : "members"}`}
                        </span>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDialog({ kind: "revoke", group: g })}
                      >
                        Remove access
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="detail-side">
          <Card
            title="Connection details"
            description="Your IT contact may ask for these when setting up the app."
          >
            <dl className="detail-list">
              <dt>Client ID</dt>
              <dd className="mono">{name}</dd>
              {url && (
                <>
                  <dt>Address</dt>
                  <dd className="small">{url}</dd>
                </>
              )}
            </dl>
            <p className="muted small" style={{ marginTop: 12 }}>
              The client secret is only shown in Kanidm itself, for security.
            </p>
          </Card>

          <Card title="Disconnect app" tone="danger">
            <div className="danger-row">
              <p className="muted small">Nobody will be able to sign in to it with their company account.</p>
              <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: "delete" })}>
                Disconnect
              </button>
            </div>
          </Card>
        </div>
      </div>

      {dialog?.kind === "grant" && (
        <PickerModal
          title={`Who can sign in to ${displayName}?`}
          description="Everyone in the groups you choose will be able to sign in."
          options={groupOptions(grantable)}
          searchPlaceholder="Search groups…"
          emptyMessage="Every group already has access. Create a new group from the Groups page."
          confirmLabel={(n) => (n > 1 ? `Give ${n} groups access` : "Give access")}
          onConfirm={handleGrant}
          onClose={close}
        />
      )}
      {dialog?.kind === "revoke" && (
        <ConfirmDialog
          open
          title={`Remove ${dialog.group}'s access?`}
          message={
            <p>
              Members of {dialog.group} won't be able to sign in to {displayName} any more, unless another
              group gives them access.
            </p>
          }
          confirmLabel="Remove access"
          onConfirm={async () => {
            const ok = await run(
              () => revokeAppAccess(name, dialog.group),
              `${dialog.group} can no longer sign in to ${displayName}`,
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
          title={`Disconnect ${displayName}?`}
          message={
            <p>
              Nobody will be able to sign in to {displayName} with their company account. To reconnect it
              later, the app will need to be set up again.
            </p>
          }
          confirmLabel="Disconnect app"
          onConfirm={async () => {
            const ok = await run(() => deleteOAuth2App(name), `${displayName} was disconnected`);
            if (ok) navigate("/oauth2");
          }}
          onCancel={close}
        />
      )}
    </div>
  );
}
