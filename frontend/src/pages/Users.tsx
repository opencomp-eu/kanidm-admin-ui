import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listUsers } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, userDisplayName, userStatus } from "../types";
import { usePageTitle } from "../components/Layout";
import { CreateUserModal } from "../components/UserModals";

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<KanidmEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  usePageTitle("Users");

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

      {loading && users.length === 0 ? (
        <div className="loading">Loading...</div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <div>{search ? `No users matching "${search}"` : "No users yet"}</div>
          <p>
            {search
              ? "Try a different search term."
              : "Click Create User to add the first one."}
          </p>
        </div>
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
              <tr
                key={attrVal(u, "uuid")}
                className="row-link"
                onClick={() =>
                  navigate(`/users/${encodeURIComponent(attrVal(u, "name"))}`)
                }
              >
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
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}
