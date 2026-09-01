import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getGroup,
  deleteGroup,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  listUsers,
} from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, attrVals } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<KanidmEntry | null>(null);
  const [allUsers, setAllUsers] = useState<KanidmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
      Promise.all([getGroup(id), getGroupMembers(id), listUsers()])
      .then(([g, _m, u]) => {
        setGroup(g);
        setAllUsers(u);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteGroup(id);
      navigate("/groups");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!id) return;
    try {
      await addGroupMember(id, userId);
      setShowAddMember(false);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!id) return;
    try {
      await removeGroupMember(id, userId);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!group) return <div className="error">Group not found</div>;

  const memberNames = attrVals(group, "member");
  const availableUsers = allUsers.filter(
    (u) => !memberNames.includes(attrVal(u, "name")),
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/groups" style={{ fontSize: 14 }}>
          &larr; Back to groups
        </Link>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <h1>{attrVal(group, "name")}</h1>
        <button className="btn-danger" onClick={() => setShowDelete(true)}>
          Delete Group
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Group Details</h2>
        <dl className="detail-grid">
          <dt>Name</dt>
          <dd>{attrVal(group, "name")}</dd>
          <dt>Description</dt>
          <dd>{attrVal(group, "description") || "—"}</dd>
          <dt>UUID</dt>
          <dd>{attrVal(group, "uuid")}</dd>
        </dl>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Members ({memberNames.length})</h2>
          <button className="btn-primary btn-sm" onClick={() => setShowAddMember(true)}>
            Add Member
          </button>
        </div>
        {memberNames.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No members</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {memberNames.map((m) => (
                <tr key={m}>
                  <td>
                    <Link to={`/users/${encodeURIComponent(m)}`}>{m}</Link>
                  </td>
                  <td>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleRemoveMember(m)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Group"
        message={`Are you sure you want to delete "${attrVal(group, "name")}"? This sends it to the recycle bin.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      {showAddMember && (
        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Member</h2>
            {availableUsers.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No more users to add</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 12 }}>
                {availableUsers.map((u) => (
                  <div
                    key={attrVal(u, "name")}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                    className="user-row"
                    onClick={() => handleAddMember(attrVal(u, "name"))}
                  >
                    {attrVal(u, "displayname") || attrVal(u, "name")}
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                      ({attrVal(u, "name")})
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowAddMember(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
