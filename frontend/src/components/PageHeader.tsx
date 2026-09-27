import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";

export default function PageHeader({
  title,
  description,
  actions,
  back,
  leading,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  leading?: ReactNode;
}) {
  return (
    <header className="page-header">
      {back && (
        <Link to={back.to} className="back-link">
          <Icon name="arrowLeft" size={16} />
          {back.label}
        </Link>
      )}
      <div className="page-header-row">
        {leading}
        <div className="page-header-text">
          <h1>{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
