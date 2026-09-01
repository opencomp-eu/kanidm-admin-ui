import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, listGroups, createUser, generateResetToken } from "../api";
import { useToast } from "../components/Layout";

export default function Dashboard() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    displayname: "",
    mail: "",
  });
  const [creating, setCreating] = useState(false);
  const [resetUrl, setResetUrl] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");
  const { addToast } = useToast();

  useEffect(() => {
    listUsers()
      .then((u) => setUserCount(u.length))
      .catch((e) => setError(String(e)));
    listGroups()
      .then((g) => setGroupCount(g.length))
      .catch((e) => setError(String(e)));
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createUser(createForm);
      const username = createForm.name;
      setCreatedUsername(username);
      setCreateForm({ name: "", displayname: "", mail: "" });
      listUsers().then((u) => setUserCount(u.length));
      try {
        const result = await generateResetToken(username);
        setResetUrl(result.reset_url);
      } catch {
        setShowCreateUser(false);
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
    setShowCreateUser(false);
  };

  return (
    <div>
      <h1>Dashboard</h1>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Link to="/users" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
              Users
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {userCount ?? "—"}
            </div>
          </div>
        </Link>
        <Link to="/groups" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
              Groups
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {groupCount ?? "—"}
            </div>
          </div>
        </Link>
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn-primary" onClick={() => setShowCreateUser(true)}>
          Create User
        </button>
      </div>

      {showCreateUser && (
        <div className="modal-overlay" onClick={handleCloseResetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create User</h2>
            <form onSubmit={handleCreateUser}>
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
