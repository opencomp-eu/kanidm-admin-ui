import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState, createContext, useContext } from "react";
import { getWhoami, logout } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal } from "../types";
import ToastContainer, { useToasts } from "./Toast";

export interface ToastContextValue {
  addToast: (message: string, type?: "success" | "error") => void;
}

export const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Kanidm Admin` : "Kanidm Admin";
  }, [title]);
}

export default function Layout() {
  const [user, setUser] = useState<KanidmEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const { toasts, addToast, removeToast } = useToasts();

  useEffect(() => {
    getWhoami()
      .then((r) => setUser(r.youare))
      .catch(() => {
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
    <ToastContext.Provider value={{ addToast }}>
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
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}
