import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listGroups } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal } from "../types";
import { usePageTitle } from "../components/Layout";
import { CreateGroupModal } from "../components/GroupModals";

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<KanidmEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
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
        <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}
