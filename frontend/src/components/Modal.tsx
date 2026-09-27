import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

export default function Modal({
  title,
  description,
  onClose,
  size = "md",
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus into the dialog for keyboard and screen-reader users, and give
  // it back to whatever opened the dialog once it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const firstField = dialog.querySelector<HTMLElement>("input, select, textarea");
      (firstField ?? dialog).focus();
    }
    return () => previouslyFocused?.focus?.();
  }, []);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p className="modal-description">{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
