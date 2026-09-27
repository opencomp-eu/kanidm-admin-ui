import type { ReactNode } from "react";

export default function Card({
  title,
  description,
  actions,
  tone,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: "danger";
  children?: ReactNode;
}) {
  return (
    <section className={`card${tone ? ` card-${tone}` : ""}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="card-description">{description}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
