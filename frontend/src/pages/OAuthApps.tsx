import { useEffect, useState } from "react";
import { listOAuth2Apps, createOAuth2App, deleteOAuth2App } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

export default function OAuthApps() {
  const [apps, setApps] = useState<KanidmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    displayname: "",
    origin: "",
    redirect_uri: "",
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listOAuth2Apps()
      .then(setApps)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createOAuth2App(createForm);
      setShowCreate(false);
      setCreateForm({ name: "", displayname: "", origin: "", redirect_uri: "" });
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteOAuth2App(deleteTarget);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div>
      <h1>OAuth2 Applications</h1>
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          Create App
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : apps.length === 0 ? (
        <div className="empty-state">No OAuth2 applications</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Display Name</th>
              <th>Origin</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={attrVal(a, "name")}>
                <td>{attrVal(a, "name")}</td>
                <td>{attrVal(a, "displayname")}</td>
                <td style={{ color: "var(--text-muted)" }}>
                  {attrVal(a, "origin")}
                </td>
                <td>
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => setDeleteTarget(attrVal(a, "name"))}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create OAuth2 App</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Client ID</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  required
                  value={createForm.displayname}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, displayname: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Origin URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://app.example.com"
                  value={createForm.origin}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, origin: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Redirect URI</label>
                <input
                  type="text"
                  required
                  placeholder="https://app.example.com/callback"
                  value={createForm.redirect_uri}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, redirect_uri: e.target.value }))
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete OAuth2 App"
        message={`Are you sure you want to delete "${deleteTarget}"?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
