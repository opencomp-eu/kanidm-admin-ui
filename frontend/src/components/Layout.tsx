import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getWhoami, logout } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal } from "../types";

export default function Layout() {
  const [user, setUser] = useState<KanidmEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    getWhoami()
      .then((r) => setUser(r.youare))
      .catch(() => {
        // Redirect to backend auth if not authenticated
        window.location.href = "/api/auth/login";
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/users", label: "Users" },
    { to: "/groups", label: "Groups" },
    { to: "/oauth2", label: "OAuth Apps" },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-title">Kanidm Admin</div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div style={{ padding: "20px", marginTop: "auto", fontSize: 12 }}>
            <div style={{ color: "var(--text-muted)" }}>Signed in as</div>
            <div style={{ color: "var(--text)", marginTop: 2 }}>
              {attrVal(user, "displayname") || attrVal(user, "name")}
            </div>
            <button
              className="btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => logout()}
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="main" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
