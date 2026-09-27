import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "./api";
import { useToast } from "./components/Toast";

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Kanidm Admin` : "Kanidm Admin";
  }, [title]);
}

/**
 * Loads data on mount (and when `deps` change). `reload` refreshes in the
 * background while keeping the current data on screen.
 */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const latestRequest = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++latestRequest.current;
    load()
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        setData(result);
        setError(null);
      })
      .catch((e) => {
        if (requestId === latestRequest.current) setError(e);
      });
  }, deps);

  useEffect(reload, [reload]);

  return { data, error, loading: data === null && error === null, reload };
}

/**
 * Wraps a mutation: tracks a busy flag, shows a success toast, and turns
 * failures into a friendly error toast. Resolves to whether it succeeded.
 */
export function useAction() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        if (successMessage) addToast(successMessage);
        return true;
      } catch (e) {
        addToast(friendlyError(e).message, "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addToast],
  );

  return { run, busy };
}
