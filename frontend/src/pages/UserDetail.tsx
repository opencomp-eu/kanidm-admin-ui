import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getUser,
  deleteUser,
  disableUser,
  enableUser,
  getUserGroups,
  addUserToGroup,
  removeUserFromGroup,
  listGroups,
  listUsers,
  copyGroupsFrom,
  generateResetToken,
} from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, attrVals, userDisplayName, userStatus } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<KanidmEntry | null>(null);
  const [allGroups, setAllGroups] = useState<KanidmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showCopyGroups, setShowCopyGroups] = useState(false);
  const [allUsers, setAllUsers] = useState<KanidmEntry[]>([]);
  const [copySearch, setCopySearch] = useState("");
  const [copying, setCopying] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [resetUrl, setResetUrl] = useState("");

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([getUser(id), getUserGroups(id), listGroups()])
      .then(([u, _g, all]) => {
        setUser(u);
        setAllGroups(all);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteUser(id);
      navigate("/users");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDisable = async () => {
    if (!id) return;
    try {
      const status = userStatus(user!);
      if (status === "active") {
        await disableUser(id);
      } else {
        await enableUser(id);
      }
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddGroup = async (groupName: string) => {
    if (!id) return;
    try {
      await addUserToGroup(id, groupName);
      setShowAddGroup(false);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemoveGroup = async (groupName: string) => {
    if (!id) return;
    try {
      await removeUserFromGroup(id, groupName);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCopySearch = (query: string) => {
    setCopySearch(query);
  };

  const filteredUsers = allUsers.filter((u) => {
    const name = attrVal(u, "name");
    const displayName = userDisplayName(u);
    const q = copySearch.toLowerCase();
    return name !== id && (name.toLowerCase().includes(q) || displayName.toLowerCase().includes(q));
  });

  const handleCopyGroups = async (sourceUser: string) => {
    if (!id) return;
    setCopying(true);
    try {
      await copyGroupsFrom(id, sourceUser);
      setShowCopyGroups(false);
      setCopySearch("");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setCopying(false);
    }
  };

  const handleOpenCopyGroups = async () => {
    setShowCopyGroups(true);
    setCopySearch("");
    try {
      const users = await listUsers();
      setAllUsers(users);
    } catch {
      setAllUsers([]);
    }
  };

  const handleSetPassword = async () => {
    if (!id) return;
    try {
      const result = await generateResetToken(id);
      setResetUrl(result.reset_url);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (showSetPassword && !resetUrl) {
      handleSetPassword();
    }
  }, [showSetPassword, resetUrl]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <div className="error">User not found</div>;

  const status = userStatus(user);
  const memberOf = attrVals(user, "memberof");
  const availableGroups = allGroups.filter(
    (g) => !memberOf.includes(attrVal(g, "name")),
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/users" style={{ fontSize: 14 }}>
          &larr; Back to users
        </Link>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <h1>{userDisplayName(user)}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={handleDisable}>
            {status === "active" ? "Disable" : "Enable"}
          </button>
          <button className="btn-danger" onClick={() => setShowDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Account Details</h2>
          <button className="btn-ghost btn-sm" onClick={() => setShowSetPassword(true)}>
            Generate Reset Token
          </button>
        </div>
        <dl className="detail-grid">
          <dt>Username</dt>
          <dd>{attrVal(user, "name")}</dd>
          <dt>Display Name</dt>
          <dd>{attrVal(user, "displayname")}</dd>
          <dt>Email</dt>
          <dd>{attrVal(user, "mail") || "—"}</dd>
          <dt>UUID</dt>
          <dd>{attrVal(user, "uuid")}</dd>
          <dt>Status</dt>
          <dd>
            <span className={`badge ${status === "active" ? "badge-active" : "badge-disabled"}`}>
              {status}
            </span>
          </dd>
        </dl>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Group Memberships</h2>
          <button className="btn-primary btn-sm" onClick={() => setShowAddGroup(true)}>
            Add to Group
          </button>
          <button className="btn-ghost btn-sm" onClick={handleOpenCopyGroups}>
            Copy Groups From...
          </button>
        </div>
        {memberOf.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No group memberships</div>
        ) : (
          <div className="tag-list">
            {memberOf.map((g) => (
              <span key={g} className="tag">
                <Link to={`/groups/${encodeURIComponent(g)}`}>{g}</Link>
                <button onClick={() => handleRemoveGroup(g)} title="Remove from group">
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${attrVal(user, "name")}"? This sends them to the recycle bin.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      {showAddGroup && (
        <div className="modal-overlay" onClick={() => setShowAddGroup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add to Group</h2>
            {availableGroups.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No more groups to add</p>
            ) : (
              <div className="tag-list" style={{ marginTop: 12 }}>
                {availableGroups.map((g) => (
                  <button
                    key={attrVal(g, "name")}
                    className="tag"
                    style={{ cursor: "pointer", border: "none" }}
                    onClick={() => handleAddGroup(attrVal(g, "name"))}
                  >
                    {attrVal(g, "name")}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowAddGroup(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showCopyGroups && (
        <div className="modal-overlay" onClick={() => setShowCopyGroups(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Copy Groups From User</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
              Search for a user to copy their group memberships to {attrVal(user, "name")}.
            </p>
            <input
              type="search"
              placeholder="Search users..."
              value={copySearch}
              onChange={(e) => handleCopySearch(e.target.value)}
              autoFocus
            />
            {filteredUsers.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 200, overflowY: "auto" }}>
                {filteredUsers.map((u) => (
                  <button
                    key={attrVal(u, "name")}
                    className="tag"
                    style={{ cursor: "pointer", border: "none", display: "block", width: "100%", textAlign: "left", padding: "8px 12px" }}
                    onClick={() => handleCopyGroups(attrVal(u, "name"))}
                    disabled={copying}
                  >
                    {userDisplayName(u)} ({attrVal(u, "name")})
                  </button>
                ))}
              </div>
            )}
            {copySearch.length > 0 && filteredUsers.length === 0 && (
              <div style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 14 }}>No users found</div>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => { setShowCopyGroups(false); setCopySearch(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showSetPassword && (
        <div className="modal-overlay" onClick={() => { setShowSetPassword(false); setResetUrl(""); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Credential Reset for {attrVal(user, "name")}</h2>
            {resetUrl ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 8 }}>
                  Share this link with the user to set their password:
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
                <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
                  This token is single-use and expires after 1 hour.
                </p>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", marginTop: 12 }}>
                Generating reset token...
              </p>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => { setShowSetPassword(false); setResetUrl(""); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
