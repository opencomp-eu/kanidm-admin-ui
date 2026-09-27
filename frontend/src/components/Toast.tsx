import { createContext, useCallback, useContext, useState } from "react";
import Icon from "./Icon";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

export interface ToastContextValue {
  addToast: (message: string, type?: Toast["type"]) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type }]);
    // Errors usually need reading and acting on, so they stay up longer.
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      type === "error" ? 8000 : 3500,
    );
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

export default function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: number) => void;
}) {
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <Icon name={t.type === "success" ? "check" : "alert"} size={18} />
          <span>{t.message}</span>
          <button
            className="icon-btn"
            onClick={() => onRemove(t.id)}
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
