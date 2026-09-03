import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, listGroups } from "../api";
import { usePageTitle } from "../components/Layout";
import { CreateUserModal } from "../components/UserModals";

export default function Dashboard() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  usePageTitle("Dashboard");

  useEffect(() => {
    listUsers()
      .then((u) => setUserCount(u.length))
      .catch((e) => setError(String(e)));
    listGroups()
      .then((g) => setGroupCount(g.length))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      {error && <div className="error">{error}</div>}
      <div className="stat-grid">
        <Link to="/users" className="card-link">
          <div className="card">
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
              Users
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {userCount ?? "—"}
            </div>
          </div>
        </Link>
        <Link to="/groups" className="card-link">
          <div className="card">
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
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={() => listUsers().then((u) => setUserCount(u.length))}
        />
      )}
    </div>
  );
}
