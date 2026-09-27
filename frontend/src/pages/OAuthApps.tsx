import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listOAuth2Apps } from "../api";
import { appAccessGroups, appDisplayName, appUrl, entryName, matchesQuery } from "../types";
import { useLoader, usePageTitle } from "../hooks";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import { EmptyState, ErrorBanner, LoadingState } from "../components/States";
import { CreateAppModal } from "../components/AppModals";

export default function OAuthApps() {
  usePageTitle("Apps");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { data: apps, error, reload } = useLoader(listOAuth2Apps, []);

  const visible = (apps ?? [])
    .filter((a) => matchesQuery(query, appDisplayName(a), entryName(a), appUrl(a)))
    .sort((a, b) => appDisplayName(a).localeCompare(appDisplayName(b)));

  return (
    <div>
      <PageHeader
        title="Apps"
        description="Apps people can sign in to with their company account (single sign-on). Choose which groups can use each one."
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={16} />
            Connect an app
          </button>
        }
      />

      {error !== null && <ErrorBanner error={error} onRetry={reload} />}

      {!apps && !error ? (
        <LoadingState />
      ) : (apps ?? []).length === 0 ? (
        <EmptyState
          icon="apps"
          title="No apps connected yet"
          action={
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={16} />
              Connect your first app
            </button>
          }
        >
          Connect tools like a wiki, chat or file storage so people can sign in with one company account.
        </EmptyState>
      ) : (
        <>
          {(apps ?? []).length > 6 && (
            <div className="toolbar">
              <SearchInput value={query} onChange={setQuery} placeholder="Search apps…" />
            </div>
          )}
          <div className="card-grid">
            {visible.map((a) => {
              const name = entryName(a);
              const access = appAccessGroups(a);
              return (
                <Link key={name} to={`/oauth2/${encodeURIComponent(name)}`} className="group-card">
                  <div className="group-card-head">
                    <Avatar name={appDisplayName(a)} size="md" />
                    <div>
                      <div className="group-card-name">{appDisplayName(a)}</div>
                      <div className="muted small truncate">{appUrl(a) || name}</div>
                    </div>
                  </div>
                  <div className="group-card-foot">
                    {access.length === 0 ? (
                      <span className="badge badge-warning">
                        <Icon name="alert" size={13} />
                        Nobody can sign in yet
                      </span>
                    ) : (
                      <span className="muted small">
                        <Icon name="groups" size={14} /> {access.join(", ")}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          {visible.length === 0 && (
            <EmptyState icon="search" title="No matching apps">
              Nothing matches “{query}”.
            </EmptyState>
          )}
        </>
      )}

      {showCreate && (
        <CreateAppModal
          onClose={() => setShowCreate(false)}
          onCreated={(name) => navigate(`/oauth2/${encodeURIComponent(name)}`)}
        />
      )}
    </div>
  );
}
