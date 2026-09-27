import type { ReactNode } from "react";
import { friendlyError } from "../api";
import Icon from "./Icon";
import type { IconName } from "./Icon";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon = "sparkles",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, detail } = friendlyError(error);
  return (
    <div className="banner banner-danger" role="alert">
      <Icon name="alert" size={18} />
      <div className="banner-body">
        <div>{message}</div>
        {detail && (
          <details className="banner-details">
            <summary>Technical details</summary>
            <code>{detail}</code>
          </details>
        )}
      </div>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Banner({
  tone = "info",
  icon = tone === "info" ? "info" : "alert",
  children,
}: {
  tone?: "info" | "warning" | "danger";
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`}>
      <Icon name={icon} size={18} />
      <div className="banner-body">{children}</div>
    </div>
  );
}
