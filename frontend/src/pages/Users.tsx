import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, createUser, generateResetToken } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, userDisplayName, userStatus } from "../types";
import { useToast } from "../components/Layout";

export default function Users() {
  const [users, setUsers] = useState<KanidmEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    displayname: "",
    mail: "",
  });
  const [creating, setCreating] = useState(false);
  const [resetUrl, setResetUrl] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");
  const { addToast } = useToast();

  const load = () => {
    setLoading(true);
    listUsers(search || undefined)
      .then(setUsers)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createUser(createForm);
      const username = createForm.name;
      setCreatedUsername(username);
      setCreateForm({ name: "", displayname: "", mail: "" });
      load();
      try {
        const result = await generateResetToken(username);
        setResetUrl(result.reset_url);
      } catch {
        setShowCreate(false);
        addToast("User created");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleCopyResetUrl = async () => {
    try {
      await navigator.clipboard.writeText(resetUrl);
      addToast("Reset URL copied to clipboard");
    } catch {
      addToast("Failed to copy", "error");
    }
  };

  const handleCloseResetModal = () => {
    setResetUrl("");
    setCreatedUsername("");
    setShowCreate(false);
  };

  return (
    <div>
      <h1>Users</h1>
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1 }}>
          <input
            type="search"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <button type="submit" className="btn-ghost">
            Search
          </button>
        </form>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          Create User
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : users.length === 0 ? (
        <div className="empty-state">No users found</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={attrVal(u, "uuid")} className="user-row">
                <td>
                  <Link to={`/users/${attrVal(u, "name")}`}>
                    {userDisplayName(u)}
                  </Link>
                </td>
                <td>{attrVal(u, "name")}</td>
                <td>{attrVal(u, "mail")}</td>
                <td>
                  <span
                    className={`badge ${
                      userStatus(u) === "active" ? "badge-active" : "badge-disabled"
                    }`}
                  >
                    {userStatus(u)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={handleCloseResetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create User</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Username</label>
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
                <label>Email</label>
                <input
                  type="email"
                  value={createForm.mail}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, mail: e.target.value }))
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleCloseResetModal}
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

      {resetUrl && (
        <div className="modal-overlay" onClick={handleCloseResetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>User Created</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
              {createdUsername} has been created. Share this password reset link:
            </p>
            <div style={{
              background: "var(--bg-secondary)",
              padding: "12px",
              borderRadius: "6px",
              fontFamily: "monospace",
              fontSize: 13,
              wordBreak: "break-all"
            }}>
              {resetUrl}
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="btn-copy" onClick={handleCopyResetUrl}>
                Copy URL
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
              This token is single-use and expires after 1 hour.
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={handleCloseResetModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
