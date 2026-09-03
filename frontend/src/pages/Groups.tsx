import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listGroups, createGroup } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal } from "../types";
import { usePageTitle, useToast } from "../components/Layout";
import Modal from "../components/Modal";

export default function Groups() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<KanidmEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  usePageTitle("Groups");

  const load = () => {
    setLoading(true);
    listGroups(search || undefined)
      .then(setGroups)
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
      await createGroup(createForm);
      setShowCreate(false);
      setCreateForm({ name: "", description: "" });
      addToast("Group created");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Groups</h1>
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1 }}>
          <input
            type="search"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <button type="submit" className="btn-ghost">
            Search
          </button>
        </form>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          Create Group
        </button>
      </div>

      {loading && groups.length === 0 ? (
        <div className="loading">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div>{search ? `No groups matching "${search}"` : "No groups yet"}</div>
          <p>
            {search
              ? "Try a different search term."
              : "Click Create Group to add the first one."}
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Members</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr
                key={attrVal(g, "uuid")}
                className="row-link"
                onClick={() =>
                  navigate(`/groups/${encodeURIComponent(attrVal(g, "name"))}`)
                }
              >
                <td>
                  <Link to={`/groups/${attrVal(g, "name")}`}>
                    {attrVal(g, "name")}
                  </Link>
                </td>
                <td style={{ color: "var(--text-muted)" }}>
                  {attrVal(g, "description") || "—"}
                </td>
                <td>{(g.attrs["member"] ?? []).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <Modal title="Create Group" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Name</label>
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
              <label>Description</label>
              <input
                type="text"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, description: e.target.value }))
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
        </Modal>
      )}
    </div>
  );
}
