import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, listGroups } from "../api";

export default function Dashboard() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [error, setError] = useState("");

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
    </div>
  );
}
