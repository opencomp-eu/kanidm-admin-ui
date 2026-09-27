import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getWhoami, logout } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, userDisplayName } from "../types";
import ToastContainer, { ToastContext, useToasts } from "./Toast";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import Avatar from "./Avatar";
import { LoadingState } from "./States";

const LINKS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/users", label: "People", icon: "people" },
  { to: "/groups", label: "Groups", icon: "groups" },
  { to: "/oauth2", label: "Apps", icon: "apps" },
];

export default function Layout() {
  const [user, setUser] = useState<KanidmEntry | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { toasts, addToast, removeToast } = useToasts();

  useEffect(() => {
    getWhoami()
      .then((r) => setUser(r.youare))
      .catch(() => {
        window.location.href = "/api/auth/login";
      });
  }, []);

  const handleSignOut = async () => {
    await logout();
    navigate("/signed-out");
  };

  if (!user) {
    return (
      <div className="fullscreen-center">
        <LoadingState label="Signing you in…" />
      </div>
    );
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <div className="brand-name">Accounts</div>
              <div className="brand-sub">People &amp; access</div>
            </div>
          </div>
          <nav aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon name={l.icon} size={18} />
                <span>{l.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-user">
            <Avatar name={userDisplayName(user)} seed={attrVal(user, "name")} size="sm" />
            <div className="sidebar-user-text">
              <div className="sidebar-user-name">{userDisplayName(user)}</div>
              <div className="sidebar-user-sub">Administrator</div>
            </div>
            <button className="icon-btn" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </aside>
        <main className="main" key={location.pathname}>
          <Outlet context={user} />
        </main>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}
